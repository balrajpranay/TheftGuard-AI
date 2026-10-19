/**
 * TheftGuard AI — ML Service API Client
 *
 * Communicates with the S1 FastAPI ML service via the Vite proxy (/ml -> http://127.0.0.1:8000).
 * Supports /v1/health, /v1/model-metadata, and chunked /v1/predict-batch.
 */

const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_CHUNK_SIZE = 1000

export class MlApiError extends Error {
  constructor(message, { code = 'api_error', status = null, details = null } = {}) {
    super(message)
    this.name = 'MlApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

async function requestJson(url, { method = 'GET', body = null, signal = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer)
      throw new MlApiError('Request cancelled.', { code: 'cancelled' })
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const headers = { Accept: 'application/json' }
  let payload = null
  if (body !== null) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    })

    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // Non-JSON response
    }

    if (!res.ok) {
      const errInfo = data?.error
      const message =
        errInfo?.message ||
        (res.status === 503
          ? 'ML service is unavailable. Check that the service and model are loaded.'
          : res.status === 413
            ? 'Request payload too large for ML service.'
            : res.status === 404
              ? 'ML endpoint not found.'
              : `ML service request failed with HTTP ${res.status}`)

      throw new MlApiError(message, {
        code: errInfo?.code || `http_${res.status}`,
        status: res.status,
        details: errInfo?.issues || data,
      })
    }

    return data
  } catch (err) {
    if (err instanceof MlApiError) throw err
    if (timedOut) {
      throw new MlApiError(`ML request timed out after ${timeoutMs}ms. Check that the ML service is responsive.`, {
        code: 'timeout',
      })
    }
    if (signal?.aborted || controller.signal.aborted) {
      throw new MlApiError('Request cancelled.', { code: 'cancelled' })
    }
    throw new MlApiError(
      'Could not connect to the ML service. Ensure the service is running at http://127.0.0.1:8000.',
      { code: 'network_error', details: err?.message },
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Checks health of the ML service.
 * @returns {Promise<{ status: string, model_loaded: boolean, model_sha256_verified: boolean }>}
 */
export async function getHealth(options = {}) {
  return requestJson('/ml/v1/health', { method: 'GET', ...options })
}

/**
 * Retrieves metadata for the trained model.
 * @returns {Promise<object>}
 */
export async function getModelMetadata(options = {}) {
  return requestJson('/ml/v1/model-metadata', { method: 'GET', ...options })
}

/**
 * Scores a collection of customer rows in chunks using the batch endpoint.
 *
 * @param {Array<{ ref?: string, id?: string, features: object }>} rows
 * @param {object} options
 * @param {number} [options.chunkSize=1000]
 * @param {number} [options.timeoutMs=30000]
 * @param {AbortSignal} [options.signal]
 * @param {(progress: { completedRows: number, totalRows: number, chunkIndex: number, totalChunks: number }) => void} [options.onProgress]
 * @returns {Promise<{
 *   total: number,
 *   scored: number,
 *   rejected: number,
 *   model_sha256: string,
 *   score_note: string,
 *   results: Array<{
 *     index: number,
 *     ref: string,
 *     ok: boolean,
 *     predicted_label?: number,
 *     label_name?: string,
 *     model_score?: number,
 *     warnings?: Array<object>,
 *     errors?: Array<object>,
 *     errors_truncated?: boolean
 *   }>
 * }>}
 */
export async function predictBatch(rows, options = {}) {
  const { chunkSize = DEFAULT_CHUNK_SIZE, timeoutMs = DEFAULT_TIMEOUT_MS, signal = null, onProgress = null } = options

  const totalRows = rows.length
  if (totalRows === 0) {
    return { total: 0, scored: 0, rejected: 0, model_sha256: '', score_note: '', results: [] }
  }

  const chunks = []
  for (let i = 0; i < totalRows; i += chunkSize) {
    chunks.push({
      startIdx: i,
      items: rows.slice(i, i + chunkSize),
    })
  }

  const totalChunks = chunks.length
  let totalScored = 0
  let totalRejected = 0
  let modelSha = ''
  let scoreNote = ''
  const combinedResults = new Array(totalRows)

  for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
    if (signal?.aborted) {
      throw new MlApiError('Scoring cancelled.', { code: 'cancelled' })
    }

    const { startIdx, items } = chunks[cIdx]
    const payload = {
      rows: items.map((r, i) => {
        const rawRef = r.ref || r.id || `Row ${startIdx + i + 1}`
        return {
          ref: String(rawRef).slice(0, 64),
          features: r.features,
        }
      }),
    }

    const res = await requestJson('/ml/v1/predict-batch', {
      method: 'POST',
      body: payload,
      signal,
      timeoutMs,
    })

    modelSha = res.model_sha256 || modelSha
    scoreNote = res.score_note || scoreNote
    totalScored += res.scored || 0
    totalRejected += res.rejected || 0

    if (Array.isArray(res.results)) {
      res.results.forEach((item, localIdx) => {
        const globalIdx = startIdx + (typeof item.index === 'number' ? item.index : localIdx)
        combinedResults[globalIdx] = {
          ...item,
          index: globalIdx,
          ref: items[localIdx]?.ref || items[localIdx]?.id || item.ref,
        }
      })
    }

    if (onProgress) {
      onProgress({
        completedRows: Math.min(startIdx + items.length, totalRows),
        totalRows,
        chunkIndex: cIdx + 1,
        totalChunks,
      })
    }
  }

  return {
    total: totalRows,
    scored: totalScored,
    rejected: totalRejected,
    model_sha256: modelSha,
    score_note: scoreNote,
    results: combinedResults,
  }
}
