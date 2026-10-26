/**
 * TheftGuard AI — Database Persistence API Client
 *
 * Communicates with the FastAPI persistence endpoints via the Vite proxy (/ml -> http://127.0.0.1:8000).
 * Persistence endpoints operate under /v1 prefix:
 * - Screening batches: /v1/batches
 * - Field investigations: /v1/investigations
 * - Electricity bill extractions: /v1/bill-extractions
 *
 * Privacy & Security Notice:
 * - Browser clients never connect directly to PostgreSQL or Supabase.
 * - Raw OCR text and uploaded file binaries are NEVER transmitted or persisted.
 * - All mutations pass through server-side Pydantic v2 validation and transactional repositories.
 */

import { getSessionToken } from './supabaseClient.js'

export const DEFAULT_TIMEOUT_MS = 65000

export class DbApiError extends Error {
  constructor(message, { code = 'api_error', status = null, details = null } = {}) {
    super(message)
    this.name = 'DbApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/**
 * Maps frontend origin labels to database canonical values:
 * CHECK (origin IN ('screening', 'comparison', 'bill'))
 */
export const ORIGIN_MAP = {
  screening: 'screening',
  'model screening': 'screening',
  'ml screening': 'screening',
  'csv screening': 'screening',
  comparison: 'comparison',
  'consumption comparison': 'comparison',
  bill: 'bill',
  'electricity bill': 'bill',
  'bill upload': 'bill',
  ocr: 'bill',
}

export function normalizeOrigin(origin) {
  const clean = (origin || '').trim().toLowerCase()
  return ORIGIN_MAP[clean] || 'screening'
}

/**
 * Maps frontend category to backend review_category:
 * Literal["normal", "elevated", "review", "rejected", "unscored"]
 */
export function mapReviewCategory(cat, status) {
  if (status === 'rejected') return 'rejected'
  if (!cat || cat === 'unscored') return 'unscored'
  if (cat === 'none' || cat === 'normal') return 'normal'
  if (cat === 'elevated') return 'elevated'
  if (cat === 'review') return 'review'
  return 'normal'
}

/**
 * Abort-aware sleep helper for exponential backoff delays.
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DbApiError('Request cancelled.', { code: 'cancelled' }))
    }
    let onAbort = null
    const timer = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    onAbort = () => {
      clearTimeout(timer)
      reject(new DbApiError('Request cancelled.', { code: 'cancelled' }))
    }
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * Executes a single HTTP request attempt against persistence endpoints.
 */
async function executeSingleAttempt(
  url,
  {
    method = 'GET',
    body = null,
    signal = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers: customHeaders = {},
    requireAuth = false,
  } = {},
) {
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  let onParentAbort = null
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer)
      throw new DbApiError('Request cancelled.', { code: 'cancelled' })
    }
    onParentAbort = () => controller.abort()
    signal.addEventListener('abort', onParentAbort, { once: true })
  }

  const headers = { Accept: 'application/json', ...customHeaders }
  let payload = null
  if (body !== null) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  // Attach Supabase JWT Bearer token if available and request is directed to persistence endpoints
  if (!headers['Authorization'] && (url.startsWith('/ml/v1/') || url.startsWith('/v1/'))) {
    try {
      const token = await getSessionToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else if (requireAuth) {
        throw new DbApiError('Authentication required. Bearer token is missing.', {
          code: 'unauthorized',
          status: 401,
        })
      }
    } catch (err) {
      if (err instanceof DbApiError) {
        clearTimeout(timer)
        if (signal && onParentAbort) signal.removeEventListener('abort', onParentAbort)
        throw err
      }
      if (requireAuth) {
        clearTimeout(timer)
        if (signal && onParentAbort) signal.removeEventListener('abort', onParentAbort)
        throw new DbApiError('Authentication required. Failed to obtain session token.', {
          code: 'unauthorized',
          status: 401,
        })
      }
      // Continue unauthenticated if requireAuth is false (e.g. testing)
    }
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    })

    if (signal?.aborted || controller.signal.aborted) {
      throw new DbApiError('Request cancelled.', { code: 'cancelled' })
    }

    const text = await res.text()
    if (signal?.aborted || controller.signal.aborted) {
      throw new DbApiError('Request cancelled.', { code: 'cancelled' })
    }
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // Non-JSON response
    }

    if (!res.ok) {
      const errInfo = data?.error || (typeof data?.detail === 'object' ? data.detail?.error : null)
      const detailMsg = typeof data?.detail === 'string' ? data.detail : null

      let message = errInfo?.message || detailMsg
      if (!message) {
        if (res.status === 401) {
          message = 'Authentication required or session expired. Please sign in to access stored records.'
        } else if (res.status === 403) {
          message = 'You do not have permission to access or modify this record.'
        } else if (res.status === 409) {
          message = 'A conflict occurred with an existing database record.'
        } else if (res.status === 404) {
          message = 'The requested database record was not found.'
        } else if (res.status === 422) {
          message = 'Invalid data provided. Please verify required fields.'
        } else if (res.status === 503) {
          message = 'Database service is currently unavailable or unconfigured.'
        } else {
          message = `Database request failed with HTTP ${res.status}.`
        }
      }

      const code =
        errInfo?.code ||
        (res.status === 401
          ? 'unauthorized'
          : res.status === 403
            ? 'forbidden'
            : res.status === 409
              ? 'conflict'
              : res.status === 404
                ? 'not_found'
                : res.status === 422
                  ? 'validation_error'
                  : res.status === 503
                    ? 'database_unavailable'
                    : `http_${res.status}`)

      throw new DbApiError(message, {
        code,
        status: res.status,
        details: errInfo?.issues || data?.detail || data,
      })
    }

    return data
  } catch (err) {
    if (err instanceof DbApiError) throw err
    if (timedOut) {
      throw new DbApiError(`Database request timed out after ${timeoutMs}ms.`, { code: 'timeout' })
    }
    if (signal?.aborted || controller.signal.aborted) {
      throw new DbApiError('Request cancelled.', { code: 'cancelled' })
    }
    throw new DbApiError(
      'Could not connect to the backend persistence service. Check that the server is running.',
      { code: 'network_error', details: err?.message },
    )
  } finally {
    clearTimeout(timer)
    if (signal && onParentAbort) {
      signal.removeEventListener('abort', onParentAbort)
    }
  }
}

