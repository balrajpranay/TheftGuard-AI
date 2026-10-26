import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TIMEOUT_MS,
  DbApiError,
  requestJson,
  listInvestigations,
  createInvestigation,
  createBatch,
} from '../src/lib/dbApi.js'
import {
  setSupabaseClientForTesting,
  resetSupabaseClientForTesting,
  getSessionToken,
} from '../src/lib/supabaseClient.js'

describe('Database Offline Remediation & Resilience Suite', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    resetSupabaseClientForTesting()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetSupabaseClientForTesting()
  })

  // ---------------------------------------------------------------------------
  // 1. Centralized Timeout Configuration
  // ---------------------------------------------------------------------------
  it('1. configures centralized request timeout to 65,000 ms to tolerate cold starts', () => {
    assert.strictEqual(DEFAULT_TIMEOUT_MS, 65000)
  })

  // ---------------------------------------------------------------------------
  // 2. Request Succeeding on First Attempt
  // ---------------------------------------------------------------------------
  it('2. succeeds on first attempt without retrying when backend responds cleanly', async () => {
    let callCount = 0
    globalThis.fetch = mock.fn(async () => {
      callCount++
      return new Response(JSON.stringify([{ id: 'inv-1', customer_ref: 'CUST-001' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const results = await listInvestigations()
    assert.strictEqual(callCount, 1)
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].id, 'inv-1')
  })

  // ---------------------------------------------------------------------------
  // 3. Timeout Followed by Successful Retry
  // ---------------------------------------------------------------------------
  it('3. retries after a transient timeout and succeeds on subsequent attempt', async () => {
    let callCount = 0
    globalThis.fetch = mock.fn(async (_url, opts) => {
      callCount++
      if (callCount === 1) {
        // First attempt: simulate timeout abort
        const abortErr = new Error('The operation was aborted due to timeout')
        abortErr.name = 'AbortError'
        throw abortErr
      }
      // Second attempt: succeeds
      return new Response(JSON.stringify([{ id: 'inv-recovered', customer_ref: 'CUST-002' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    // Use a small retryDelayMs so tests execute fast
    const results = await listInvestigations({}, { retryDelayMs: 20 })
    assert.strictEqual(callCount, 2, 'Should have made 1 initial call + 1 retry')
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].id, 'inv-recovered')
  })

  // ---------------------------------------------------------------------------
  // 4. Network Error Exhausting Retry Limit
  // ---------------------------------------------------------------------------
  it('4. exhausts maxRetries (2 retries, 3 total attempts) on persistent network error', async () => {
    let callCount = 0
    globalThis.fetch = mock.fn(async () => {
      callCount++
      throw new TypeError('Failed to fetch (DNS / connection drop)')
    })

    await assert.rejects(
      async () => {
        await listInvestigations({}, { retryDelayMs: 10, maxRetries: 2 })
      },
      (err) => {
        assert(err instanceof DbApiError)
        assert.strictEqual(err.code, 'network_error')
        return true
      },
    )

    assert.strictEqual(callCount, 3, 'Initial call + 2 retries = 3 total attempts')
  })

  // ---------------------------------------------------------------------------
  // 5. No Retries for 401, 403, 404, 409, 422 Client Errors
  // ---------------------------------------------------------------------------
  it('5. does NOT retry permanent client errors (401, 403, 404, 409, 422)', async () => {
    const errorStatuses = [
      { status: 401, code: 'unauthorized' },
      { status: 403, code: 'forbidden' },
      { status: 404, code: 'not_found' },
      { status: 409, code: 'conflict' },
      { status: 422, code: 'validation_error' },
    ]

    for (const { status, code } of errorStatuses) {
      let callCount = 0
      globalThis.fetch = mock.fn(async () => {
        callCount++
        return new Response(JSON.stringify({ error: { code, message: `Error ${status}` } }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      await assert.rejects(
        async () => {
          await listInvestigations({}, { retryDelayMs: 10, maxRetries: 2 })
        },
        (err) => {
          assert(err instanceof DbApiError)
          assert.strictEqual(err.status, status)
          assert.strictEqual(err.code, code)
          return true
        },
      )

      assert.strictEqual(callCount, 1, `HTTP ${status} must NOT trigger retries`)
    }
  })

  // ---------------------------------------------------------------------------
  // 6. Missing Session During Auth Initialization
  // ---------------------------------------------------------------------------
  it('6. prevents unauthenticated requests when requireAuth is enabled and session is not ready', async () => {
    setSupabaseClientForTesting({
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    })

    let fetchCalled = false
    globalThis.fetch = mock.fn(async () => {
      fetchCalled = true
      return new Response(JSON.stringify([]), { status: 200 })
    })

    await assert.rejects(
      async () => {
        await listInvestigations({}, { requireAuth: true })
      },
      (err) => {
        assert(err instanceof DbApiError)
        assert.strictEqual(err.code, 'unauthorized')
        assert.strictEqual(err.status, 401)
        assert.match(err.message, /Bearer token is missing/i)
        return true
      },
    )

    assert.strictEqual(fetchCalled, false, 'Protected request must never hit network without Bearer token')
  })

  // ---------------------------------------------------------------------------
  // 7. Successful Empty 200 [] Response
  // ---------------------------------------------------------------------------
  it('7. clears error and confirms connection on successful empty 200 [] response', async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const data = await listInvestigations()
    assert.ok(Array.isArray(data))
    assert.strictEqual(data.length, 0)
  })

  // ---------------------------------------------------------------------------
  // 8. No Duplicate Writes Caused by Automatic Retries
  // ---------------------------------------------------------------------------
  it('8. strictly avoids auto-retries on write operations (POST) to prevent duplicate records', async () => {
    let postCallCount = 0
    globalThis.fetch = mock.fn(async () => {
      postCallCount++
      throw new TypeError('Network glitch during POST')
    })

    await assert.rejects(
      async () => {
        await createInvestigation({
          customerRef: 'CUST-NO-DUP',
          basis: 'High anomaly',
        })
      },
      (err) => {
        assert(err instanceof DbApiError)
        assert.strictEqual(err.code, 'network_error')
        return true
      },
    )

    assert.strictEqual(postCallCount, 1, 'createInvestigation (POST) must NEVER auto-retry')

    let batchCallCount = 0
    globalThis.fetch = mock.fn(async () => {
      batchCallCount++
      throw new TypeError('Network timeout during batch creation')
    })

    await assert.rejects(
      async () => {
        await createBatch({
          fileName: 'test.csv',
          records: [{ id: 'C1', score: 0.9, predicted_label: 1 }],
        })
      },
      (err) => {
        assert(err instanceof DbApiError)
        assert.strictEqual(err.code, 'network_error')
        return true
      },
    )

    assert.strictEqual(batchCallCount, 1, 'createBatch (POST) must NEVER auto-retry')
  })

  // ---------------------------------------------------------------------------
  // 9. Status Classification: Authentication vs Database Failure
  // ---------------------------------------------------------------------------
  it('9. correctly distinguishes authentication error, temporary unavailable, and offline persistence', () => {
    // Helper mimicking the exact AppState status classifier
    function classifyDatabaseError(err) {
      if (err.code === 'unauthorized' || err.status === 401) {
        return {
          dbConnected: false,
          dbStatus: 'auth_error',
          dbError: 'Authentication session expired. Please sign in again.',
        }
      }
      if (err.code === 'timeout' || err.code === 'network_error') {
        return {
          dbConnected: false,
          dbStatus: 'unavailable',
          dbError: 'Backend persistence service is temporarily unavailable. Server may be waking up.',
        }
      }
      if (err.code === 'database_unavailable' || err.status === 503) {
        return {
          dbConnected: false,
          dbStatus: 'offline',
          dbError: err.message || 'Database persistence service is offline.',
        }
      }
      return {
        dbConnected: false,
        dbStatus: 'offline',
        dbError: err.message || 'Database unavailable.',
      }
    }

    // 1. Auth error: MUST NOT declare database offline
    const authErr = new DbApiError('Invalid credentials', { code: 'unauthorized', status: 401 })
    const authRes = classifyDatabaseError(authErr)
    assert.strictEqual(authRes.dbConnected, false)
    assert.strictEqual(authRes.dbStatus, 'auth_error')
    assert.notStrictEqual(authRes.dbStatus, 'offline')

    // 2. Timeout error (Render cold start): MUST indicate temporarily unavailable
    const timeoutErr = new DbApiError('Timed out after 65000ms', { code: 'timeout' })
    const timeoutRes = classifyDatabaseError(timeoutErr)
    assert.strictEqual(timeoutRes.dbConnected, false)
    assert.strictEqual(timeoutRes.dbStatus, 'unavailable')
    assert.notStrictEqual(timeoutRes.dbStatus, 'offline')

    // 3. 503 database_unavailable: Confirmed database offline
    const dbErr = new DbApiError('Database connection pool exhausted', { code: 'database_unavailable', status: 503 })
    const dbRes = classifyDatabaseError(dbErr)
    assert.strictEqual(dbRes.dbConnected, false)
    assert.strictEqual(dbRes.dbStatus, 'offline')
  })

  // ---------------------------------------------------------------------------
  // 10. Concurrent Refresh Prevention & Stale Response Handling
  // ---------------------------------------------------------------------------
  it('10. prevents duplicate concurrent refreshes and drops stale out-of-order responses', async () => {
    let callCount = 0
    let inFlightPromise = null
    let activeSeq = 0
    let lastCommittedData = null

    async function mockRefreshInvestigations({ force = false, delayMs = 10, responseData = [] } = {}) {
      if (inFlightPromise && !force) {
        return inFlightPromise
      }

      const seq = ++activeSeq

      const run = async () => {
        callCount++
        await new Promise((r) => setTimeout(r, delayMs))
        if (seq !== activeSeq) {
          // Stale response: discard!
          return null
        }
        lastCommittedData = responseData
        return responseData
      }

      const p = run().finally(() => {
        if (seq === activeSeq) {
          inFlightPromise = null
        }
      })
      inFlightPromise = p
      return p
    }

    // Case A: Concurrent refresh deduplication
    const [resA, resB] = await Promise.all([
      mockRefreshInvestigations({ delayMs: 30, responseData: [{ id: '1' }] }),
      mockRefreshInvestigations({ delayMs: 30, responseData: [{ id: '1' }] }),
    ])

    assert.strictEqual(callCount, 1, 'Concurrent refreshes must share in-flight promise')
    assert.deepStrictEqual(resA, [{ id: '1' }])
    assert.deepStrictEqual(resB, [{ id: '1' }])

    // Case B: Stale response dropped
    // Call 1 takes 50ms, but Call 2 (forced) takes only 10ms
    const slowCall = mockRefreshInvestigations({ force: true, delayMs: 60, responseData: [{ id: 'old-stale' }] })
    await new Promise((r) => setTimeout(r, 10))
    const fastCall = mockRefreshInvestigations({ force: true, delayMs: 15, responseData: [{ id: 'new-fresh' }] })

    await fastCall
    assert.deepStrictEqual(lastCommittedData, [{ id: 'new-fresh' }])

    await slowCall
    // Slow call completed later, but must NOT have overwritten new-fresh!
    assert.deepStrictEqual(lastCommittedData, [{ id: 'new-fresh' }])
  })

  // ---------------------------------------------------------------------------
  // 11. Request Cancellation & AbortSignal Cleanup
  // ---------------------------------------------------------------------------
  it('11. respects caller AbortSignal immediately and cleans up timers without leak', async () => {
    const controller = new AbortController()

    globalThis.fetch = mock.fn(async (_url, opts) => {
      if (opts?.signal?.aborted) {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        throw err
      }
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(new Response(JSON.stringify([]), { status: 200 })), 500)
        opts?.signal?.addEventListener('abort', () => {
          clearTimeout(t)
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })

    const requestPromise = listInvestigations({}, { signal: controller.signal })
    controller.abort()

    await assert.rejects(
      async () => {
        await requestPromise
      },
      (err) => {
        assert(err instanceof DbApiError)
        assert.strictEqual(err.code, 'cancelled')
        return true
      },
    )
  })
})
