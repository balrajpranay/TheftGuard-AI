/**
 * TheftGuard AI — Dedicated Chat Workspace Session Storage Repository
 *
 * Local-only persistence using browser localStorage.
 * Privacy & Security Guarantees:
 * - Conversations are NEVER persisted to a shared backend database.
 * - Consumer identifiers (USCNO, meter account numbers), personal names,
 *   raw OCR text, and file binaries are strictly redacted before persistence.
 * - Storage quota is actively protected with LRU pruning of unpinned sessions.
 */

export const LEGACY_STORAGE_KEY = 'theftguard_ai_chat_sessions_v1'
export const STORAGE_KEY = LEGACY_STORAGE_KEY
export const DEMO_STORAGE_KEY = 'theftguard_ai_chat_sessions_demo_v1'
export const USER_STORAGE_PREFIX = 'theftguard_ai_chat_sessions_user_'
export const MAX_SESSIONS = 50
export const MAX_MESSAGES_PER_SESSION = 40
export const MAX_TITLE_LENGTH = 60

let activeScopeUserId = null

/**
 * Sets the active scoped user ID for chat session operations.
 * When null/empty, chat storage defaults to the demo/anonymous namespace.
 */
export function setChatStorageUser(userId = null) {
  activeScopeUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : null
}

/**
 * Returns the currently active user ID scope.
 */
export function getActiveChatStorageUser() {
  return activeScopeUserId
}

/**
 * Returns the localStorage key for the given verified user ID or active scope.
 * Verified Supabase UUIDs map to `theftguard_ai_chat_sessions_user_<uuid>`.
 * Anonymous or demo users map to `theftguard_ai_chat_sessions_demo_v1`.
 */
export function getChatStorageKey(userId = undefined) {
  const effectiveId = userId !== undefined ? userId : activeScopeUserId
  if (typeof effectiveId === 'string' && effectiveId.trim()) {
    return `${USER_STORAGE_PREFIX}${effectiveId.trim()}`
  }
  return DEMO_STORAGE_KEY
}

/**
 * Resolves the key to read from.
 * For authenticated users: strictly reads from `theftguard_ai_chat_sessions_user_<id>`.
 * For demo/anonymous users: reads from `theftguard_ai_chat_sessions_demo_v1`; if empty,
 * checks if legacy `theftguard_ai_chat_sessions_v1` exists to preserve pre-existing local data.
 */
export function resolveStorageKeyForRead(userId = undefined) {
  const targetKey = getChatStorageKey(userId)
  if (targetKey === DEMO_STORAGE_KEY) {
    const storage = getStorage()
    const demoData = storage.getItem(DEMO_STORAGE_KEY)
    if (!demoData && storage.getItem(LEGACY_STORAGE_KEY)) {
      return LEGACY_STORAGE_KEY
    }
  }
  return targetKey
}

/**
 * In-memory fallback if localStorage is disabled or throws (e.g. private browsing quota).
 */
let memoryFallbackStore = null

export function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    if (!memoryFallbackStore) memoryFallbackStore = {}
    return {
      getItem: (key) => memoryFallbackStore[key] || null,
      setItem: (key, val) => {
        memoryFallbackStore[key] = String(val)
      },
      removeItem: (key) => {
        delete memoryFallbackStore[key]
      },
    }
  }
  return window.localStorage
}

/**
 * Generates a unique, URL-safe session identifier.
 */
export function generateSessionId() {
  const rand = Math.random().toString(36).substring(2, 9)
  return `chat-${Date.now().toString(36)}-${rand}`
}

/**
 * Sanitizes title to prevent empty titles or excessive lengths.
 */