/**
 * Base JSON request wrapper for /ml persistence endpoints with automatic retries for idempotent queries.
 */
export async function requestJson(
  url,
  {
    method = 'GET',
    body = null,
    signal = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = {},
    requireAuth = false,
    maxRetries = method === 'GET' ? 2 : 0,
    retryDelayMs = 400,
  } = {},
) {
  let attempt = 0

  while (true) {
    try {
      return await executeSingleAttempt(url, {
        method,
        body,
        signal,
        timeoutMs,
        headers,
        requireAuth,
      })
    } catch (err) {
      // Do not retry cancelled requests
      if (signal?.aborted || err.code === 'cancelled') {
        throw err
      }

      // Check if error is transient / retryable (timeouts, network disconnects, 5xx server errors)
      // Permanent 4xx client errors (401, 403, 404, 409, 422) and non-idempotent writes are NOT retried
      const isRetryableError =
        err.code === 'timeout' ||
        err.code === 'network_error' ||
        (typeof err.status === 'number' && err.status >= 500 && err.status !== 501)

      const canRetry = attempt < maxRetries && isRetryableError

      if (!canRetry) {
        throw err
      }

      attempt++
      // Exponential backoff with small delay and jitter
      const backoff = retryDelayMs * Math.pow(2, attempt - 1) + Math.random() * (retryDelayMs * 0.5)
      await sleep(backoff, signal)
    }
  }
}

// =============================================================================
// 1. Screening Batches
// =============================================================================

