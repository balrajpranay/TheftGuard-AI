import { test, describe, mock } from 'node:test'
import assert from 'node:assert'
import { getHealth, getModelMetadata, predictBatch, MlApiError } from '../src/lib/mlApi.js'

describe('mlApi client', () => {
  test('getHealth returns parsed status on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(async (url) => {
      assert.strictEqual(url, '/ml/v1/health')
      return new Response(JSON.stringify({ status: 'ok', model_loaded: true, model_sha256_verified: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    try {
      const res = await getHealth()
      assert.strictEqual(res.status, 'ok')
      assert.strictEqual(res.model_loaded, true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('getHealth handles 503 error cleanly', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(async () => {
      return new Response(JSON.stringify({ error: { code: 'model_unavailable', message: 'Service unavailable' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    try {
      await assert.rejects(
        async () => {
          await getHealth()
        },
        (err) => {
          assert(err instanceof MlApiError)
          assert.strictEqual(err.status, 503)
          assert.strictEqual(err.code, 'model_unavailable')
          return true
        },
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('predictBatch chunks requests correctly and preserves indices and refs', async () => {
    const originalFetch = globalThis.fetch
    const calls = []

    globalThis.fetch = mock.fn(async (url, opts) => {
      assert.strictEqual(url, '/ml/v1/predict-batch')
      const body = JSON.parse(opts.body)
      calls.push(body)
      const count = body.rows.length
      return new Response(
        JSON.stringify({
          model_sha256: '442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5',
          total: count,
          scored: count,
          rejected: 0,
          score_note: 'Uncalibrated vote fraction',
          results: body.rows.map((r, i) => ({
            index: i,
            ref: r.ref,
            ok: true,
            predicted_label: i % 2 === 0 ? 0 : 1,
            label_name: i % 2 === 0 ? 'No Suspicious Pattern Flagged' : 'Potentially Suspicious',
            model_score: 0.15 * i,
            warnings: [],
          })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      // 5 rows with chunkSize = 2 => 3 chunks (2, 2, 1)
      const testRows = [
        { id: 'CUST-1', features: { valid_readings: 1000 } },
        { id: 'CUST-2', features: { valid_readings: 900 } },
        { id: 'CUST-3', features: { valid_readings: 800 } },
        { id: 'CUST-4', features: { valid_readings: 700 } },
        { id: 'CUST-5', features: { valid_readings: 600 } },
      ]

      const progressEvents = []
      const out = await predictBatch(testRows, {
        chunkSize: 2,
        onProgress: (p) => progressEvents.push(p),
      })

      assert.strictEqual(calls.length, 3)
      assert.strictEqual(calls[0].rows.length, 2)
      assert.strictEqual(calls[1].rows.length, 2)
      assert.strictEqual(calls[2].rows.length, 1)

      assert.strictEqual(out.total, 5)
      assert.strictEqual(out.scored, 5)
      assert.strictEqual(out.results.length, 5)

      // Check global indices and refs
      assert.strictEqual(out.results[0].index, 0)
      assert.strictEqual(out.results[0].ref, 'CUST-1')
      assert.strictEqual(out.results[2].index, 2)
      assert.strictEqual(out.results[2].ref, 'CUST-3')
      assert.strictEqual(out.results[4].index, 4)
      assert.strictEqual(out.results[4].ref, 'CUST-5')

      assert.strictEqual(progressEvents.length, 3)
      assert.strictEqual(progressEvents[2].completedRows, 5)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('predictBatch handles mixed valid and rejected rows', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({
          model_sha256: '442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5',
          total: 2,
          scored: 1,
          rejected: 1,
          score_note: 'Uncalibrated vote fraction',
          results: [
            {
              index: 0,
              ref: 'Row 1',
              ok: true,
              predicted_label: 1,
              label_name: 'Potentially Suspicious',
              model_score: 0.85,
              warnings: [],
            },
            {
              index: 1,
              ref: 'Row 2',
              ok: false,
              errors: [{ rule: 'R07', code: 'negative_value', field: 'valid_readings', message: 'Value is negative' }],
              errors_truncated: false,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      const rows = [
        { id: 'Row 1', features: { valid_readings: 1000 } },
        { id: 'Row 2', features: { valid_readings: -5 } },
      ]
      const out = await predictBatch(rows)
      assert.strictEqual(out.scored, 1)
      assert.strictEqual(out.rejected, 1)
      assert.strictEqual(out.results[0].ok, true)
      assert.strictEqual(out.results[1].ok, false)
      assert.strictEqual(out.results[1].errors[0].code, 'negative_value')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
