import { CATEGORIES, classify } from './risk.js'

export const COMPARISON_UNAVAILABLE_MESSAGE =
  'Consumption comparison unavailable: this screening file contains customer-level summary features, not historical and current meter readings.'

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