/**
 * Persists a screening batch and all associated customer records atomically.
 *
 * @param {object} batchData
 * @param {string} batchData.fileName
 * @param {string} [batchData.fileHash]
 * @param {number} [batchData.totalRows]
 * @param {number} [batchData.scoredRows]
 * @param {number} [batchData.rejectedRows]
 * @param {number} [batchData.warningRows]
 * @param {string} [batchData.modelVersion]
 * @param {string} batchData.modelSha256
 * @param {string} [batchData.scoreNote]
 * @param {number} [batchData.thresholdElevated]
 * @param {number} [batchData.thresholdReview]
 * @param {Array<object>} batchData.records
 * @param {object} [options]
 * @returns {Promise<object>} ScreeningBatchDetailResponse
 */
export async function createBatch(batchData, options = {}) {
  const records = (batchData.records || []).map((r, i) => {
    const rawScore = r.score !== undefined ? r.score : r.model_score
    const numScore = rawScore !== null && Number.isFinite(Number(rawScore)) ? Number(rawScore) : null
    const status = r.status === 'rejected' ? 'rejected' : numScore !== null ? 'scored' : 'unscored'

    return {
      row_index: typeof r.row_index === 'number' ? r.row_index : i,
      customer_ref: String(r.id || r.customer_ref || `Row ${i + 1}`).slice(0, 128),
      status,
      model_score: numScore,
      predicted_label: typeof r.predicted_label === 'number' ? r.predicted_label : null,
      label_name: r.label_name === 'Normal' || r.label_name === 'Suspicious' ? r.label_name : null,
      review_category: mapReviewCategory(r.category || r.review_category, status),
      features: r.features || {},
      warnings: Array.isArray(r.warnings) ? r.warnings : [],
      errors: Array.isArray(r.errors) ? r.errors : [],
    }
  })

  const payload = {
    file_name: String(batchData.fileName || batchData.file_name || 'unnamed_batch.csv').slice(0, 255),
    file_hash: batchData.fileHash || batchData.file_hash || null,
    total_rows: typeof batchData.totalRows === 'number' ? batchData.totalRows : records.length,
    scored_rows:
      typeof batchData.scoredRows === 'number'
        ? batchData.scoredRows
        : records.filter((r) => r.status === 'scored').length,
    rejected_rows:
      typeof batchData.rejectedRows === 'number'
        ? batchData.rejectedRows
        : records.filter((r) => r.status === 'rejected').length,
    warning_rows:
      typeof batchData.warningRows === 'number'
        ? batchData.warningRows
        : records.filter((r) => r.warnings.length > 0).length,
    model_version: String(batchData.modelVersion || batchData.model_version || 'v1.0.0').slice(0, 32),
    model_sha256: String(batchData.modelSha256 || batchData.model_sha256 || 'unspecified_model_sha').slice(0, 64),
    score_note: String(batchData.scoreNote || batchData.score_note || 'Uncalibrated; not a probability').slice(0, 128),
    threshold_elevated:
      typeof batchData.thresholdElevated === 'number'
        ? batchData.thresholdElevated
        : typeof batchData.threshold_elevated === 'number'
          ? batchData.threshold_elevated
          : 0.3,
    threshold_review:
      typeof batchData.thresholdReview === 'number'
        ? batchData.thresholdReview
        : typeof batchData.threshold_review === 'number'
          ? batchData.threshold_review
          : 0.5,
    status: 'completed',
    records,
  }

  return requestJson('/ml/v1/batches', {
    method: 'POST',
    body: payload,
    ...options,
  })
}

/**
 * Lists historical screening batches with pagination.
 *
 * @param {object} [params]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {object} [options]
 * @returns {Promise<Array<object>>} List of ScreeningBatchSummaryResponse
 */
export async function listBatches({ limit = 50, offset = 0 } = {}, options = {}) {
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.min(100, limit))),
    offset: String(Math.max(0, offset)),
  })
  return requestJson(`/ml/v1/batches?${query.toString()}`, { method: 'GET', ...options })
}

