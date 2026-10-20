import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEGACY_STORAGE_KEY,
  DEMO_STORAGE_KEY,
  USER_STORAGE_PREFIX,
  STORAGE_KEY,
  MAX_SESSIONS,
  MAX_TITLE_LENGTH,
  sanitizeTitle,
  sanitizeBillContextForStorage,
  setChatStorageUser,
  getActiveChatStorageUser,
  getChatStorageKey,
  resolveStorageKeyForRead,
  getStorage,
  loadChatSessions,
  saveChatSessions,
  createChatSession,
  getChatSession,
  updateChatSession,
  deleteChatSession,
  pinChatSession,
  renameChatSession,
  detachSessionBillContext,
  clearAllChatSessions,
  searchChatSessions,
  groupSessionsByDate,
} from '../src/lib/chatSessionStorage.js'

describe('Dedicated Chat Workspace — Session Storage & Privacy Redaction', () => {
  beforeEach(() => {
    clearAllChatSessions()
  })

  it('creates a new session with clean context and default title', () => {
    const session = createChatSession()
    assert.ok(session.id.startsWith('chat-'))
    assert.equal(session.title, 'New Conversation')
    assert.equal(session.isPinned, false)
    assert.equal(session.attachedBillContext, null)
    assert.deepEqual(session.messages, [])

    const loaded = getChatSession(session.id)
    assert.equal(loaded?.id, session.id)
  })

  it('redacts consumer identifiers and private fields from bill context before saving', () => {
    const dirtyContext = {
      is_complete: true,
      has_bills: true,
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      prev_amount: 1480,
      curr_amount: 1725,
      consumerNumber: '100458921',
      consumerName: 'R. Sharma',
      consumer_number: '100458921',
      oldConsumerNumber: '99887766',
      rawText: 'TELANGANA SPOT BILLING RAW OCR DUMP...',
    }

    const sanitized = sanitizeBillContextForStorage(dirtyContext)
    assert.equal(sanitized.prev_units, 220)
    assert.equal(sanitized.curr_units, 245)
    assert.equal(sanitized.delta_units, 25)
    assert.equal(sanitized.prev_amount, 1480)
    assert.equal(sanitized.curr_amount, 1725)
    assert.equal(sanitized.consumerNumber, undefined)
    assert.equal(sanitized.consumerName, undefined)
    assert.equal(sanitized.consumer_number, undefined)
    assert.equal(sanitized.rawText, undefined)
  })

  it('sanitizes and truncates conversation titles to MAX_TITLE_LENGTH (60 chars)', () => {
    assert.equal(sanitizeTitle(''), 'New Conversation')
    assert.equal(sanitizeTitle('   '), 'New Conversation')
    assert.equal(sanitizeTitle('Valid Title'), 'Valid Title')
    const longTitle = 'Why is my electricity bill so high this month after installing three air conditioners in July?'
    const clean = sanitizeTitle(longTitle)
    assert.equal(clean.length, MAX_TITLE_LENGTH)
  })

  it('pins and unpins conversations, sorting pinned sessions first in loadChatSessions', () => {
    const s1 = createChatSession({ title: 'Conversation 1' })
    const s2 = createChatSession({ title: 'Conversation 2' })

    pinChatSession(s1.id, true)

    const loaded = loadChatSessions()
    assert.equal(loaded[0].id, s1.id)
    assert.equal(loaded[0].isPinned, true)

    pinChatSession(s1.id, false)
    const unpinned = getChatSession(s1.id)
    assert.equal(unpinned?.isPinned, false)
  })

  it('renames an existing conversation safely', () => {
    const s = createChatSession({ title: 'Initial' })
    const renamed = renameChatSession(s.id, 'Summer AC Cooling Review')
    assert.equal(renamed?.title, 'Summer AC Cooling Review')

    const reloaded = getChatSession(s.id)
    assert.equal(reloaded?.title, 'Summer AC Cooling Review')
  })

  it('deletes an existing conversation', () => {
    const s = createChatSession({ title: 'To Delete' })
    assert.ok(getChatSession(s.id))

    const deleted = deleteChatSession(s.id)
    assert.equal(deleted, true)
    assert.equal(getChatSession(s.id), null)
  })

  it('detaches bill context from session (context-detachment control)', () => {
    const s = createChatSession({
      title: 'Bill Discussion',
      attachedBillContext: {
        is_complete: true,
        prev_units: 220,
        curr_units: 245,
      },
    })

    assert.equal(s.attachedBillContext?.prev_units, 220)

    const detached = detachSessionBillContext(s.id)
    assert.equal(detached?.attachedBillContext, null)

    const reloaded = getChatSession(s.id)
    assert.equal(reloaded?.attachedBillContext, null)
  })

  it('searches sessions across title and message contents', () => {
    const s1 = createChatSession({
      title: 'Geyser Power Consumption',
      initialMessages: [
        { role: 'user', content: 'How many kWh does my water heater use?' },
        { role: 'assistant', content: 'A 2kW geyser consumes ~2.0 kWh per hour.' },
      ],
    })

    const s2 = createChatSession({
      title: 'Summer AC Billing',
      initialMessages: [
        { role: 'user', content: 'Why did my units jump by 25 kWh?' },
        { role: 'assistant', content: 'Running an AC for 8 hours daily accounts for ~228 units.' },
      ],
    })

    // Search by title
    const searchGeyser = searchChatSessions('geyser')
    assert.equal(searchGeyser.length, 1)
    assert.equal(searchGeyser[0].id, s1.id)

    // Search by message content
    const searchUnits = searchChatSessions('25 kWh')
    assert.equal(searchUnits.length, 1)
    assert.equal(searchUnits[0].id, s2.id)

    // Blank search returns all
    assert.equal(searchChatSessions('').length, 2)
  })

  it('groups sessions accurately by date buckets (pinned, today, yesterday, last7Days, older)', () => {
    const now = new Date()
    const oneDayMs = 24 * 60 * 60 * 1000

    const mockSessions = [
      {
        id: 'pinned-1',
        title: 'Pinned Chat',
        isPinned: true,
        updatedAt: now.toISOString(),
      },
      {
        id: 'today-1',
        title: 'Today Chat',
        isPinned: false,
        updatedAt: now.toISOString(),
      },
      {
        id: 'yesterday-1',
        title: 'Yesterday Chat',
        isPinned: false,
        updatedAt: new Date(now.getTime() - 1 * oneDayMs).toISOString(),
      },
      {
        id: 'week-1',
        title: '3 Days Ago Chat',
        isPinned: false,
        updatedAt: new Date(now.getTime() - 3 * oneDayMs).toISOString(),
      },
      {
        id: 'older-1',
        title: '10 Days Ago Chat',
        isPinned: false,
        updatedAt: new Date(now.getTime() - 10 * oneDayMs).toISOString(),
      },
    ]

    const grouped = groupSessionsByDate(mockSessions)
    assert.equal(grouped.pinned.length, 1)
    assert.equal(grouped.pinned[0].id, 'pinned-1')
    assert.equal(grouped.today.length, 1)
    assert.equal(grouped.today[0].id, 'today-1')
    assert.equal(grouped.yesterday.length, 1)
    assert.equal(grouped.yesterday[0].id, 'yesterday-1')
    assert.equal(grouped.last7Days.length, 1)
    assert.equal(grouped.last7Days[0].id, 'week-1')
    assert.equal(grouped.older.length, 1)
    assert.equal(grouped.older[0].id, 'older-1')
  })

  it('enforces maximum session count (50) and evicts oldest unpinned sessions', () => {
    const sessions = []
    for (let i = 0; i < 55; i++) {
      sessions.push({
        id: `session-${i}`,
        title: `Session ${i}`,
        isPinned: i === 0, // session-0 is pinned
        updatedAt: new Date(Date.now() - (55 - i) * 10000).toISOString(),
        messages: [],
      })
    }

    saveChatSessions(sessions)
    const loaded = loadChatSessions()
    assert.equal(loaded.length, MAX_SESSIONS)
    // Pinned session-0 must be preserved
    assert.ok(loaded.some((s) => s.id === 'session-0'))
  })

  it('generates distinct storage keys strictly based on verified user ID vs demo', () => {
    assert.equal(getChatStorageKey(null), DEMO_STORAGE_KEY)
    assert.equal(getChatStorageKey(undefined), DEMO_STORAGE_KEY)
    assert.equal(getChatStorageKey(''), DEMO_STORAGE_KEY)
    assert.equal(getChatStorageKey('   '), DEMO_STORAGE_KEY)
    assert.equal(
      getChatStorageKey('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'),
      'theftguard_ai_chat_sessions_user_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
    )

    setChatStorageUser('user-active-123')
    assert.equal(getActiveChatStorageUser(), 'user-active-123')
    assert.equal(getChatStorageKey(), 'theftguard_ai_chat_sessions_user_user-active-123')

    setChatStorageUser(null)
    assert.equal(getActiveChatStorageUser(), null)
    assert.equal(getChatStorageKey(), DEMO_STORAGE_KEY)
  })

  it('strictly isolates chat history between Account A and Account B', () => {
    const userA = 'user-uuid-aaaa-1111'
    const userB = 'user-uuid-bbbb-2222'

    // Clean initial state for both
    clearAllChatSessions(userA)
    clearAllChatSessions(userB)

    // User A creates two sessions
    const sessA1 = createChatSession({ title: 'User A Session 1' }, userA)
    const sessA2 = createChatSession({ title: 'User A Session 2' }, userA)

    // User B loads sessions: must be empty
    const userBSessions = loadChatSessions(userB)
    assert.equal(userBSessions.length, 0)
    assert.equal(getChatSession(sessA1.id, userB), null)

    // User B creates a session
    const sessB1 = createChatSession({ title: 'User B Private Session' }, userB)

    // Verify User A still only sees their 2 sessions
    const userASessions = loadChatSessions(userA)
    assert.equal(userASessions.length, 2)
    assert.ok(userASessions.some((s) => s.id === sessA1.id))
    assert.ok(userASessions.some((s) => s.id === sessA2.id))
    assert.ok(!userASessions.some((s) => s.id === sessB1.id))

    // Verify operations on User A do not affect User B
    renameChatSession(sessA1.id, 'User A Renamed', userA)
    assert.equal(getChatSession(sessA1.id, userA)?.title, 'User A Renamed')
    assert.equal(getChatSession(sessA1.id, userB), null)

    // User A clears all history: User B history remains intact
    clearAllChatSessions(userA)
    assert.equal(loadChatSessions(userA).length, 0)
    assert.equal(loadChatSessions(userB).length, 1)
    assert.equal(loadChatSessions(userB)[0].id, sessB1.id)
  })

  it('strictly isolates demo sessions from authenticated user accounts', () => {
    const verifiedUser = 'user-uuid-verified-9999'
    clearAllChatSessions(null)
    clearAllChatSessions(verifiedUser)

    // Create session in demo mode
    const demoSession = createChatSession({ title: 'Demo Exploration' }, null)

    // Authenticated user should NOT see demo session
    const authSessions = loadChatSessions(verifiedUser)
    assert.equal(authSessions.length, 0)
    assert.equal(getChatSession(demoSession.id, verifiedUser), null)

    // Authenticated user creates session
    const authSession = createChatSession({ title: 'Official Audit Log' }, verifiedUser)

    // Demo mode should NOT see authenticated user session
    const demoSessions = loadChatSessions(null)
    assert.equal(demoSessions.length, 1)
    assert.equal(demoSessions[0].id, demoSession.id)
    assert.ok(!demoSessions.some((s) => s.id === authSession.id))
  })

  it('preserves legacy local conversations in demo mode without leaking into real accounts', () => {
    const verifiedUser = 'user-uuid-fresh-new-acct'
    clearAllChatSessions(null)
    clearAllChatSessions(verifiedUser)

    // Simulate pre-existing legacy chat storage before per-account namespaces
    const legacySession = {
      id: 'chat-legacy-001',
      title: 'Pre-existing Legacy Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{ role: 'user', content: 'What is my tariff rate?' }],
    }
    const store = getStorage()
    store.setItem(LEGACY_STORAGE_KEY, JSON.stringify([legacySession]))
    store.removeItem(DEMO_STORAGE_KEY)
    store.removeItem(getChatStorageKey(verifiedUser))

    // Demo user reads fallback from legacy storage
    const demoLoaded = loadChatSessions(null)
    assert.equal(demoLoaded.length, 1)
    assert.equal(demoLoaded[0].id, 'chat-legacy-001')

    // Real authenticated user NEVER reads legacy fallback; starts clean
    const authLoaded = loadChatSessions(verifiedUser)
    assert.equal(authLoaded.length, 0)
  })
})