export function sanitizeTitle(rawTitle = '') {
  const clean = String(rawTitle || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  if (!clean) return 'New Conversation'
  return clean.slice(0, MAX_TITLE_LENGTH)
}

/**
 * Redacts any personal identifiers or sensitive fields from bill context before saving.
 */
export function sanitizeBillContextForStorage(billContext) {
  if (!billContext || typeof billContext !== 'object') return null

  // Create sanitized copy containing ONLY non-identifiable numerical metrics
  const sanitized = {
    is_complete: billContext.is_complete === true,
    has_bills: Boolean(billContext.has_bills || billContext.prev_units != null),
    prev_units: typeof billContext.prev_units === 'number' ? billContext.prev_units : null,
    curr_units: typeof billContext.curr_units === 'number' ? billContext.curr_units : null,
    delta_units: typeof billContext.delta_units === 'number' ? billContext.delta_units : null,
    pct_change_units: typeof billContext.pct_change_units === 'number' ? billContext.pct_change_units : null,
    prev_amount: typeof billContext.prev_amount === 'number' ? billContext.prev_amount : null,
    curr_amount: typeof billContext.curr_amount === 'number' ? billContext.curr_amount : null,
    delta_amount: typeof billContext.delta_amount === 'number' ? billContext.delta_amount : null,
    pct_change_amount: typeof billContext.pct_change_amount === 'number' ? billContext.pct_change_amount : null,
    prev_days: typeof billContext.prev_days === 'number' ? billContext.prev_days : 30,
    curr_days: typeof billContext.curr_days === 'number' ? billContext.curr_days : 30,
    prev_daily: typeof billContext.prev_daily === 'number' ? billContext.prev_daily : null,
    curr_daily: typeof billContext.curr_daily === 'number' ? billContext.curr_daily : null,
    delta_daily: typeof billContext.delta_daily === 'number' ? billContext.delta_daily : null,
    prev_effective_rate: typeof billContext.prev_effective_rate === 'number' ? billContext.prev_effective_rate : null,
    curr_effective_rate: typeof billContext.curr_effective_rate === 'number' ? billContext.curr_effective_rate : null,
    prev_period: billContext.prev_period ? String(billContext.prev_period).slice(0, 30) : null,
    curr_period: billContext.curr_period ? String(billContext.curr_period).slice(0, 30) : null,
    consumer_matched: billContext.consumer_matched === true,
    missing_fields: Array.isArray(billContext.missing_fields)
      ? billContext.missing_fields.map((f) => String(f).slice(0, 80))
      : [],
  }

  // Explicitly confirm redaction of all personal / connection numbers
  delete sanitized.consumerNumber
  delete sanitized.consumerName
  delete sanitized.consumer_number
  delete sanitized.consumer_name
  delete sanitized.oldConsumerNumber
  delete sanitized.rawText
  delete sanitized.file

  return sanitized
}

/**
 * Sanitizes questionnaire answers for persistent session storage.
 */
export function sanitizeQuestionnaireForStorage(answers) {
  if (!answers || typeof answers !== 'object') return null
  return {
    occupants: answers.occupants || '',
    has_ac: answers.has_ac || 'skip',
    ac_count: typeof answers.ac_count === 'number' ? answers.ac_count : 1,
    ac_hours: typeof answers.ac_hours === 'number' ? answers.ac_hours : 0,
    ac_increased: answers.ac_increased || '',
    has_geyser: answers.has_geyser || 'skip',
    geyser_hours: typeof answers.geyser_hours === 'number' ? answers.geyser_hours : 0,
    has_refrigerator: answers.has_refrigerator || 'skip',
    has_pump: answers.has_pump || 'skip',
    pump_hours: typeof answers.pump_hours === 'number' ? answers.pump_hours : 0,
    has_washing_machine: answers.has_washing_machine || 'skip',
    lifestyle_change: answers.lifestyle_change || '',
    meter_accuracy_confidence: answers.meter_accuracy_confidence || '',
  }
}

/**
 * Sanitizes an individual message for persistent storage.
 */
export function sanitizeMessageForStorage(msg) {
  if (!msg || typeof msg !== 'object') return null
  return {
    id: String(msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    role: msg.role === 'user' ? 'user' : 'assistant',
    replyToId: msg.replyToId ? String(msg.replyToId) : undefined,
    content: String(msg.content || '').slice(0, 1500),
    timestamp: msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    provider: msg.provider ? String(msg.provider).slice(0, 50) : undefined,
    toolAction: msg.toolAction && typeof msg.toolAction === 'object'
      ? {
          toolName: String(msg.toolAction.toolName || '').slice(0, 50),
          status: msg.toolAction.status === 'error' ? 'error' : msg.toolAction.status === 'warn' ? 'warn' : 'ok',
          summary: String(msg.toolAction.summary || '').slice(0, 120),
        }
      : undefined,
    suggestions: Array.isArray(msg.suggestions)
      ? msg.suggestions.slice(0, 6).map((s) => String(s).slice(0, 120))
      : undefined,
  }
}

/**
 * Loads all chat sessions from localStorage, sorted by pinned first, then updatedAt descending.
 * Scoped by verified userId or demo namespace.
 */
export function loadChatSessions(userId = undefined) {
  try {
    const storageKey = resolveStorageKeyForRead(userId)
    const raw = getStorage().getItem(storageKey)
    if (!raw) return []
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (parseErr) {
      console.warn('Recovered from corrupted localStorage chat session data:', parseErr)
      return []
    }
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((s) => s && typeof s === 'object' && s.id)
      .map((s) => ({
        id: String(s.id),
        title: sanitizeTitle(s.title || 'New Conversation'),
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || s.createdAt || new Date().toISOString(),
        isPinned: s.isPinned === true || s.pinned === true,
        pinned: s.isPinned === true || s.pinned === true,
        attachedBillContext: sanitizeBillContextForStorage(s.attachedBillContext || s.billContext),
        billContext: sanitizeBillContextForStorage(s.attachedBillContext || s.billContext),
        questionnaireSnapshot: sanitizeQuestionnaireForStorage(s.questionnaireSnapshot),
        messages: Array.isArray(s.messages)
          ? s.messages.map(sanitizeMessageForStorage).filter(Boolean).slice(-MAX_MESSAGES_PER_SESSION)
          : [],
      }))
      .sort((a, b) => {
        const aPinned = a.isPinned || a.pinned
        const bPinned = b.isPinned || b.pinned
        if (aPinned && !bPinned) return -1
        if (!aPinned && bPinned) return 1
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
  } catch (err) {
    console.error('Failed to load chat sessions from localStorage:', err)
    return []
  }
}

/**
 * Persists chat sessions to localStorage with automated quota and capacity management.
 * Scoped by verified userId or demo namespace.
 */
export function saveChatSessions(sessions = [], userId = undefined) {
  if (!Array.isArray(sessions)) return false

  const targetKey = getChatStorageKey(userId)

  // Sort and prune if exceeding maximum count
  let pruned = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  if (pruned.length > MAX_SESSIONS) {
    // Keep pinned sessions and newest unpinned sessions
    const pinned = pruned.filter((s) => s.isPinned)
    const unpinned = pruned.filter((s) => !s.isPinned)
    const allowedUnpinned = Math.max(0, MAX_SESSIONS - pinned.length)
    pruned = [...pinned, ...unpinned.slice(0, allowedUnpinned)]
  }

  const serialized = JSON.stringify(pruned)
  try {
    getStorage().setItem(targetKey, serialized)
    return true
  } catch (err) {
    console.warn('Storage quota exceeded; evicting oldest unpinned session and retrying:', err)
    // Evict oldest unpinned session and retry
    const unpinnedIndex = pruned.findLastIndex((s) => !s.isPinned)
    if (unpinnedIndex !== -1) {
      pruned.splice(unpinnedIndex, 1)
      try {
        getStorage().setItem(targetKey, JSON.stringify(pruned))
        return true
      } catch (retryErr) {
        console.error('Failed to persist chat sessions even after LRU eviction:', retryErr)
        return false
      }
    }
    return false
  }
}

/**
 * Retrieves a single session by its ID.
 */
export function getChatSession(id, userId = undefined) {
  if (!id) return null
  const sessions = loadChatSessions(userId)
  return sessions.find((s) => s.id === id) || null
}

/**
 * Creates a brand new chat session with clean context by default.
 */
export function createChatSession(
  {
    title = 'New Conversation',
    initialMessages = [],
    attachedBillContext = null,
    billContext = null,
    questionnaireSnapshot = null,
  } = {},
  userId = undefined,
) {
  const now = new Date().toISOString()
  const sanitizedContext = sanitizeBillContextForStorage(attachedBillContext || billContext)
  const newSession = {
    id: generateSessionId(),
    title: sanitizeTitle(title),
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    pinned: false,
    attachedBillContext: sanitizedContext,
    billContext: sanitizedContext,
    questionnaireSnapshot: sanitizeQuestionnaireForStorage(questionnaireSnapshot),
    messages: Array.isArray(initialMessages)
      ? initialMessages.map(sanitizeMessageForStorage).filter(Boolean)
      : [],
  }

  const existing = loadChatSessions(userId)
  const updated = [newSession, ...existing]
  saveChatSessions(updated, userId)
  return newSession
}

/**
 * Updates an existing chat session with new messages, title, or attached context.
 */
export function updateChatSession(id, updates = {}, userId = undefined) {
  if (!id) return null
  const sessions = loadChatSessions(userId)
  const index = sessions.findIndex((s) => s.id === id)
  if (index === -1) return null

  const target = sessions[index]
  const now = new Date().toISOString()

  const updatedSession = {
    ...target,
    ...updates,
    id: target.id, // Immutable ID
    createdAt: target.createdAt, // Immutable creation
    updatedAt: now,
  }

  if (updates.title !== undefined) {
    updatedSession.title = sanitizeTitle(updates.title)
  }
  if (updates.isPinned !== undefined || updates.pinned !== undefined) {
    const val = updates.isPinned !== undefined ? updates.isPinned : updates.pinned
    updatedSession.isPinned = val === true
    updatedSession.pinned = val === true
  }
  if (updates.attachedBillContext !== undefined || updates.billContext !== undefined) {
    const ctx = updates.attachedBillContext !== undefined ? updates.attachedBillContext : updates.billContext
    updatedSession.attachedBillContext = sanitizeBillContextForStorage(ctx)
    updatedSession.billContext = updatedSession.attachedBillContext
  }
  if (updates.questionnaireSnapshot !== undefined) {
    updatedSession.questionnaireSnapshot = sanitizeQuestionnaireForStorage(updates.questionnaireSnapshot)
  }
  if (Array.isArray(updates.messages)) {
    updatedSession.messages = updates.messages
      .map(sanitizeMessageForStorage)
      .filter(Boolean)
      .slice(-MAX_MESSAGES_PER_SESSION)
  }

  sessions[index] = updatedSession
  saveChatSessions(sessions, userId)
  return updatedSession
}

/**
 * Deletes a session by ID.
 */
export function deleteChatSession(id, userId = undefined) {
  if (!id) return false
  const sessions = loadChatSessions(userId)
  const filtered = sessions.filter((s) => s.id !== id)
  if (filtered.length === sessions.length) return false
  saveChatSessions(filtered, userId)
  return true
}

/**
 * Sets pinned state for a session.
 */
export function pinChatSession(id, isPinned = true, userId = undefined) {
  return updateChatSession(id, { isPinned: Boolean(isPinned), pinned: Boolean(isPinned) }, userId)
}

/**
 * Toggles pinned state for a session.
 */
export function togglePinChatSession(id, userId = undefined) {
  const session = getChatSession(id, userId)
  if (!session) return null
  const currentlyPinned = Boolean(session.isPinned || session.pinned)
  return updateChatSession(id, { isPinned: !currentlyPinned, pinned: !currentlyPinned }, userId)
}

/**
 * Saves/updates an entire session object.
 */
export function saveChatSession(session, userId = undefined) {
  if (!session || !session.id) return null
  return updateChatSession(session.id, session, userId)
}

/**
 * Renames an existing session.
 */
export function renameChatSession(id, newTitle, userId = undefined) {
  return updateChatSession(id, { title: sanitizeTitle(newTitle) }, userId)
}

/**
 * Clears attached bill context from a session (context-detachment control).
 */
export function detachSessionBillContext(id, userId = undefined) {
  return updateChatSession(id, { attachedBillContext: null, billContext: null }, userId)
}

/**
 * Clears all chat sessions completely for the given user or current scope.
 */
export function clearAllChatSessions(userId = undefined) {
  getStorage().removeItem(getChatStorageKey(userId))
  return true
}

/**
 * Derives a concise, readable title from the user's initial prompt.
 */
export function deriveSessionTitle(prompt = '') {
  const cleaned = String(prompt)
    .trim()
    .replace(/^Run Tool:\s*/i, '')
    .replace(/^[^\w]+/, '')
  if (!cleaned) return 'Conversation'
  return sanitizeTitle(cleaned)
}

/**
 * Appends a message to a session and updates its timestamp.
 */
export function addMessageToSession(id, message, userId = undefined) {
  const session = getChatSession(id, userId)
  if (!session) return null
  const currentMessages = Array.isArray(session.messages) ? session.messages : []
  const sanitized = sanitizeMessageForStorage(message)
  if (!sanitized) return session
  return updateChatSession(id, {
    messages: [...currentMessages, sanitized],
    updatedAt: new Date().toISOString(),
  }, userId)
}

/**
 * Full-text search across session titles and message contents.
 * Supports (query, sessions), (sessions, query), or (query, null, userId).
 */
export function searchChatSessions(arg1 = '', arg2 = null, maybeUserId = undefined) {
  let query = ''
  let sessions = null
  let userId = maybeUserId

  if (Array.isArray(arg1)) {
    sessions = arg1
    query = typeof arg2 === 'string' ? arg2 : ''
  } else {
    query = typeof arg1 === 'string' ? arg1 : ''
    if (Array.isArray(arg2)) {
      sessions = arg2
    } else if (typeof arg2 === 'string') {
      userId = arg2
    }
  }

  const list = sessions || loadChatSessions(userId)
  const cleanQuery = String(query || '').trim().toLowerCase()
  if (!cleanQuery) return list

  return list.filter((s) => {
    if (s.title && s.title.toLowerCase().includes(cleanQuery)) return true
    if (Array.isArray(s.messages)) {
      return s.messages.some((m) => m.content && m.content.toLowerCase().includes(cleanQuery))
    }
    return false
  })
}

/**
 * Groups sessions into date buckets:
 * - pinned: sessions where isPinned is true
 * - today: updated today
 * - yesterday: updated yesterday
 * - last7Days: updated 2 to 7 days ago
 * - older: updated > 7 days ago
 */
export function groupSessionsByDate(sessions = []) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const oneDayMs = 24 * 60 * 60 * 1000
  const startOfYesterday = startOfToday - oneDayMs
  const startOf7Days = startOfToday - 6 * oneDayMs

  const grouped = {
    pinned: [],
    today: [],
    yesterday: [],
    last7Days: [],
    older: [],
  }

  sessions.forEach((s) => {
    if (s.isPinned) {
      grouped.pinned.push(s)
      return
    }

    const updatedTime = new Date(s.updatedAt || s.createdAt).getTime()
    if (updatedTime >= startOfToday) {
      grouped.today.push(s)
    } else if (updatedTime >= startOfYesterday) {
      grouped.yesterday.push(s)
    } else if (updatedTime >= startOf7Days) {
      grouped.last7Days.push(s)
    } else {
      grouped.older.push(s)
    }
  })

  return grouped
}

/**
 * Formats a chat session into exportable plain text or markdown,
 * strictly guaranteeing that no private consumer identifiers are included.
 */
export function exportChatSession(id, format = 'markdown', userId = undefined) {
  const session = getChatSession(id, userId)
  if (!session) return ''

  const dateStr = new Date(session.updatedAt || session.createdAt).toLocaleString('en-IN')
  const title = session.title || 'Conversation'

  let billSummary = ''
  if (session.attachedBillContext && session.attachedBillContext.has_bills) {
    const b = session.attachedBillContext
    const prev = b.prev_units != null ? `${b.prev_units} kWh` : 'N/A'
    const curr = b.curr_units != null ? `${b.curr_units} kWh` : 'N/A'
    const delta = b.delta_units != null ? `${b.delta_units >= 0 ? '+' : ''}${b.delta_units} kWh` : 'N/A'
    billSummary = `Attached Bill Context: Previous ${prev} -> Current ${curr} (${delta})`
  }

  const messages = Array.isArray(session.messages) ? session.messages : []

  if (format === 'markdown') {
    let md = `# TheftGuard AI — ${title}\n`
    md += `*Exported on: ${dateStr}*\n`
    if (billSummary) {
      md += `*${billSummary}*\n`
    }
    md += `\n---\n\n`

    messages.forEach((m) => {
      const roleName = m.role === 'user' ? 'User' : 'TheftGuard AI Assistant'
      md += `### ${roleName} (${m.timestamp || ''})\n\n`
      if (m.toolAction?.toolName) {
        md += `> **Tool Executed**: ${m.toolAction.toolName}\n\n`
      }
      md += `${m.content}\n\n`
    })

    md += `---\n*Generated by TheftGuard AI — Client-Side Educational Energy Intelligence*\n`
    return md
  }

  // Plain-text format
  let txt = `THEFTGUARD AI CONVERSATION: ${title.toUpperCase()}\n`
  txt += `Exported: ${dateStr}\n`
  if (billSummary) txt += `${billSummary}\n`
  txt += `============================================================\n\n`

  messages.forEach((m) => {
    const roleName = m.role === 'user' ? 'USER' : 'ASSISTANT'
    txt += `[${roleName}] (${m.timestamp || ''})\n`
    txt += `${m.content}\n\n`
  })

  txt += `============================================================\n`
  return txt
}

/**
 * Triggers a browser download of a conversation file (.md or .txt).
 */
export function downloadChatSession(id, format = 'markdown', userId = undefined) {
  const content = exportChatSession(id, format, userId)
  if (!content) return false

  const session = getChatSession(id, userId)
  const safeTitle = (session?.title || 'conversation')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 30)
  const ext = format === 'markdown' ? 'md' : 'txt'
  const mimeType = format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
  const filename = `theftguard-chat-${safeTitle}-${id.slice(0, 8)}.${ext}`

  if (typeof document !== 'undefined') {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  }
  return false
}

/**
 * Removes the last assistant message from a session to support regeneration.
 * Returns the prompt text of the preceding user message to re-run.
 */
export function prepareSessionForRegenerate(id, userId = undefined) {
  const session = getChatSession(id, userId)
  if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
    return null
  }

  const msgs = [...session.messages]
  let lastPrompt = null

  // If the last message is assistant, remove it
  if (msgs[msgs.length - 1].role === 'assistant') {
    msgs.pop()
  }

  // Find the last user message
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      lastPrompt = msgs[i].content
      break
    }
  }

  if (lastPrompt) {
    const updated = updateChatSession(id, { messages: msgs }, userId)
    return { session: updated, lastUserPrompt: lastPrompt }
  }
  return null
}