/**
 * Retrieves a single batch and its associated screening records.
 *
 * @param {string} batchId UUID
 * @param {object} [params]
 * @param {number} [params.limit=100]
 * @param {number} [params.offset=0]
 * @param {object} [options]
 * @returns {Promise<object>} ScreeningBatchDetailResponse
 */
export async function getBatch(batchId, { limit = 100, offset = 0 } = {}, options = {}) {
  if (!batchId) throw new DbApiError('batchId is required', { code: 'validation_error' })
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.min(100, limit))),
    offset: String(Math.max(0, offset)),
  })
  return requestJson(`/ml/v1/batches/${encodeURIComponent(batchId)}?${query.toString()}`, {
    method: 'GET',
    ...options,
  })
}

/**
 * Retrieves a single batch and transparently fetches all of its paginated child records across pages.
 * Ensures batches with > 100 records are loaded completely without truncation.
 *
 * @param {string} batchId UUID
 * @param {object} [params]
 * @param {number} [params.pageSize=100]
 * @param {(progress: { loadedRows: number, totalRows: number, page: number }) => void} [params.onProgress]
 * @param {object} [options]
 * @returns {Promise<object>} ScreeningBatchDetailResponse with all records concatenated
 */
export async function getBatchWithAllRecords(batchId, { pageSize = 100, onProgress = null } = {}, options = {}) {
  if (!batchId) throw new DbApiError('batchId is required', { code: 'validation_error' })
  const limit = Math.max(1, Math.min(100, pageSize))
  let offset = 0

  const firstResponse = await getBatch(batchId, { limit, offset }, options)
  const totalRows = typeof firstResponse.total_rows === 'number' ? firstResponse.total_rows : 0
  const allRecords = Array.isArray(firstResponse.records) ? [...firstResponse.records] : []

  if (onProgress) {
    onProgress({ loadedRows: allRecords.length, totalRows, page: 1 })
  }

  while (allRecords.length < totalRows) {
    offset = allRecords.length
    const pageRes = await getBatch(batchId, { limit, offset }, options)
    const pageRecords = Array.isArray(pageRes.records) ? pageRes.records : []
    if (pageRecords.length === 0) {
      break // Empty page guard
    }
    allRecords.push(...pageRecords)
    if (onProgress) {
      onProgress({
        loadedRows: allRecords.length,
        totalRows,
        page: Math.floor(offset / limit) + 1,
      })
    }
    if (pageRecords.length < limit) {
      break // Last page guard
    }
  }

  return {
    ...firstResponse,
    records: allRecords,
  }
}

// =============================================================================
// 2. Investigations
// =============================================================================

/**
 * Lists investigation tickets with optional filtering.
 *
 * @param {object} [params]
 * @param {string} [params.status]
 * @param {string} [params.customerRef]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {object} [options]
 * @returns {Promise<Array<object>>}
 */
export async function listInvestigations({ status, customerRef, limit = 50, offset = 0 } = {}, options = {}) {
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.min(100, limit))),
    offset: String(Math.max(0, offset)),
  })
  if (status && status !== 'All') query.set('status', status)
  if (customerRef) query.set('customer_ref', customerRef)

  return requestJson(`/ml/v1/investigations?${query.toString()}`, { method: 'GET', ...options })
}

/**
 * Creates an investigation ticket in the database.
 *
 * @param {object} invData
 * @param {string} invData.customerRef
 * @param {string} [invData.origin='screening']
 * @param {string} invData.basis
 * @param {string} [invData.status='New']
 * @param {string} [invData.priority='Normal']
 * @param {string} [invData.assignee]
 * @param {string} [invData.notes]
 * @param {string} [invData.outcome]
 * @param {Array<object>} [invData.checklist]
 * @param {Array<object>} [invData.evidence]
 * @param {string} [invData.screeningRecordId]
 * @param {string} [invData.batchId]
 * @param {object} [options]
 * @returns {Promise<object>} InvestigationResponse
 */
