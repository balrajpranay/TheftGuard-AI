import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getReportContext,
  classifyReportCustomers,
  COMPARISON_UNAVAILABLE_MESSAGE,
} from '../src/lib/reports.js'
import { DEFAULT_THRESHOLDS } from '../src/lib/risk.js'

describe('Reports Data Context & Comparison Gating', () => {
  it('identifies demonstration mode and shows demonstration comparison', () => {
    const ctx = getReportContext({
      source: 'demo',
      hasScores: false,
      uploaded: null,
      comparison: {
        rows: [{ customer_ref: 'DEMO-01', date: '2026-06-01', kwh: 10 }],
        isDemo: true,
        label: 'Demonstration data (synthetic)',
      },
    })

    assert.equal(ctx.isDemo, true)
    assert.equal(ctx.isScoredUpload, false)
    assert.equal(ctx.isUnscoredUpload, false)
    assert.equal(ctx.showComparisonData, true)
    assert.match(ctx.bannerText, /demonstration report uses synthetic/i)
    assert.equal(ctx.bannerType, 'demo')
    assert.equal(ctx.sidebarTitle, 'Demonstration data')
  })

  it('suppresses synthetic demo comparison for real ML-scored uploaded files', () => {
    const ctx = getReportContext({
      source: 'uploaded',
      hasScores: true,
      uploaded: {
        fileName: 'theftguard_test_sample.csv',
        customers: [{ id: 'SAMPLE-ROW-001', score: 0.854 }],
      },
      comparison: {
        rows: [{ customer_ref: 'DEMO-01', date: '2026-06-01', kwh: 10 }],
        isDemo: true, // Workspace has default synthetic demo consumption
        label: 'Demonstration data (synthetic)',
      },
    })

    assert.equal(ctx.isDemo, false)
    assert.equal(ctx.isScoredUpload, true)
    assert.equal(ctx.hasRealComparison, false)
    assert.equal(ctx.showComparisonData, false, 'Synthetic comparison data must NOT be shown for uploaded dataset')
    assert.equal(ctx.bannerType, 'scored')
    assert.match(ctx.bannerText, /theftguard_test_sample\.csv/)
    assert.match(ctx.bannerText, /ML-Scored Dataset/)
    assert.match(ctx.bannerText, /not proof of electricity theft/)
    assert.doesNotMatch(ctx.bannerText, /invented sample data/)
    assert.equal(ctx.sidebarTitle, 'ML-scored dataset')
  })

  it('allows real comparison data when a genuine kWh file is uploaded', () => {
    const ctx = getReportContext({
      source: 'uploaded',
      hasScores: true,
      uploaded: {
        fileName: 'screening_data.csv',
      },
      comparison: {
        rows: [{ customer_ref: 'CUST-001', date: '2026-06-01', kwh: 15.2 }],
        isDemo: false, // User explicitly uploaded a kWh file in Comparison
        label: 'File: meter_readings.csv',
      },
    })

    assert.equal(ctx.isDemo, false)
    assert.equal(ctx.isScoredUpload, true)
    assert.equal(ctx.hasRealComparison, true)
    assert.equal(ctx.showComparisonData, true, 'Real comparison readings must be shown')
  })

  it('suppresses comparison for unscored preview files when no real kWh file is loaded', () => {
    const ctx = getReportContext({
      source: 'uploaded',
      hasScores: false,
      uploaded: {
        fileName: 'preview.csv',
      },
      comparison: {
        rows: [{ customer_ref: 'DEMO-01', date: '2026-06-01', kwh: 10 }],
        isDemo: true,
      },
    })

    assert.equal(ctx.isDemo, false)
    assert.equal(ctx.isUnscoredUpload, true)
    assert.equal(ctx.showComparisonData, false)
    assert.match(ctx.bannerText, /Preview without scoring/)
  })

  it('provides the exact comparison unavailable message required', () => {
    assert.equal(
      COMPARISON_UNAVAILABLE_MESSAGE,
      'Consumption comparison unavailable: this screening file contains customer-level summary features, not historical and current meter readings.'
    )
  })

  it('classifies customers accurately and preserves sorted order for review band', () => {
    const customers = [
      { id: 'CUST-LOW', score: 0.15 },
      { id: 'CUST-HIGH', score: 0.88 },
      { id: 'CUST-ELEV', score: 0.42 },
      { id: 'CUST-REJ', score: null, status: 'rejected' },
    ]

    const { classified, counts, flagged } = classifyReportCustomers(customers, DEFAULT_THRESHOLDS)

    assert.equal(counts.review, 1)
    assert.equal(counts.elevated, 1)
    assert.equal(counts.none, 1)
    assert.equal(counts.unscored, 1)

    assert.equal(flagged.length, 1)
    assert.equal(flagged[0].id, 'CUST-HIGH')
    assert.equal(flagged[0].score, 0.88)
    assert.equal(flagged[0].category, 'review')
  })
})
