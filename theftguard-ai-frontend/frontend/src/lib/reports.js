import { CATEGORIES, classify } from './risk.js'

export const COMPARISON_UNAVAILABLE_MESSAGE =
  'Consumption comparison unavailable: this screening file contains customer-level summary features, not historical and current meter readings.'

export const REPORT_TYPES = [
  { id: 'department', label: 'Department Investigation Report', shortLabel: 'Department Investigation' },
  { id: 'customer', label: 'Customer Electricity Report', shortLabel: 'Customer Report' },
]

export const CUSTOM_REPORT_SECTIONS = [
  { key: 'executiveSummary', label: 'Executive Summary', title: 'Executive Summary', badge: 'User Commentary' },
  { key: 'observations', label: 'Observations and Findings', title: 'Observations and Findings', badge: 'User Commentary' },
  { key: 'recommendations', label: 'Recommendations / Action Taken', title: 'Recommendations / Action Taken', badge: 'User Commentary' },
  { key: 'notes', label: 'Additional Notes', title: 'Additional Notes', badge: 'User Commentary' },
]

export const REPORT_EDITOR_FIELDS = [
  { key: 'department', label: 'Department / Office', type: 'input', hint: 'Optional' },
  { key: 'executiveSummary', label: 'Executive Summary', type: 'textarea', hint: 'Optional' },
  { key: 'observations', label: 'Observations and Findings', type: 'textarea', hint: 'Optional' },
  { key: 'recommendations', label: 'Recommendations / Action Taken', type: 'textarea', hint: 'Optional' },
  { key: 'notes', label: 'Additional Notes', type: 'textarea', hint: 'Optional' },
]

export const CUSTOMER_COMPLAINT_CATEGORIES = [
  'Unexpected high bill',
  'Incorrect meter reading',
  'Suspected meter fault',
  'Consumption discrepancy',
  'Billing dispute',
  'Other',
]

/**
 * Filter and sanitize custom report sections. Empty or whitespace-only sections are omitted.
 * Preserves the exact sequence: Executive Summary -> Observations -> Recommendations -> Notes.
 */
export function getActiveCustomSections(customFields = {}) {
  if (!customFields || typeof customFields !== 'object') return []
  return CUSTOM_REPORT_SECTIONS.filter(({ key }) => {
    const val = customFields[key]
    return typeof val === 'string' && val.trim().length > 0
  }).map(({ key, label, title, badge }) => ({
    key,
    label,
    title,
    badge,
    content: customFields[key].trim(),
    rawContent: customFields[key],
  }))
}

/**
 * Checks whether any of the custom commentary or department fields have non-whitespace content.
 */
export function hasCustomReportContent(customFields = {}) {
  if (!customFields || typeof customFields !== 'object') return false
  return (
    (typeof customFields.department === 'string' && customFields.department.trim().length > 0) ||
    getActiveCustomSections(customFields).length > 0
  )
}

/**
 * Format report header meta line including optional department/office.
 */
export function formatReportHeaderMeta({ date, period, author, department } = {}) {
  const parts = []
  if (date) parts.push(String(date).trim())
  if (period && String(period).trim()) parts.push(`covering ${String(period).trim()}`)
  if (author && String(author).trim()) parts.push(`prepared by ${String(author).trim()}`)
  if (department && String(department).trim()) parts.push(`Department: ${String(department).trim()}`)
  return parts.join(', ')
}

/**
 * Computes comparative metrics between previous and current bills/meter readings if valid numbers are provided.
 */
export function computeCustomerBillMetrics({
  prevAmount,
  currAmount,
  prevReading,
  currReading,
  billedUnits,
} = {}) {
  const parseNum = (v) => {
    if (v === null || v === undefined || v === '') return null
    const cleaned = String(v).replace(/[^0-9.-]/g, '')
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }

  const pAmt = parseNum(prevAmount)
  const cAmt = parseNum(currAmount)
  const pRead = parseNum(prevReading)
  const cRead = parseNum(currReading)
  const bUnits = parseNum(billedUnits)

  let amountDiff = null
  let amountPercentChange = null
  if (pAmt !== null && cAmt !== null) {
    amountDiff = cAmt - pAmt
    if (pAmt > 0) {
      amountPercentChange = (amountDiff / pAmt) * 100
    }
  }

  let readingUnits = null
  if (pRead !== null && cRead !== null && cRead >= pRead) {
    readingUnits = cRead - pRead
  }

  let unitsDifference = null
  if (readingUnits !== null && bUnits !== null) {
    unitsDifference = bUnits - readingUnits
  }

  const hasAnyFinancialData = pAmt !== null || cAmt !== null
  const hasAnyMeterData = pRead !== null || cRead !== null || bUnits !== null
  const hasAmountComparison = amountDiff !== null
  const hasMeterComparison = readingUnits !== null

  return {
    prevAmount: pAmt,
    currAmount: cAmt,
    amountDiff,
    amountPercentChange,
    prevReading: pRead,
    currReading: cRead,
    readingUnits,
    billedUnits: bUnits,
    unitsDifference,
    hasAnyFinancialData,
    hasAnyMeterData,
    hasAmountComparison,
    hasMeterComparison,
    hasAnyData: hasAnyFinancialData || hasAnyMeterData,
  }
}