export async function createInvestigation(invData, options = {}) {
  const customerRef = invData.customerRef || invData.customer_ref
  if (!customerRef) {
    throw new DbApiError('customerRef is required to create an investigation ticket.', { code: 'validation_error' })
  }
  const basis = invData.basis
  if (!basis) {
    throw new DbApiError('basis is required to create an investigation ticket.', { code: 'validation_error' })
  }

  const payload = {
    customer_ref: String(customerRef).slice(0, 128),
    origin: normalizeOrigin(invData.origin),
    basis: String(basis),
    status: invData.status || 'New',
    priority: invData.priority || 'Normal',
    assignee: invData.assignee ? String(invData.assignee).slice(0, 128) : null,
    notes: invData.notes || '',
    outcome: invData.outcome || null,
    checklist: Array.isArray(invData.checklist) ? invData.checklist : [],
    evidence: Array.isArray(invData.evidence) ? invData.evidence : [],
    screening_record_id: invData.screeningRecordId || invData.screening_record_id || null,
    batch_id: invData.batchId || invData.batch_id || null,
  }

  if (invData.ticketCode || invData.ticket_code) {
    payload.ticket_code = String(invData.ticketCode || invData.ticket_code).slice(0, 64)
  }

  return requestJson('/ml/v1/investigations', {
    method: 'POST',
    body: payload,
    ...options,
  })
}

/**
 * Retrieves a single investigation ticket by ID.
 *
 * @param {string} investigationId UUID
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function getInvestigation(investigationId, options = {}) {
  if (!investigationId) throw new DbApiError('investigationId is required', { code: 'validation_error' })
  return requestJson(`/ml/v1/investigations/${encodeURIComponent(investigationId)}`, {
    method: 'GET',
    ...options,
  })
}

/**
 * Updates mutable fields on an investigation ticket.
 *
 * @param {string} investigationId UUID
 * @param {object} patchData
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function updateInvestigation(investigationId, patchData, options = {}) {
  if (!investigationId) throw new DbApiError('investigationId is required', { code: 'validation_error' })

  const payload = {}
  if (patchData.status !== undefined) payload.status = patchData.status
  if (patchData.priority !== undefined) payload.priority = patchData.priority
  if (patchData.assignee !== undefined) payload.assignee = patchData.assignee || null
  if (patchData.notes !== undefined) payload.notes = patchData.notes
  if (patchData.outcome !== undefined) payload.outcome = patchData.outcome || null
  if (patchData.checklist !== undefined) payload.checklist = patchData.checklist
  if (patchData.evidence !== undefined) payload.evidence = patchData.evidence

  return requestJson(`/ml/v1/investigations/${encodeURIComponent(investigationId)}`, {
    method: 'PATCH',
    body: payload,
    ...options,
  })
}

/**
 * Deletes an investigation ticket.
 *
 * @param {string} investigationId UUID
 * @param {object} [options]
 * @returns {Promise<{ deleted: boolean, id: string }>}
 */
export async function deleteInvestigation(investigationId, options = {}) {
  if (!investigationId) throw new DbApiError('investigationId is required', { code: 'validation_error' })
  return requestJson(`/ml/v1/investigations/${encodeURIComponent(investigationId)}`, {
    method: 'DELETE',
    ...options,
  })
}

// =============================================================================
// 3. Bill Extractions
// =============================================================================

