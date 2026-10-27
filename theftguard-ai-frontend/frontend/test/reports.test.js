import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getReportContext,
  classifyReportCustomers,
  COMPARISON_UNAVAILABLE_MESSAGE,
  CUSTOM_REPORT_SECTIONS,
  REPORT_EDITOR_FIELDS,
  getActiveCustomSections,
  hasCustomReportContent,
  formatReportHeaderMeta,
  REPORT_TYPES,
  CUSTOMER_COMPLAINT_CATEGORIES,
  computeCustomerBillMetrics,
  hasCustomerReportContent as hasCustomerContent,
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

describe('Report Editor — Custom Commentary Sections & Live Preview Logic', () => {
  it('defines all five requested report editor fields with correct types', () => {
    assert.equal(REPORT_EDITOR_FIELDS.length, 5)
    const keys = REPORT_EDITOR_FIELDS.map((f) => f.key)
    assert.deepEqual(keys, [
      'department',
      'executiveSummary',
      'observations',
      'recommendations',
      'notes',
    ])

    const deptField = REPORT_EDITOR_FIELDS.find((f) => f.key === 'department')
    assert.equal(deptField.label, 'Department / Office')
    assert.equal(deptField.type, 'input')

    const execField = REPORT_EDITOR_FIELDS.find((f) => f.key === 'executiveSummary')
    assert.equal(execField.label, 'Executive Summary')
    assert.equal(execField.type, 'textarea')

    const obsField = REPORT_EDITOR_FIELDS.find((f) => f.key === 'observations')
    assert.equal(obsField.label, 'Observations and Findings')
    assert.equal(obsField.type, 'textarea')

    const recField = REPORT_EDITOR_FIELDS.find((f) => f.key === 'recommendations')
    assert.equal(recField.label, 'Recommendations / Action Taken')
    assert.equal(recField.type, 'textarea')

    const notesField = REPORT_EDITOR_FIELDS.find((f) => f.key === 'notes')
    assert.equal(notesField.label, 'Additional Notes')
    assert.equal(notesField.type, 'textarea')
  })

  it('preserves exact section order: Executive Summary -> Observations -> Recommendations -> Notes', () => {
    const input = {
      notes: 'Late note',
      observations: 'Inspection finding',
      executiveSummary: 'High-level summary',
      recommendations: 'Action item',
    }

    const active = getActiveCustomSections(input)
    assert.equal(active.length, 4)
    assert.equal(active[0].key, 'executiveSummary')
    assert.equal(active[0].title, 'Executive Summary')
    assert.equal(active[0].badge, 'User Commentary')

    assert.equal(active[1].key, 'observations')
    assert.equal(active[1].title, 'Observations and Findings')

    assert.equal(active[2].key, 'recommendations')
    assert.equal(active[2].title, 'Recommendations / Action Taken')

    assert.equal(active[3].key, 'notes')
    assert.equal(active[3].title, 'Additional Notes')
  })

  it('does not produce blank sections for empty, null, undefined, or whitespace-only fields', () => {
    const emptyInputs = [
      {},
      { executiveSummary: '', observations: '   ', recommendations: '\n\t  ', notes: '' },
      { executiveSummary: null, observations: undefined, recommendations: false },
    ]

    for (const input of emptyInputs) {
      const active = getActiveCustomSections(input)
      assert.equal(active.length, 0, 'Must produce zero active sections for empty fields')
      assert.equal(hasCustomReportContent(input), false)
    }
  })

  it('renders only the populated subset of custom sections', () => {
    const partial = {
      executiveSummary: '',
      observations: 'Substation inspection confirmed seal intact on feeder #4.',
      recommendations: '',
      notes: 'Case ref: TG-2026-OCT-881',
    }

    const active = getActiveCustomSections(partial)
    assert.equal(active.length, 2)
    assert.equal(active[0].key, 'observations')
    assert.equal(active[0].content, 'Substation inspection confirmed seal intact on feeder #4.')
    assert.equal(active[1].key, 'notes')
    assert.equal(active[1].content, 'Case ref: TG-2026-OCT-881')
  })

  it('preserves multi-line formatting and wraps long text without truncation', () => {
    const longText = 'Paragraph 1: Initial anomaly observed.\n\nParagraph 2: Detailed investigation conducted on premises with high load.\n\nParagraph 3: Recommendations confirmed.'
    const active = getActiveCustomSections({ executiveSummary: longText })

    assert.equal(active.length, 1)
    assert.equal(active[0].content, longText)
    assert.ok(active[0].content.includes('\n\n'))
  })

  it('formats header meta line with and without department/office', () => {
    // Complete meta
    const full = formatReportHeaderMeta({
      date: '27 Oct 2026',
      period: 'Apr to Sep 2026',
      author: 'Er. Rajesh Kumar',
      department: 'Enforcement & Vigilance Wing',
    })
    assert.equal(
      full,
      '27 Oct 2026, covering Apr to Sep 2026, prepared by Er. Rajesh Kumar, Department: Enforcement & Vigilance Wing'
    )

    // Without department
    const noDept = formatReportHeaderMeta({
      date: '27 Oct 2026',
      period: 'Apr to Sep 2026',
      author: 'Er. Rajesh Kumar',
    })
    assert.equal(noDept, '27 Oct 2026, covering Apr to Sep 2026, prepared by Er. Rajesh Kumar')

    // Only date and department
    const onlyDept = formatReportHeaderMeta({
      date: '27 Oct 2026',
      department: 'Audit Cell',
    })
    assert.equal(onlyDept, '27 Oct 2026, Department: Audit Cell')
  })

  it('hasCustomReportContent correctly identifies when any editor field is populated', () => {
    assert.equal(hasCustomReportContent({ department: 'Zonal Office' }), true)
    assert.equal(hasCustomReportContent({ executiveSummary: 'Valid summary' }), true)
    assert.equal(hasCustomReportContent({ observations: 'Findings' }), true)
    assert.equal(hasCustomReportContent({ recommendations: 'Actions' }), true)
    assert.equal(hasCustomReportContent({ notes: 'Note' }), true)
    assert.equal(hasCustomReportContent({ department: '   ', notes: '  ' }), false)
  })
})

