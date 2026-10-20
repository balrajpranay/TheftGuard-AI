/**
 * TheftGuard AI — Household Assistant API Client
 *
 * Communicates with the FastAPI assistant endpoint via the Vite proxy (/ml -> http://127.0.0.1:8000).
 * Endpoint specs:
 * - GET  /ml/v1/assistant/health
 * - POST /ml/v1/assistant/chat
 *
 * Privacy Guarantees:
 * - Request payloads strictly minimize data to numerical deltas, appliance usage, and billing period labels.
 * - Customer names, passwords, images, and raw account numbers are never transmitted to assistant endpoints.
 */

const DEFAULT_TIMEOUT_MS = 12000

export class AssistantApiError extends Error {
  constructor(message, { code = 'assistant_api_error', status = null, details = null } = {}) {
    super(message)
    this.name = 'AssistantApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/**
 * Strips identifiable customer metadata and bounds inputs before transmission.
 */
export function sanitizeAssistantRequest(payload) {
  const sanitized = {
    message: String(payload.message || '').trim().slice(0, 1500),
  }

  if (payload.bill_context) {
    const b = payload.bill_context
    sanitized.bill_context = {
      prev_units: b.prev_units != null ? Number(b.prev_units) : null,
      curr_units: b.curr_units != null ? Number(b.curr_units) : null,
      delta_units: b.delta_units != null ? Number(b.delta_units) : null,
      pct_change_units: b.pct_change_units != null ? Number(b.pct_change_units) : null,
      prev_days: b.prev_days != null ? Number(b.prev_days) : null,
      curr_days: b.curr_days != null ? Number(b.curr_days) : null,
      prev_daily: b.prev_daily != null ? Number(b.prev_daily) : null,
      curr_daily: b.curr_daily != null ? Number(b.curr_daily) : null,
      delta_daily: b.delta_daily != null ? Number(b.delta_daily) : null,
      prev_amount: b.prev_amount != null ? Number(b.prev_amount) : null,
      curr_amount: b.curr_amount != null ? Number(b.curr_amount) : null,
      delta_amount: b.delta_amount != null ? Number(b.delta_amount) : null,
      pct_change_amount: b.pct_change_amount != null ? Number(b.pct_change_amount) : null,
      prev_effective_rate: b.prev_effective_rate != null ? Number(b.prev_effective_rate) : null,
      curr_effective_rate: b.curr_effective_rate != null ? Number(b.curr_effective_rate) : null,
      prev_period: b.prev_period ? String(b.prev_period).slice(0, 50) : null,
      curr_period: b.curr_period ? String(b.curr_period).slice(0, 50) : null,
      consumer_matched: b.consumer_matched === true,
      is_complete: b.is_complete === true,
      has_bills: b.has_bills === true,
      ocr_processing: b.ocr_processing === true,
      missing_fields: Array.isArray(b.missing_fields)
        ? b.missing_fields.slice(0, 10).map((s) => String(s).slice(0, 100))
        : [],
    }
  }

  if (payload.questionnaire_answers) {
    const q = payload.questionnaire_answers
    sanitized.questionnaire_answers = {
      occupants: q.occupants ? String(q.occupants).slice(0, 50) : null,
      has_ac: q.has_ac ? String(q.has_ac).slice(0, 20) : null,
      ac_count: q.ac_count != null ? Number(q.ac_count) : null,
      ac_hours: q.ac_hours != null ? Number(q.ac_hours) : null,
      ac_increased: q.ac_increased ? String(q.ac_increased).slice(0, 50) : null,
      has_geyser: q.has_geyser ? String(q.has_geyser).slice(0, 20) : null,
      geyser_minutes: q.geyser_minutes != null ? Number(q.geyser_minutes) : null,
      has_refrigerator: q.has_refrigerator ? String(q.has_refrigerator).slice(0, 50) : null,
      has_pump: q.has_pump ? String(q.has_pump).slice(0, 50) : null,
      pump_hours: q.pump_hours != null ? Number(q.pump_hours) : null,
      lifestyle_change: q.lifestyle_change ? String(q.lifestyle_change).slice(0, 100) : null,
      meter_confidence: q.meter_confidence ? String(q.meter_confidence).slice(0, 50) : null,
    }
  }

  if (Array.isArray(payload.history)) {
    sanitized.history = payload.history.slice(-20).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '').slice(0, 1500),
    }))
  }

  return sanitized
}

/**
 * Checks health of the assistant backend endpoint.
 */
export async function getAssistantHealth(options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch('/ml/v1/assistant/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new AssistantApiError(`Health check returned status ${res.status}`, {
        status: res.status,
      })
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Sends a chat message and context to the assistant backend endpoint.
 */
export async function sendAssistantChat(payload, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort()
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  const sanitizedBody = sanitizeAssistantRequest(payload)

  try {
    const res = await fetch('/ml/v1/assistant/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(sanitizedBody),
      signal: controller.signal,
    })

    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // Non-JSON
    }

    if (!res.ok) {
      const msg = data?.detail || data?.error?.message || `Assistant request failed with HTTP ${res.status}`
      throw new AssistantApiError(msg, {
        status: res.status,
        details: data,
      })
    }

    return data
  } catch (err) {
    if (err instanceof AssistantApiError) throw err
    if (options.signal?.aborted) {
      throw new AssistantApiError('Request was stopped by user.', { code: 'cancelled' })
    }
    if (err.name === 'AbortError') {
      throw new AssistantApiError(`Assistant request timed out after ${timeoutMs}ms.`, { code: 'timeout' })
    }
    throw new AssistantApiError('Could not connect to the backend assistant endpoint.', {
      code: 'network_error',
      details: err?.message,
    })
  } finally {
    clearTimeout(timer)
  }
}