function parseDecimalOrNull(val) {
  if (val === null || val === undefined || val === '') return null
  const clean = String(val).replace(/,/g, '').trim()
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

function parseDateOrNull(val) {
  if (!val) return null
  const clean = String(val).trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null
}

/**
 * Persists electricity bill readings and discrepancy analysis.
 *
 * Privacy Audit:
 * - raw_ocr_text is STRICTLY excluded.
 * - Uploaded file binaries and image URLs are NEVER transmitted.
 *
 * @param {object} billData
 * @param {string} billData.consumerNumber
 * @param {string} [billData.discom]
 * @param {string} [billData.periodStart]
 * @param {string} [billData.periodEnd]
 * @param {string} [billData.billDate]
 * @param {string|number} [billData.previousReading]
 * @param {string|number} [billData.currentReading]
 * @param {string|number} [billData.unitsConsumed]
 * @param {string|number} [billData.calculatedUnits]
 * @param {string|number} [billData.billingDays]
 * @param {string|number} [billData.amountPayable]
 * @param {boolean} [billData.hasDiscrepancy]
 * @param {string} [billData.discrepancyWarning]
 * @param {string} [billData.rawBillingPeriod]
 * @param {string} [billData.rawBillDate]
 * @param {string} [billData.rawPreviousReading]
 * @param {string} [billData.rawCurrentReading]
 * @param {string} [billData.investigationId]
 * @param {object} [options]
 * @returns {Promise<object>} BillExtractionResponse
 */
export async function createBillExtraction(billData, options = {}) {
  const consumerNumber = billData.consumerNumber || billData.consumer_number
  if (!consumerNumber) {
    throw new DbApiError('consumerNumber is required to persist bill extraction.', { code: 'validation_error' })
  }

  const payload = {
    consumer_number: String(consumerNumber).slice(0, 64),
    discom: billData.discom ? String(billData.discom).slice(0, 32) : null,
    period_start: parseDateOrNull(billData.periodStart || billData.period_start),
    period_end: parseDateOrNull(billData.periodEnd || billData.period_end),
    bill_date: parseDateOrNull(billData.billDate || billData.bill_date),
    previous_reading: parseDecimalOrNull(billData.previousReading ?? billData.previous_reading),
    current_reading: parseDecimalOrNull(billData.currentReading ?? billData.current_reading),
    units_consumed: parseDecimalOrNull(billData.unitsConsumed ?? billData.units_consumed),
    calculated_units: parseDecimalOrNull(billData.calculatedUnits ?? billData.calculated_units),
    billing_days:
      billData.billingDays || billData.billing_days
        ? parseInt(billData.billingDays || billData.billing_days, 10) || null
        : null,
    amount_payable: parseDecimalOrNull(billData.amountPayable ?? billData.amount_payable),
    has_discrepancy: Boolean(billData.hasDiscrepancy ?? billData.has_discrepancy),
    discrepancy_warning: billData.discrepancyWarning || billData.discrepancy_warning || null,
    raw_billing_period: billData.rawBillingPeriod || billData.raw_billing_period || billData.billingPeriod || null,
    raw_bill_date: billData.rawBillDate || billData.raw_bill_date || billData.billDate || null,
    raw_previous_reading:
      billData.rawPreviousReading || billData.raw_previous_reading || String(billData.previousReading || '') || null,
    raw_current_reading:
      billData.rawCurrentReading || billData.raw_current_reading || String(billData.currentReading || '') || null,
    investigation_id: billData.investigationId || billData.investigation_id || null,
  }

  return requestJson('/ml/v1/bill-extractions', {
    method: 'POST',
    body: payload,
    ...options,
  })
}

/**
 * Lists persisted bill extractions with optional filtering.
 *
 * @param {object} [params]
 * @param {string} [params.consumerNumber]
 * @param {string} [params.investigationId]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {object} [options]
 * @returns {Promise<Array<object>>}
 */
export async function listBillExtractions(
  { consumerNumber, investigationId, limit = 50, offset = 0 } = {},
  options = {},
) {
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.min(100, limit))),
    offset: String(Math.max(0, offset)),
  })
  if (consumerNumber) query.set('consumer_number', consumerNumber)
  if (investigationId) query.set('investigation_id', investigationId)

  return requestJson(`/ml/v1/bill-extractions?${query.toString()}`, { method: 'GET', ...options })
}
