import { test, describe, mock } from 'node:test'
import assert from 'node:assert'
import {
  DbApiError,
  normalizeOrigin,
  mapReviewCategory,
  createBatch,
  listBatches,
  getBatch,
  getBatchWithAllRecords,
  listInvestigations,
  createInvestigation,
  getInvestigation,
  updateInvestigation,
  deleteInvestigation,
  createBillExtraction,
  listBillExtractions,
} from '../src/lib/dbApi.js'

describe('dbApi client', () => {
  test('normalizeOrigin maps frontend and alias names to canonical CHECK constraint values', () => {
    assert.strictEqual(normalizeOrigin('Model screening'), 'screening')
    assert.strictEqual(normalizeOrigin('csv screening'), 'screening')
    assert.strictEqual(normalizeOrigin('SCREENING'), 'screening')
    assert.strictEqual(normalizeOrigin('Consumption comparison'), 'comparison')
    assert.strictEqual(normalizeOrigin('comparison'), 'comparison')
    assert.strictEqual(normalizeOrigin('Electricity bill'), 'bill')
    assert.strictEqual(normalizeOrigin('bill upload'), 'bill')
    assert.strictEqual(normalizeOrigin('ocr'), 'bill')
    assert.strictEqual(normalizeOrigin('unknown_val'), 'screening') // defaults to screening
  })

  test('mapReviewCategory correctly maps category and status', () => {
    assert.strictEqual(mapReviewCategory('none', 'scored'), 'normal')
    assert.strictEqual(mapReviewCategory('elevated', 'scored'), 'elevated')
    assert.strictEqual(mapReviewCategory('review', 'scored'), 'review')
    assert.strictEqual(mapReviewCategory('none', 'rejected'), 'rejected')
    assert.strictEqual(mapReviewCategory(null, 'unscored'), 'unscored')
  })

  test('createBatch serializes payload and parses detail response on success', async () => {
    const originalFetch = globalThis.fetch
    let capturedUrl = null
    let capturedBody = null

    globalThis.fetch = mock.fn(async (url, opts) => {
      capturedUrl = url
      capturedBody = JSON.parse(opts.body)
      return new Response(
        JSON.stringify({
          id: 'b1111111-1111-1111-1111-111111111111',
          file_name: capturedBody.file_name,
          file_hash: null,
          total_rows: capturedBody.total_rows,
          scored_rows: capturedBody.scored_rows,
          rejected_rows: capturedBody.rejected_rows,
          warning_rows: capturedBody.warning_rows,
          model_version: 'v1.0.0',
          model_sha256: capturedBody.model_sha256,
          score_note: 'Uncalibrated; not a probability',
          threshold_elevated: 0.3,
          threshold_review: 0.5,
          status: 'completed',
          created_at: '2026-10-19T10:00:00Z',
          updated_at: '2026-10-19T10:00:00Z',
          records: [
            {
              id: 'r1111111-1111-1111-1111-111111111111',
              batch_id: 'b1111111-1111-1111-1111-111111111111',
              row_index: 0,
              customer_ref: 'CUST-001',
              status: 'scored',
              model_score: 0.72,
              predicted_label: 1,
              label_name: 'Suspicious',
              review_category: 'review',
              features: { valid_readings: 1000 },
              warnings: [],
              errors: [],
              created_at: '2026-10-19T10:00:00Z',
            },
          ],
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      const res = await createBatch({
        fileName: 'test_screen.csv',
        modelSha256: '442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5',
        thresholdElevated: 0.3,
        thresholdReview: 0.5,
        records: [
          {
            id: 'CUST-001',
            score: 0.72,
            predicted_label: 1,
            label_name: 'Suspicious',
            category: 'review',
            status: 'scored',
            features: { valid_readings: 1000 },
          },
        ],
      })

      assert.strictEqual(capturedUrl, '/ml/v1/batches')
      assert.strictEqual(capturedBody.file_name, 'test_screen.csv')
      assert.strictEqual(capturedBody.records.length, 1)
      assert.strictEqual(capturedBody.records[0].customer_ref, 'CUST-001')
      assert.strictEqual(capturedBody.records[0].model_score, 0.72)
      assert.strictEqual(capturedBody.records[0].review_category, 'review')

      assert.strictEqual(res.id, 'b1111111-1111-1111-1111-111111111111')
      assert.strictEqual(res.records[0].id, 'r1111111-1111-1111-1111-111111111111')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('listBatches and getBatch make correct HTTP queries', async () => {
    const originalFetch = globalThis.fetch
    const queries = []

    globalThis.fetch = mock.fn(async (url) => {
      queries.push(url)
      if (url.includes('/ml/v1/batches?')) {
        return new Response(JSON.stringify([{ id: 'b-1', file_name: 'f1.csv', total_rows: 10 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ id: 'b-1', records: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    try {
      const list = await listBatches({ limit: 10, offset: 5 })
      assert.strictEqual(queries[0], '/ml/v1/batches?limit=10&offset=5')
      assert.strictEqual(list.length, 1)

      const batch = await getBatch('b-1', { limit: 20, offset: 0 })
      assert.strictEqual(queries[1], '/ml/v1/batches/b-1?limit=20&offset=0')
      assert.strictEqual(batch.id, 'b-1')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('getBatchWithAllRecords paginates through batches with >100 records and preserves all rows', async () => {
    const originalFetch = globalThis.fetch
    const requestedUrls = []
    const progressReports = []

    globalThis.fetch = mock.fn(async (url) => {
      requestedUrls.push(url)
      const parsedUrl = new URL(url, 'http://localhost')
      const offset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10)
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10)

      const pageRecords = []
      const end = Math.min(250, offset + limit)
      for (let i = offset; i < end; i++) {
        pageRecords.push({
          id: `rec-${i}`,
          batch_id: 'batch-250',
          row_index: i,
          customer_ref: `CUST-${String(i).padStart(4, '0')}`,
          model_score: 0.1 + (i % 10) * 0.08,
          predicted_label: i % 5 === 0 ? 1 : 0,
          label_name: i % 5 === 0 ? 'Suspicious' : 'Normal',
          review_category: i % 5 === 0 ? 'review' : 'normal',
          features: { valid_readings: 1000 + i },
        })
      }

      return new Response(
        JSON.stringify({
          id: 'batch-250',
          file_name: 'large_dataset.csv',
          total_rows: 250,
          scored_rows: 250,
          records: pageRecords,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      const fullBatch = await getBatchWithAllRecords('batch-250', {
        pageSize: 100,
        onProgress: (p) => progressReports.push({ ...p }),
      })

      assert.strictEqual(fullBatch.id, 'batch-250')
      assert.strictEqual(fullBatch.records.length, 250)
      assert.strictEqual(fullBatch.records[0].customer_ref, 'CUST-0000')
      assert.strictEqual(fullBatch.records[249].customer_ref, 'CUST-0249')

      assert.strictEqual(requestedUrls.length, 3)
      assert.strictEqual(requestedUrls[0], '/ml/v1/batches/batch-250?limit=100&offset=0')
      assert.strictEqual(requestedUrls[1], '/ml/v1/batches/batch-250?limit=100&offset=100')
      assert.strictEqual(requestedUrls[2], '/ml/v1/batches/batch-250?limit=100&offset=200')

      assert.strictEqual(progressReports.length, 3)
      assert.deepStrictEqual(progressReports[0], { loadedRows: 100, totalRows: 250, page: 1 })
      assert.deepStrictEqual(progressReports[1], { loadedRows: 200, totalRows: 250, page: 2 })
      assert.deepStrictEqual(progressReports[2], { loadedRows: 250, totalRows: 250, page: 3 })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('getBatchWithAllRecords performs only one request when batch has <=100 records', async () => {
    const originalFetch = globalThis.fetch
    let callCount = 0

    globalThis.fetch = mock.fn(async () => {
      callCount++
      return new Response(
        JSON.stringify({
          id: 'batch-40',
          total_rows: 40,
          records: Array.from({ length: 40 }, (_, i) => ({ id: `rec-${i}`, row_index: i })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      const batch = await getBatchWithAllRecords('batch-40')
      assert.strictEqual(callCount, 1)
      assert.strictEqual(batch.records.length, 40)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('getBatchWithAllRecords terminates cleanly on exact page multiples without extra requests', async () => {
    const originalFetch = globalThis.fetch
    const requestedUrls = []

    globalThis.fetch = mock.fn(async (url) => {
      requestedUrls.push(url)
      const parsedUrl = new URL(url, 'http://localhost')
      const offset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10)
      return new Response(
        JSON.stringify({
          id: 'batch-200',
          total_rows: 200,
          records: Array.from({ length: 100 }, (_, i) => ({ id: `rec-${offset + i}` })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      const batch = await getBatchWithAllRecords('batch-200', { pageSize: 100 })
      assert.strictEqual(requestedUrls.length, 2)
      assert.strictEqual(batch.records.length, 200)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('createInvestigation normalizes origin and sends valid JSON body', async () => {
    const originalFetch = globalThis.fetch
    let capturedBody = null

    globalThis.fetch = mock.fn(async (url, opts) => {
      assert.strictEqual(url, '/ml/v1/investigations')
      capturedBody = JSON.parse(opts.body)
      return new Response(
        JSON.stringify({
          id: 'i1111111-1111-1111-1111-111111111111',
          ticket_code: 'INV-20261019-ABCD',
          ...capturedBody,
          created_at: '2026-10-19T10:00:00Z',
          updated_at: '2026-10-19T10:00:00Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      const res = await createInvestigation({
        customerRef: 'CUST-042',
        origin: 'Model screening',
        basis: 'Model Score 0.85 in Review Recommended band',
        screeningRecordId: 'r1111111-1111-1111-1111-111111111111',
        batchId: 'b1111111-1111-1111-1111-111111111111',
      })

      assert.strictEqual(capturedBody.customer_ref, 'CUST-042')
      assert.strictEqual(capturedBody.origin, 'screening') // normalized from 'Model screening'
      assert.strictEqual(capturedBody.screening_record_id, 'r1111111-1111-1111-1111-111111111111')
      assert.strictEqual(capturedBody.batch_id, 'b1111111-1111-1111-1111-111111111111')
      assert.strictEqual(res.ticket_code, 'INV-20261019-ABCD')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('createInvestigation handles HTTP 409 conflict cleanly', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'conflict',
            message: "Screening record 'r1' is already linked to an existing investigation.",
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      await assert.rejects(
        async () => {
          await createInvestigation({
            customerRef: 'CUST-042',
            origin: 'screening',
            basis: 'High score',
            screeningRecordId: 'r1',
          })
        },
        (err) => {
          assert(err instanceof DbApiError)
          assert.strictEqual(err.status, 409)
          assert.strictEqual(err.code, 'conflict')
          assert.match(err.message, /already linked to an existing investigation/)
          return true
        },
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('updateInvestigation and deleteInvestigation execute correct methods and URLs', async () => {
    const originalFetch = globalThis.fetch
    const calls = []

    globalThis.fetch = mock.fn(async (url, opts) => {
      calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null })
      if (opts.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 'inv-1', status: 'In inspection' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ deleted: true, id: 'inv-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    try {
      await updateInvestigation('inv-1', { status: 'In inspection', notes: 'Field team deployed.' })
      assert.strictEqual(calls[0].url, '/ml/v1/investigations/inv-1')
      assert.strictEqual(calls[0].method, 'PATCH')
      assert.strictEqual(calls[0].body.status, 'In inspection')

      const delRes = await deleteInvestigation('inv-1')
      assert.strictEqual(calls[1].url, '/ml/v1/investigations/inv-1')
      assert.strictEqual(calls[1].method, 'DELETE')
      assert.strictEqual(delRes.deleted, true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('createBillExtraction strictly enforces data minimization and omits raw_ocr_text and file binaries', async () => {
    const originalFetch = globalThis.fetch
    let capturedBody = null

    globalThis.fetch = mock.fn(async (url, opts) => {
      assert.strictEqual(url, '/ml/v1/bill-extractions')
      capturedBody = JSON.parse(opts.body)
      return new Response(
        JSON.stringify({
          id: 'e1111111-1111-1111-1111-111111111111',
          ...capturedBody,
          created_at: '2026-10-19T10:00:00Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      // Simulate frontend state with raw OCR text and a mock file that MUST NOT be transmitted
      const dirtyFrontendState = {
        consumerNumber: '100458921',
        discom: 'TSSPDCL',
        billDate: '2026-08-02',
        previousReading: '14,280',
        currentReading: '14,525',
        unitsConsumed: '245',
        billingDays: '31',
        amountPayable: '1,725.50',
        hasDiscrepancy: false,
        rawOcrText: 'CONFIDENTIAL BILL FULL OCR TEXT INCLUDING PII THAT MUST NEVER BE STORED',
        raw_ocr_text: 'ANOTHER OCR VARIANT',
        file: { name: 'bill.pdf', data: 'binary blob' },
        previewUrl: 'blob:http://localhost:5173/preview-uuid',
      }

      await createBillExtraction(dirtyFrontendState)

      // VERIFY STRICT PRIVACY GUARANTEE:
      assert.strictEqual(capturedBody.consumer_number, '100458921')
      assert.strictEqual(capturedBody.previous_reading, 14280) // parsed from comma-formatted string
      assert.strictEqual(capturedBody.current_reading, 14525)
      assert.strictEqual(capturedBody.units_consumed, 245)
      assert.strictEqual(capturedBody.amount_payable, 1725.5)
      assert.strictEqual(capturedBody.billing_days, 31)

      // Ensure forbidden fields are strictly absent
      assert.strictEqual(capturedBody.rawOcrText, undefined)
      assert.strictEqual(capturedBody.raw_ocr_text, undefined)
      assert.strictEqual(capturedBody.file, undefined)
      assert.strictEqual(capturedBody.previewUrl, undefined)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('handles 503 database_unavailable cleanly', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'database_unavailable',
            message: 'Database is not configured or unavailable.',
          },
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    })

    try {
      await assert.rejects(
        async () => {
          await listInvestigations()
        },
        (err) => {
          assert(err instanceof DbApiError)
          assert.strictEqual(err.status, 503)
          assert.strictEqual(err.code, 'database_unavailable')
          assert.match(err.message, /Database is not configured or unavailable/)
          return true
        },
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
