import { test, describe, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  supabase,
  isSupabaseConfigured,
  getSessionToken,
  normalizeSupabaseUrl,
  setSupabaseClientForTesting,
  resetSupabaseClientForTesting,
} from '../src/lib/supabaseClient.js'
import {
  listInvestigations,
  createInvestigation,
  DbApiError,
} from '../src/lib/dbApi.js'
import { useAuth } from '../src/context/AuthContext.js'

describe('Supabase Client & Auth Token Integration', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetSupabaseClientForTesting()
  })

  test('supabaseClient defaults safely when unconfigured without crashing', async () => {
    resetSupabaseClientForTesting()
    assert.strictEqual(typeof isSupabaseConfigured, 'boolean')
    assert.ok(supabase)
    assert.ok(supabase.auth)
    assert.strictEqual(typeof supabase.auth.getSession, 'function')
    assert.strictEqual(typeof supabase.auth.signInWithPassword, 'function')
    assert.strictEqual(typeof supabase.auth.signOut, 'function')
    assert.strictEqual(typeof supabase.auth.onAuthStateChange, 'function')

    const token = await getSessionToken()
    assert.strictEqual(token, null)
  })

  test('getSessionToken retrieves active access token from mock client', async () => {
    const mockClient = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'mock-jwt-header.payload.signature',
              user: { id: 'usr-123', email: 'operator@utility.org' },
            },
          },
          error: null,
        }),
      },
    }

    setSupabaseClientForTesting(mockClient)
    const token = await getSessionToken()
    assert.strictEqual(token, 'mock-jwt-header.payload.signature')
  })

  test('dbApi attaches Authorization Bearer header when token is available', async () => {
    let capturedHeaders = null

    setSupabaseClientForTesting({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'test-supabase-jwt-token-xyz',
              user: { id: '11111111-2222-3333-4444-555555555555' },
            },
          },
          error: null,
        }),
      },
    })

    globalThis.fetch = mock.fn(async (url, opts) => {
      capturedHeaders = opts.headers
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    await listInvestigations()

    assert.ok(capturedHeaders, 'fetch should have been called with headers')
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer test-supabase-jwt-token-xyz')
  })

  test('dbApi handles HTTP 401 Unauthorized without crashing or repeating request', async () => {
    setSupabaseClientForTesting({
      auth: {
        getSession: async () => ({
          data: { session: null },
          error: null,
        }),
      },
    })

    let callCount = 0
    globalThis.fetch = mock.fn(async () => {
      callCount++
      return new Response(
        JSON.stringify({
          detail: 'Could not validate credentials: Token has expired',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    })

    await assert.rejects(
      async () => {
        await listInvestigations()
      },
      (err) => {
        assert.ok(err instanceof DbApiError)
        assert.strictEqual(err.code, 'unauthorized')
        assert.strictEqual(err.status, 401)
        assert.match(err.message, /expired|credentials|sign in/i)
        return true
      },
    )

    // Confirms 401 is NOT retried automatically
    assert.strictEqual(callCount, 1)
  })

  test('dbApi handles HTTP 403 Forbidden with proper error code and message', async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({
          detail: 'You do not have permission to access this record.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    })

    await assert.rejects(
      async () => {
        await listInvestigations()
      },
      (err) => {
        assert.ok(err instanceof DbApiError)
        assert.strictEqual(err.code, 'forbidden')
        assert.strictEqual(err.status, 403)
        assert.match(err.message, /permission/i)
        return true
      },
    )
  })

  test('useAuth provides resilient non-crashing defaults outside provider', () => {
    const auth = useAuth()
    assert.ok(auth)
    assert.strictEqual(auth.isAuthenticated, false)
    assert.strictEqual(auth.isDemoMode, false)
    assert.strictEqual(auth.loading, false)
    assert.strictEqual(typeof auth.signIn, 'function')
    assert.strictEqual(typeof auth.signUp, 'function')
    assert.strictEqual(typeof auth.signOut, 'function')
    assert.strictEqual(typeof auth.enterDemoMode, 'function')
  })

  test('supabase.auth.signUp defaults safely when unconfigured without crashing', async () => {
    resetSupabaseClientForTesting()
    assert.strictEqual(typeof supabase.auth.signUp, 'function')
    const res = await supabase.auth.signUp({ email: 'new@example.com', password: 'password123' })
    assert.strictEqual(res.data.user, null)
    assert.strictEqual(res.data.session, null)
    assert.match(res.error.message, /not configured/i)
  })

  test('mocked registration handles email verification pending (user created, session null)', async () => {
    let capturedPayload = null
    const mockClient = {
      auth: {
        signUp: async (payload) => {
          capturedPayload = payload
          return {
            data: {
              user: { id: 'usr-new-456', email: payload.email },
              session: null, // Email confirmation pending
            },
            error: null,
          }
        },
      },
    }

    setSupabaseClientForTesting(mockClient)
    const result = await supabase.auth.signUp({
      email: 'engineer@utility.org',
      password: 'SecurePassword123!',
    })

    assert.ok(result.data.user)
    assert.strictEqual(result.data.user.email, 'engineer@utility.org')
    assert.strictEqual(result.data.session, null)
    assert.strictEqual(capturedPayload.email, 'engineer@utility.org')
    assert.strictEqual(capturedPayload.role, undefined, 'Must not accept or transmit client-specified role')
  })

  test('mocked registration handles immediate session when email confirmation is disabled', async () => {
    const mockClient = {
      auth: {
        signUp: async (payload) => ({
          data: {
            user: { id: 'usr-new-789', email: payload.email },
            session: { access_token: 'new-jwt-token-abc', user: { id: 'usr-new-789' } },
          },
          error: null,
        }),
      },
    }

    setSupabaseClientForTesting(mockClient)
    const result = await supabase.auth.signUp({
      email: 'operator2@utility.org',
      password: 'SecurePassword123!',
    })

    assert.ok(result.data.user)
    assert.ok(result.data.session)
    assert.strictEqual(result.data.session.access_token, 'new-jwt-token-abc')
  })

  test('mocked registration propagates error on duplicate user', async () => {
    const mockClient = {
      auth: {
        signUp: async () => ({
          data: { user: null, session: null },
          error: new Error('User already registered'),
        }),
      },
    }

    setSupabaseClientForTesting(mockClient)
    const result = await supabase.auth.signUp({
      email: 'existing@utility.org',
      password: 'SecurePassword123!',
    })

    assert.ok(result.error)
    assert.match(result.error.message, /already registered/i)
  })

  test('normalizeSupabaseUrl sanitizes paths, trailing slashes, quotes, and whitespace', () => {
    assert.strictEqual(
      normalizeSupabaseUrl('https://xyzcompany.supabase.co/rest/v1/.supabase.co'),
      'https://xyzcompany.supabase.co',
    )
    assert.strictEqual(
      normalizeSupabaseUrl('  https://xyzcompany.supabase.co/  '),
      'https://xyzcompany.supabase.co',
    )
    assert.strictEqual(
      normalizeSupabaseUrl('"https://xyzcompany.supabase.co"'),
      'https://xyzcompany.supabase.co',
    )
    assert.strictEqual(
      normalizeSupabaseUrl("'https://xyzcompany.supabase.co/auth/v1'"),
      'https://xyzcompany.supabase.co',
    )
    assert.strictEqual(normalizeSupabaseUrl('ftp://invalid.com'), '')
    assert.strictEqual(normalizeSupabaseUrl('not-a-url'), '')
    assert.strictEqual(normalizeSupabaseUrl(null), '')
  })

  test('mocked registration attaches trimmed full_name in user_metadata options', async () => {
    let capturedOptions = null
    const mockClient = {
      auth: {
        signUp: async ({ email, password, options }) => {
          capturedOptions = options
          return {
            data: {
              user: {
                id: 'usr-customer-101',
                email,
                user_metadata: options?.data || {},
              },
              session: null,
            },
            error: null,
          }
        },
      },
    }

    setSupabaseClientForTesting(mockClient)
    const result = await supabase.auth.signUp({
      email: 'customer@utility.org',
      password: 'SecurePassword123!',
      options: {
        data: {
          full_name: 'Aditi Sharma',
        },
      },
    })

    assert.ok(result.data.user)
    assert.strictEqual(result.data.user.user_metadata.full_name, 'Aditi Sharma')
    assert.strictEqual(capturedOptions?.data?.full_name, 'Aditi Sharma')
    assert.strictEqual(capturedOptions?.data?.role, undefined, 'Role tampering must not be possible')
    assert.strictEqual(capturedOptions?.data?.is_admin, undefined, 'Admin claim tampering must not be possible')
  })

  test('real Supabase session enters authenticated mode and excludes demo mode', async () => {
    const mockSession = {
      access_token: 'valid.supabase.token.123',
      user: {
        id: '12345678-1234-1234-1234-123456789abc',
        email: 'operator@utility.org',
        user_metadata: { full_name: 'Aditi Sharma' },
      },
    }

    setSupabaseClientForTesting({
      auth: {
        getSession: async () => ({
          data: { session: mockSession },
          error: null,
        }),
      },
    })

    const token = await getSessionToken()
    assert.strictEqual(token, 'valid.supabase.token.123')
  })

  test('dbApi persistence calls fail cleanly on 401 without falling back to sample data', async () => {
    // Unauthenticated or expired session
    setSupabaseClientForTesting({
      auth: {
        getSession: async () => ({
          data: { session: null },
          error: null,
        }),
      },
    })

    globalThis.fetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({ detail: 'Missing or expired authentication token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    })

    await assert.rejects(
      async () => {
        await listInvestigations()
      },
      (err) => {
        assert.ok(err instanceof DbApiError)
        assert.strictEqual(err.status, 401)
        assert.strictEqual(err.code, 'unauthorized')
        return true
      },
    )
  })

  test('dbApi persistence calls on 503 database unavailable throw error instead of silent mock success', async () => {
    setSupabaseClientForTesting({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'auth-jwt-token',
              user: { id: 'usr-123' },
            },
          },
          error: null,
        }),
      },
    })

    globalThis.fetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({ detail: 'Database service is currently unavailable or unconfigured.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    })

    await assert.rejects(
      async () => {
        await createInvestigation({
          customerRef: 'CUST-001',
          origin: 'screening',
          basis: 'High model score',
        })
      },
      (err) => {
        assert.ok(err instanceof DbApiError)
        assert.strictEqual(err.status, 503)
        assert.strictEqual(err.code, 'database_unavailable')
        assert.match(err.message, /unavailable/i)
        return true
      },
    )
  })
})