describe('Customer Electricity Report — Models, Calculations & Validation', () => {
  it('defines both report types (department and customer)', () => {
    assert.equal(REPORT_TYPES.length, 2)
    const ids = REPORT_TYPES.map((t) => t.id)
    assert.deepEqual(ids, ['department', 'customer'])
  })

  it('defines all 6 standard customer complaint categories', () => {
    assert.equal(CUSTOMER_COMPLAINT_CATEGORIES.length, 6)
    assert.deepEqual(CUSTOMER_COMPLAINT_CATEGORIES, [
      'Unexpected high bill',
      'Incorrect meter reading',
      'Suspected meter fault',
      'Consumption discrepancy',
      'Billing dispute',
      'Other',
    ])
  })

  it('computes customer bill amount variance and percent change accurately', () => {
    const res = computeCustomerBillMetrics({
      prevAmount: 2000,
      currAmount: 3500,
    })

    assert.equal(res.prevAmount, 2000)
    assert.equal(res.currAmount, 3500)
    assert.equal(res.amountDiff, 1500)
    assert.equal(res.amountPercentChange, 75)
    assert.equal(res.hasAmountComparison, true)
    assert.equal(res.hasAnyFinancialData, true)
    assert.equal(res.hasAnyData, true)
  })

  it('computes meter reading consumption increment accurately', () => {
    const res = computeCustomerBillMetrics({
      prevReading: 10200,
      currReading: 10550,
    })

    assert.equal(res.prevReading, 10200)
    assert.equal(res.currReading, 10550)
    assert.equal(res.readingUnits, 350)
    assert.equal(res.hasMeterComparison, true)
    assert.equal(res.hasAnyMeterData, true)
    assert.equal(res.hasAnyData, true)
  })

  it('detects and calculates unit discrepancy when billed units exceed meter increment', () => {
    const res = computeCustomerBillMetrics({
      prevReading: 1000,
      currReading: 1200, // 200 units increment
      billedUnits: 280,  // Utility charged 280 units
    })

    assert.equal(res.readingUnits, 200)
    assert.equal(res.billedUnits, 280)
    assert.equal(res.unitsDifference, 80) // 280 - 200 = 80 units excess
  })

  it('handles exact match between billed units and meter reading increment', () => {
    const res = computeCustomerBillMetrics({
      prevReading: 5000,
      currReading: 5400,
      billedUnits: 400,
    })

    assert.equal(res.readingUnits, 400)
    assert.equal(res.billedUnits, 400)
    assert.equal(res.unitsDifference, 0)
  })

  it('handles partial numerical inputs gracefully without errors', () => {
    const res = computeCustomerBillMetrics({
      prevAmount: '',
      currAmount: 1500,
      prevReading: null,
      currReading: undefined,
      billedUnits: 120,
    })

    assert.equal(res.prevAmount, null)
    assert.equal(res.currAmount, 1500)
    assert.equal(res.amountDiff, null)
    assert.equal(res.amountPercentChange, null)
    assert.equal(res.readingUnits, null)
    assert.equal(res.billedUnits, 120)
    assert.equal(res.unitsDifference, null)
    assert.equal(res.hasAmountComparison, false)
    assert.equal(res.hasMeterComparison, false)
    assert.equal(res.hasAnyFinancialData, true)
    assert.equal(res.hasAnyMeterData, true)
    assert.equal(res.hasAnyData, true)
  })

  it('handles invalid strings and currency symbols cleanly in numeric inputs', () => {
    const res = computeCustomerBillMetrics({
      prevAmount: '₹ 2,400.50',
      currAmount: '₹ 4,801.00',
      prevReading: '12,000 kWh',
      currReading: '12,500 kWh',
    })

    assert.equal(res.prevAmount, 2400.5)
    assert.equal(res.currAmount, 4801)
    assert.equal(res.amountDiff, 2400.5)
    assert.equal(res.prevReading, 12000)
    assert.equal(res.currReading, 12500)
    assert.equal(res.readingUnits, 500)
  })

  it('hasCustomerReportContent accurately validates populated vs empty customer fields', () => {
    assert.equal(hasCustomerContent({ customerName: 'Ramesh' }), true)
    assert.equal(hasCustomerContent({ connectionRef: 'USC-10293' }), true)
    assert.equal(hasCustomerContent({ prevBillAmount: '1200' }), true)
    assert.equal(hasCustomerContent({ issueDescription: 'Sudden surge' }), true)
    assert.equal(hasCustomerContent({}), false)
    assert.equal(hasCustomerContent({ customerName: '   ', connectionRef: '' }), false)
  })
})