/**
 * Check whether any customer report fields have non-whitespace content.
 */
export function hasCustomerReportContent(fields = {}) {
  if (!fields || typeof fields !== 'object') return false
  const keys = [
    'customerName',
    'connectionRef',
    'billingPeriod',
    'prevBillAmount',
    'currBillAmount',
    'prevReading',
    'currReading',
    'billedUnits',
    'issueDescription',
    'requestedResolution',
    'evidenceReferences',
    'customerNotes',
  ]
  return keys.some((k) => typeof fields[k] === 'string' && fields[k].trim().length > 0)
}

/**
 * Determine report context and messaging based on screening results and comparison data.
 */
export function getReportContext({ source, hasScores, uploaded, comparison }) {
  const isDemo = source === 'demo'
  const isScoredUpload = source === 'uploaded' && Boolean(hasScores)
  const isUnscoredUpload = source === 'uploaded' && !hasScores
  const isEmptyWorkspace = !isDemo && source !== 'uploaded'

  // Real comparison data exists only when a real consumption file (not synthetic demo data) is loaded with rows
  const hasRealComparison = Boolean(
    comparison && !comparison.isDemo && Array.isArray(comparison.rows) && comparison.rows.length > 0
  )

  // In demo mode, synthetic demo comparison is shown. In uploaded mode, ONLY real comparison data can be shown.
  const showComparisonData = isDemo
    ? Boolean(comparison && Array.isArray(comparison.rows) && comparison.rows.length > 0)
    : hasRealComparison

  let bannerType = 'demo'
  let bannerText = ''
  let sidebarTitle = ''
  let sidebarText = ''

  if (isDemo) {
    bannerType = 'demo'
    bannerText =
      'This demonstration report uses synthetic sample customers and invented demonstration scores. It does not describe real utility consumers.'
    sidebarTitle = 'Demonstration data'
    sidebarText =
      'The report carries a demonstration notice because it uses synthetic demonstration customers and invented scores.'
  } else if (isScoredUpload) {
    bannerType = 'scored'
    const name = uploaded?.fileName || 'Uploaded dataset'
    bannerText = `ML-Scored Dataset (${name}): Customer rows evaluated with the TheftGuard AI model pipeline. Model Scores rank records for review and are not proof of electricity theft.`
    sidebarTitle = 'ML-scored dataset'
    sidebarText = `Report is generated from ${name} using actual predictions from the ML model pipeline.`
  } else if (isUnscoredUpload) {
    bannerType = 'unscored'
    const name = uploaded?.fileName || 'Uploaded file'
    bannerText = `Preview without scoring (${name}): Customer rows were previewed without running ML model scoring. Model Scores and review categories are unavailable.`
    sidebarTitle = 'Unscored file'
    sidebarText = `Rows from ${name} were previewed without running ML model scoring.`
  } else {
    bannerType = 'empty'
    bannerText = 'Authenticated workspace: no screening records loaded. Screen a dataset to generate an investigation report.'
    sidebarTitle = 'Workspace empty'
    sidebarText = 'Screen customer records in Screening to generate a complete report.'
  }

  return {
    isDemo,
    isScoredUpload,
    isUnscoredUpload,
    isEmptyWorkspace,
    hasRealComparison,
    showComparisonData,
    bannerType,
    bannerText,
    sidebarTitle,
    sidebarText,
  }
}

/**
 * Classify report customers and compute review band summary counts.
 */
export function classifyReportCustomers(customers = [], thresholds) {
  const classified = customers.map((c) => ({
    ...c,
    category: classify(c.score, thresholds),
  }))

  const counts = { review: 0, elevated: 0, none: 0, unscored: 0 }
  classified.forEach((x) => {
    if (counts[x.category] !== undefined) {
      counts[x.category] += 1
    } else {
      counts.unscored += 1
    }
  })

  const flagged = classified
    .filter((c) => c.category === 'review')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return { classified, counts, flagged }
}
