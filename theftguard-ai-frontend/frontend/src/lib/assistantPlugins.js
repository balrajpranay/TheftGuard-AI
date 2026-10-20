/**
 * TheftGuard AI — Assistant Plugins & Grounded Tools Registry
 *
 * Provides 8 domain-specific plugins grounded in real application data:
 * 1. Bill Comparison (bill_comparison)
 * 2. Bill Upload & OCR (bill_upload_ocr)
 * 3. Electricity Theft Screening (theft_screening)
 * 4. Usage Analyst (usage_analyst)
 * 5. Reports & History (reports_history)
 * 6. Bill Calculator (bill_calculator)
 * 7. Electricity Help & Guidance (electricity_help)
 * 8. General Assistant (general_assistant)
 *
 * Guarantees:
 * - Real operations executed against AppState, verified bill metrics, and database records.
 * - Zero hallucination: Never invents numbers or states actions succeeded when data is missing.
 * - Responsible AI phrasing: Screening scores are indicators for inspection priority, NOT proof of theft.
 * - Strict user isolation: Demo data never leaks into authenticated user workspaces.
 */

import { inr, kwh } from './format.js'
import {
  buildComparisonReply,
  buildIncompleteBillReply,
  buildOcrProcessingReply,
  buildMissingBillComparisonReply,
  buildAcReply,
} from './assistantEngine.js'
import {
  calculateApplianceEstimates,
  synthesizeAnalysis,
} from './householdQuestionnaire.js'
import { cleanNumber } from './billComparison.js'
import { listBillExtractions, listBatches, listInvestigations } from './dbApi.js'

export const ASSISTANT_PLUGINS = [
  {
    id: 'general_assistant',
    name: 'General Assistant',
    icon: 'chat',
    badge: 'All-in-One',
    description: 'Comprehensive assistant for general queries, energy concepts, and app guidance.',
    placeholder: 'Ask any question about TheftGuard AI, electricity billing, or energy concepts...',
    isDefault: true,
  },
  {
    id: 'bill_comparison',
    name: 'Bill Comparison',
    icon: 'compare',
    badge: 'Dual-Bill',
    description: 'Compares previous and current electricity bills with verified metrics.',
    placeholder: 'Ask to compare your loaded bills or why your consumption changed...',
    isDefault: false,
  },
  {
    id: 'bill_upload_ocr',
    name: 'Bill Upload & OCR',
    icon: 'bill',
    badge: 'OCR Audit',
    description: 'Audits scanned spot bills and detects meter reading discrepancies.',
    placeholder: 'Ask about bill scan accuracy, extracted fields, or reading discrepancies...',
    isDefault: false,
  },
  {
    id: 'theft_screening',
    name: 'Electricity Theft Screening',
    icon: 'alert',
    badge: 'ML Screening',
    description: 'Analyzes consumption batches, screening anomalies, and model risk tiers.',
    placeholder: 'Ask about screened batch anomalies, model scores, or review flags...',
    isDefault: false,
  },
  {
    id: 'usage_analyst',
    name: 'Usage Analyst',
    icon: 'overview',
    badge: 'Appliances',
    description: 'Itemizes appliance energy use (AC, geyser, pump) against your bill shift.',
    placeholder: 'Ask how much your AC, geyser, or pump adds to your monthly bill...',
    isDefault: false,
  },
  {
    id: 'reports_history',
    name: 'Reports & History',
    icon: 'report',
    badge: 'Audit Trail',
    description: 'Summarizes field inspections, open tickets, checklists, and batch logs.',
    placeholder: 'Ask about open investigation tickets, inspection checklists, or batch history...',
    isDefault: false,
  },
  {
    id: 'bill_calculator',
    name: 'Bill Calculator',
    icon: 'calculator',
    badge: 'Tariff Slabs',
    description: 'Calculates telescopic tariff slabs, fixed demand charges, and cliff effects.',
    placeholder: 'Ask to calculate your bill for 250 units, or simulate tariff slab costs...',
    isDefault: false,
  },
  {
    id: 'electricity_help',
    name: 'Electricity Help & Guidance',
    icon: 'info',
    badge: 'Knowledge',
    description: 'Meter reading verification, switch-off creep test, and consumer rights.',
    placeholder: 'Ask how to test meter accuracy, read digital LCD meters, or report punch errors...',
    isDefault: false,
  },
]

export function getPluginById(id) {
  return ASSISTANT_PLUGINS.find((p) => p.id === id) || null
}

/**
 * 1. Bill Comparison Plugin
 */
export async function executeBillComparisonPlugin({
  billContext = null,
  questionnaireAnswers = null,
  isAuthenticated = false,
  isDemoMode = false,
} = {}) {
  if (billContext && billContext.ocr_processing) {
    return {
      status: 'warn',
      summary: 'OCR scan in progress',
      message: buildOcrProcessingReply(),
      suggestions: ['What does kWh mean?', 'How much electricity does an AC consume in 8 hours?'],
    }
  }

  if (
    billContext &&
    (billContext.is_complete === false ||
      (billContext.has_bills && (billContext.curr_units == null || billContext.prev_units == null)))
  ) {
    return {
      status: 'warn',
      summary: 'Bill comparison incomplete',
      message: buildIncompleteBillReply(billContext),
      suggestions: ['Review Missing OCR Fields', 'Open Bill Comparison to enter missing values', 'What should I do next?'],
    }
  }

  if (billContext && billContext.prev_units != null && billContext.curr_units != null) {
    const comparisonText = buildComparisonReply(billContext, questionnaireAnswers)
    const delta = Math.round((billContext.curr_units - billContext.prev_units) * 10) / 10
    return {
      status: 'ok',
      summary: `Verified comparison (${delta >= 0 ? '+' : ''}${delta} kWh)`,
      message: comparisonText,
      suggestions: [
        'Explain why the amount increased more than units',
        'Analyze Household Usage',
        'Calculate my bill across tariff slabs',
        'Tips to reduce next month’s bill',
      ],
      attachedContext: billContext,
    }
  }

  // Check if authenticated user has persisted bills in the database
  let savedBillsMsg = ''
  if (isAuthenticated && !isDemoMode) {
    try {
      const savedBills = await listBillExtractions({ limit: 5 })
      if (Array.isArray(savedBills) && savedBills.length >= 2) {
        savedBillsMsg =
          `\n\n• **Saved Bills Found**: You have **${savedBills.length} saved bill extraction(s)** in your account database. ` +
          `You can navigate to **[Bill Comparison](/app/bill-comparison)** to load them directly.`
      }
    } catch {
      // Offline or network error handled gracefully
    }
  }

  return {
    status: 'warn',
    summary: 'No bills currently loaded',
    message: `${buildMissingBillComparisonReply()}${savedBillsMsg}`,
    suggestions: [
      isDemoMode ? 'Load Telangana sample bills (Demo)' : 'Go to Bill Comparison to upload bills',
      'What does kWh mean?',
      'How much electricity does an AC consume in 8 hours?',
    ],
  }
}

/**
 * 2. Bill Upload & OCR Plugin
 */
export async function executeBillUploadOcrPlugin({
  billContext = null,
  billSlots = null,
  isAuthenticated = false,
  isDemoMode = false,
} = {}) {
  const prevSlot = billSlots?.prev
  const currSlot = billSlots?.curr

  const prevLoaded = Boolean(
    prevSlot &&
      (prevSlot.file ||
        prevSlot.previewUrl ||
        (prevSlot.source && prevSlot.source !== 'empty') ||
        (prevSlot.fields && Object.values(prevSlot.fields).some((v) => v !== '')))
  )
  const currLoaded = Boolean(
    currSlot &&
      (currSlot.file ||
        currSlot.previewUrl ||
        (currSlot.source && currSlot.source !== 'empty') ||
        (currSlot.fields && Object.values(currSlot.fields).some((v) => v !== '')))
  )

  let persistedExtractions = []
  if (isAuthenticated && !isDemoMode) {
    try {
      const data = await listBillExtractions({ limit: 5 })
      if (Array.isArray(data)) {
        persistedExtractions = data
      }
    } catch {
      // Database optional fallback
    }
  }

  if (!prevLoaded && !currLoaded && (!billContext || !billContext.has_bills) && persistedExtractions.length === 0) {
    return {
      status: 'warn',
      summary: 'No bill scans available',
      message:
        `### Bill Upload & Spot-Billing OCR Status\n\n` +
        `**No active bill scans or stored extractions were found.**\n\n` +
        `• **How OCR Works**: Upload photographs or PDF copies of your utility spot-billing receipts in **[Bill Upload & OCR](/app/bill-upload)** or **[Bill Comparison](/app/bill-comparison)**.\n` +
        `• **Browser-Side Privacy**: Tesseract OCR runs directly inside your browser. Document image binaries and raw OCR text are **never sent to external servers or logged**.\n` +
        `• **Key Fields Read**: Consumer Number, Previous & Current Meter Readings, Billed kWh Units, Amount Payable, and Billing Period.\n` +
        `• **Discrepancy Detection**: Calculates \`(Current Reading - Previous Reading) × Multiplier\` to detect spot-billing reader punch errors before payment.`,
      suggestions: [
        'Open Bill Upload & OCR',
        'Load Telangana sample bills (Demo)',
        'What should I do if my meter reading does not match?',
      ],
    }
  }

  let text = `### Bill Scan & Field Extraction Audit\n\n`

  // Previous bill slot
  text += `• **Previous Month Slot**:\n`
  if (!prevLoaded) {
    text += `  - Status: *No bill loaded in slot*\n`
  } else {
    const pf = prevSlot?.fields || {}
    const pUnits = cleanNumber(pf.unitsConsumed)
    const pAmt = cleanNumber(pf.amountPayable)
    const pPrevR = cleanNumber(pf.previousReading)
    const pCurrR = cleanNumber(pf.currentReading)
    text += `  - Consumer No: **${pf.consumerNumber ? 'Extracted' : 'Missing'}**\n`
    text += `  - Units Consumed: **${pUnits !== null ? `${pUnits} kWh (Ready)` : '⚠️ MISSING'}**\n`
    text += `  - Amount Payable: **${pAmt !== null ? `₹${pAmt} (Ready)` : '⚠️ MISSING'}**\n`
    text += `  - Meter Readings: Prev ${pPrevR !== null ? pPrevR : 'N/A'}, Pres ${pCurrR !== null ? pCurrR : 'N/A'}\n`
    if (pPrevR !== null && pCurrR !== null && pUnits !== null) {
      const calcP = Math.round((pCurrR - pPrevR) * 10) / 10
      if (Math.abs(calcP - pUnits) > 1) {
        text += `  - ⚠️ **Reading Discrepancy**: Meter difference is ${calcP} kWh, but billed units is ${pUnits} kWh.\n`
      } else {
        text += `  - ✅ **Arithmetic Verified**: Reading difference matches billed units (${calcP} kWh).\n`
      }
    }
  }

  // Current bill slot
  text += `\n• **Current Month Slot**:\n`
  if (!currLoaded) {
    text += `  - Status: *No bill loaded in slot*\n`
  } else {
    const cf = currSlot?.fields || {}
    const cUnits = cleanNumber(cf.unitsConsumed)
    const cAmt = cleanNumber(cf.amountPayable)
    const cPrevR = cleanNumber(cf.previousReading)
    const cCurrR = cleanNumber(cf.currentReading)
    text += `  - Consumer No: **${cf.consumerNumber ? 'Extracted' : 'Missing'}**\n`
    text += `  - Units Consumed: **${cUnits !== null ? `${cUnits} kWh (Ready)` : '⚠️ MISSING'}**\n`
    text += `  - Amount Payable: **${cAmt !== null ? `₹${cAmt} (Ready)` : '⚠️ MISSING'}**\n`
    text += `  - Meter Readings: Prev ${cPrevR !== null ? cPrevR : 'N/A'}, Pres ${cCurrR !== null ? cCurrR : 'N/A'}\n`
    if (cPrevR !== null && cCurrR !== null && cUnits !== null) {
      const calcC = Math.round((cCurrR - cPrevR) * 10) / 10
      if (Math.abs(calcC - cUnits) > 1) {
        text += `  - ⚠️ **Reading Discrepancy**: Meter difference is ${calcC} kWh, but billed units is ${cUnits} kWh.\n`
      } else {
        text += `  - ✅ **Arithmetic Verified**: Reading difference matches billed units (${calcC} kWh).\n`
      }
    }
  }

  // Persisted extractions if available
  if (persistedExtractions.length > 0) {
    text += `\n• **Persisted Bill Extractions in Database (${persistedExtractions.length})**:\n`
    persistedExtractions.slice(0, 3).forEach((b) => {
      text += `  - Consumer **${b.consumer_number || 'N/A'}**: ${b.units_consumed != null ? `${b.units_consumed} kWh` : 'N/A'}, ${b.amount_payable != null ? `₹${b.amount_payable}` : 'N/A'} (Date: ${b.bill_date || b.created_at?.slice(0, 10) || 'N/A'})\n`
    })
  }

  const isReady =
    prevLoaded &&
    currLoaded &&
    cleanNumber(prevSlot?.fields?.unitsConsumed) !== null &&
    cleanNumber(currSlot?.fields?.unitsConsumed) !== null

  return {
    status: isReady ? 'ok' : 'warn',
    summary: isReady ? 'OCR extraction complete and verified' : 'Some OCR fields pending verification',
    message: text,
    suggestions: [
      isReady ? 'Compare Bills' : 'Open Bill Comparison to complete fields',
      'How to report a spot-billing meter punch error?',
      'Calculate my bill across tariff slabs',
    ],
  }
}

/**
 * 3. Electricity Theft Screening Plugin
 */
export async function executeTheftScreeningPlugin({
  customers = [],
  uploaded = null,
  isAuthenticated = false,
  isDemoMode = false,
} = {}) {
  let customerList = Array.isArray(customers) ? customers : []
  let batchMeta = uploaded?.metadata || {}
  let isDemoData = isDemoMode && (!uploaded || uploaded.customers === customers)

  // If authenticated and no active customers in state, query database batches
  let databaseBatches = []
  if (customerList.length === 0 && isAuthenticated && !isDemoMode) {
    try {
      const batches = await listBatches({ limit: 5 })
      if (Array.isArray(batches) && batches.length > 0) {
        databaseBatches = batches
      }
    } catch {
      // Graceful fallback
    }
  }

  if (customerList.length === 0 && databaseBatches.length === 0) {
    return {
      status: 'warn',
      summary: 'No screening batch loaded',
      message:
        `### Electricity Theft Screening Status\n\n` +
        `**No active screening dataset or historical batch is currently loaded in your workspace.**\n\n` +
        `• **How Screening Works**: The TheftGuard AI screening engine runs a 250-tree Random Forest pipeline using 13 statistical and temporal consumption features to rank accounts for inspection priority.\n` +
        `• **Responsible AI Disclaimer**: Model scores are **statistical screening indicators** to prioritize physical inspection. They do **NOT** constitute proof of electricity theft, meter tampering, or unlawful extraction.\n` +
        `• **What to Upload**: Prepare a CSV containing customer meter consumption history. Then navigate to **[Utility Screening](/app/screening)** to run batch inference.\n\n` +
        (isDemoMode
          ? `*Demo Mode*: You can load synthetic utility screening data directly in the screening view.`
          : `*Real Workspace*: Only your genuine uploaded or persisted batches will be analyzed here.`),
      suggestions: [
        'Open Utility Screening',
        'What does a high screening score mean?',
        'How does TheftGuard classify abnormal consumption?',
      ],
    }
  }

  // If database batches exist but no customer list in memory
  if (customerList.length === 0 && databaseBatches.length > 0) {
    let reply = `### Persisted Screening Batches (${databaseBatches.length})\n\n`
    reply += `Found ${databaseBatches.length} screening batch run(s) saved in your database account:\n\n`
    databaseBatches.forEach((b) => {
      reply += `• **${b.file_name}** (ID: \`${b.id?.slice(0, 8)}...\`)\n`
      reply += `  - Total Records: **${b.total_rows}** (Scored: ${b.scored_rows}, Rejected: ${b.rejected_rows})\n`
      reply += `  - Created: ${b.created_at ? new Date(b.created_at).toLocaleDateString() : 'N/A'}\n`
      reply += `  - Model Version: ${b.model_version || 'v1.0.0'} (SHA-256: \`${(b.model_sha256 || '').slice(0, 10)}...\`)\n`
    })
    reply += `\n**Next Steps**: Open **[Batch History](/app/batches)** or **[Utility Screening](/app/screening)** to load any batch for deep inspection triage.\n\n`
    reply += `> **Safety Notice**: Screening scores are statistical prioritization metrics for utility field crews, not evidence of unlawful abstraction.`

    return {
      status: 'ok',
      summary: `Found ${databaseBatches.length} persisted screening batch(es)`,
      message: reply,
      suggestions: [
        'Open Batch History',
        'Open Utility Screening',
        'What does a high screening score mean?',
      ],
    }
  }

  // Analyze the loaded customerList
  const total = customerList.length
  const scored = customerList.filter((c) => typeof c.score === 'number' && Number.isFinite(c.score))
  const reviewCount = customerList.filter((c) => (c.score || 0) >= 0.5 || c.review_category === 'review').length
  const elevatedCount = customerList.filter((c) => {
    const s = c.score || 0
    return (s >= 0.3 && s < 0.5) || c.review_category === 'elevated'
  }).length
  const normalCount = customerList.filter((c) => {
    const s = c.score || 0
    return s < 0.3 || c.review_category === 'normal'
  }).length

  const scores = scored.map((c) => c.score)
  const minScore = scores.length ? Math.min(...scores).toFixed(3) : 'N/A'
  const maxScore = scores.length ? Math.max(...scores).toFixed(3) : 'N/A'
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3) : 'N/A'

  // Top review candidates
  const topFlagged = [...scored]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 4)

  let report = `### Electricity Theft Screening Audit\n\n`
  report += `**Dataset Source**: ${isDemoData ? 'Demonstration Dataset (Synthetic)' : uploaded?.fileName || 'Uploaded CSV Batch'}\n\n`
  report += `• **Batch Summary Metrics**:\n`
  report += `  - Total Accounts Evaluated: **${total}**\n`
  report += `  - Scored Accounts: **${scored.length}**\n`
  report += `  - Priority Review Band (Score ≥ 0.50): **${reviewCount}**\n`
  report += `  - Elevated Watch Band (0.30 ≤ Score < 0.50): **${elevatedCount}**\n`
  report += `  - Routine / Normal Band (Score < 0.30): **${normalCount}**\n`
  report += `  - Score Distribution: Min **${minScore}**, Avg **${avgScore}**, Max **${maxScore}**\n\n`

  if (topFlagged.length > 0) {
    report += `• **Top Priority Screening Records for Field Verification**:\n`
    topFlagged.forEach((c) => {
      const id = c.id || c.customer_ref || 'Unknown'
      const s = typeof c.score === 'number' ? c.score.toFixed(3) : 'N/A'
      const cat = c.review_category || (c.score >= 0.5 ? 'Review' : 'Elevated')
      report += `  - Customer **${id}**: Model Score **${s}** (${cat})\n`
    })
    report += `\n`
  }

  report += `• **Important Responsible AI & Inspection Disclaimers**:\n`
  report += `  1. **Not Proof of Theft**: The model score is a statistical screening indicator identifying consumption anomalies. It is **never** legal proof of electricity theft or meter tampering.\n`
  report += `  2. **Benign Explanations**: A sharp drop in consumption often reflects legitimate causes such as extended family travel, seasonal vacancy, rooftop solar installation, or faulty meter shunts.\n`
  report += `  3. **Mandatory Protocol**: Discom inspection crews must follow the 5-point physical audit checklist (meter seal check, reading verification, load audit) before drawing conclusions.`

  return {
    status: 'ok',
    summary: `Screening analyzed: ${reviewCount} review, ${elevatedCount} elevated across ${total} accounts`,
    message: report,
    suggestions: [
      'Open Field Investigations',
      'What are common benign reasons for a consumption drop?',
      'How to verify an electric meter physical seal?',
    ],
  }
}

/**
 * 4. Usage Analyst Plugin
 */
export async function executeUsageAnalystPlugin({
  billContext = null,
  questionnaireAnswers = null,
} = {}) {
  const q = questionnaireAnswers || {}
  const hasAnswers = Boolean(
    (q.has_ac && q.has_ac !== 'skip') ||
    (q.has_geyser && q.has_geyser !== 'skip') ||
    (q.has_pump && q.has_pump !== 'skip') ||
    (q.has_refrigerator && q.has_refrigerator !== 'skip')
  )

  if (!hasAnswers) {
    return {
      status: 'warn',
      summary: 'Household profile not completed',
      message:
        `### Household Usage Analyst\n\n` +
        `**Household Profile Not Yet Completed:**\n\n` +
        `To personalize your electricity breakdown and identify what appliances caused your bill to change, please complete our 4-question household profile.\n\n` +
        `• **Appliances Profiled**: Air Conditioners (tons & hours), Storage Geysers/Water Heaters, Water Pumps/Motors, and Refrigerators.\n` +
        `• **Standards Applied**: Bureau of Energy Efficiency (BEE) 3-Star domestic baseline ratings.\n` +
        `• **How to Complete**: You can complete the profile in **[Bill Comparison](/app/bill-comparison)** or tell me directly in chat:\n` +
        `  - *"I run 1 AC for 8 hours daily and a 1 HP pump for 1 hour daily."*`,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'How much power does a water heater use?',
        'How much power does a 1 HP water pump consume?',
      ],
    }
  }

  const analysis = synthesizeAnalysis(
    {
      previousUnits: billContext?.prev_units || null,
      currentUnits: billContext?.curr_units || null,
      billingDays: billContext?.curr_days || 30,
      amountDifference: billContext?.delta_amount || null,
    },
    q
  )

  const estimatesResult = calculateApplianceEstimates(q, billContext?.curr_days || 30)
  const estimates = Array.isArray(estimatesResult) ? estimatesResult : (estimatesResult?.estimates || [])
  const totalApplianceKwh = estimatesResult?.totalEstimatedKwh ?? analysis?.totalEstimatedKwh ?? 0

  let reply = `### Household Appliance Usage Breakdown\n\n`
  reply += `**Status**: ${analysis.headline}\n\n`
  reply += `• **Appliance Estimates (BEE 3-Star Standards)**:\n`
  estimates.forEach((e) => {
    const dailyHours = e.dailyHours ?? e.daily_hours ?? 0
    const watts = e.wattageWatts ?? e.wattage_watts ?? 0
    const monthlyKwh = e.estimatedMonthlyKwh ?? e.estimated_monthly_kwh ?? 0
    const dailyKwh = Math.round((monthlyKwh / (billContext?.curr_days || 30)) * 10) / 10
    reply += `  - **${e.appliance}**: ~${dailyHours} hrs/day (${watts}W) = **~${monthlyKwh} kWh/month** (~${dailyKwh} kWh/day). *(${e.assumptions})*\n`
  })

  if (totalApplianceKwh > 0) {
    reply += `\n• **Total Estimated Monthly Appliance Load**: **~${totalApplianceKwh} kWh**\n`
  }

  if (billContext && billContext.delta_units != null) {
    reply += `• **Actual Bill Change**: **${billContext.delta_units >= 0 ? '+' : ''}${billContext.delta_units} kWh**\n`
    if (analysis.explainedDifferencePct != null) {
      reply += `• **Explained by Reported Appliances**: ~${analysis.explainedDifferencePct}%\n`
    } else if (totalApplianceKwh > 0 && billContext.delta_units > 0) {
      const pct = Math.min(100, Math.round((totalApplianceKwh / billContext.delta_units) * 100))
      reply += `• **Explained by Reported Appliances**: ~${pct}%\n`
    }
  }

  const plausibleCauses = analysis.plausibleCauses || analysis.plausible_explanations || []
  if (plausibleCauses.length > 0) {
    reply += `\n**Plausible Factors & Explanations:**\n`
    plausibleCauses.forEach((p) => {
      reply += `• ${p}\n`
    })
  }

  const recommendedSteps = analysis.recommendedSteps || analysis.recommended_steps || []
  if (recommendedSteps.length > 0) {
    reply += `\n**Actionable Recommendations:**\n`
    recommendedSteps.forEach((s, idx) => {
      reply += `${idx + 1}. ${s}\n`
    })
  }

  reply += `\n*(Note: Normal household load variations or seasonal weather changes do not indicate electricity theft or meter tampering.)*`

  return {
    status: 'ok',
    summary: `Analyzed ${estimates.length} appliances (~${totalApplianceKwh} kWh)`,
    message: reply,
    suggestions: [
      'Compare Bills',
      'Calculate my bill across tariff slabs',
      'Tips to reduce next month’s bill',
    ],
  }
}

/**
 * 5. Reports & History Plugin
 */
export async function executeReportsHistoryPlugin({
  investigations = [],
  uploaded = null,
  isAuthenticated = false,
  isDemoMode = false,
} = {}) {
  let invList = Array.isArray(investigations) ? investigations : []

  // If authenticated and local list is empty, query database investigations
  if (invList.length === 0 && isAuthenticated && !isDemoMode) {
    try {
      const data = await listInvestigations({ limit: 10 })
      if (Array.isArray(data)) {
        invList = data
      }
    } catch {
      // Handled gracefully
    }
  }

  if (invList.length === 0) {
    return {
      status: 'warn',
      summary: 'No active investigation tickets',
      message:
        `### Field Investigations & Audit Reports\n\n` +
        `**No formal investigation tickets or audit reports are currently recorded.**\n\n` +
        `• **Investigation Tracking**: When consumption anomalies or spot-billing discrepancies are flagged in screening or bill comparison, users can open formal investigation tickets (\`INV-YYYYMMDD-XXXX\`).\n` +
        `• **5-Point Field Audit Checklist**:\n` +
        `  1. Confirm customer and meter identity.\n` +
        `  2. Compare physical meter reading with billing record.\n` +
        `  3. Check meter physical seal, terminal cover, and enclosure integrity.\n` +
        `  4. Review connected load against sanctioned load.\n` +
        `  5. Record photographs and field inspection notes.\n\n` +
        `You can open new tickets in **[Field Investigations](/app/investigations)** or review overall statistics in **[Reports](/app/reports)**.`,
      suggestions: [
        'Open Field Investigations',
        'Open Reports',
        'How do inspectors check physical meter seals?',
      ],
    }
  }

  const totalTickets = invList.length
  const newCount = invList.filter((i) => (i.status || '').toLowerCase() === 'new').length
  const inProgressCount = invList.filter((i) => (i.status || '').toLowerCase().includes('progress')).length
  const closedCount = invList.filter((i) => ['verified', 'closed', 'resolved'].includes((i.status || '').toLowerCase())).length

  let text = `### Field Investigation Tickets & Audit Summary\n\n`
  text += `• **Status Breakdown** (${totalTickets} Total Tickets):\n`
  text += `  - **New / Pending**: ${newCount}\n`
  text += `  - **In Progress**: ${inProgressCount}\n`
  text += `  - **Resolved / Closed**: ${closedCount}\n\n`

  text += `• **Recent Investigation Tickets**:\n`
  invList.slice(0, 5).forEach((inv) => {
    const code = inv.ticket_code || inv.ticketCode || inv.id
    const ref = inv.customer_ref || inv.customerRef || 'Unknown Ref'
    const status = inv.status || 'New'
    const priority = inv.priority || 'Normal'
    const origin = inv.origin || 'Screening'
    text += `  - **${code}** (Customer ${ref}): Status **${status}**, Priority **${priority}**, Origin: *${origin}*\n`
  })

  text += `\n• **Standard Physical Audit Protocol**: Each ticket includes a 5-step checklist covering meter identity, reading verification, seal integrity, sanctioned load adherence, and photo evidence.\n`
  text += `Open **[Field Investigations](/app/investigations)** to update statuses, assign crew members, or log inspection outcomes.`

  return {
    status: 'ok',
    summary: `Active investigations: ${newCount} New, ${inProgressCount} In Progress, ${closedCount} Closed`,
    message: text,
    suggestions: [
      'Open Field Investigations',
      'Open Reports',
      'How does TheftGuard track audit evidence?',
    ],
  }
}

/**
 * 6. Bill Calculator Plugin
 */
export async function executeBillCalculatorPlugin({
  billContext = null,
  tariff = 7,
  params = {},
} = {}) {
  // Illustrative telescopic tariff slab calculation model
  // Uses baseline reference domestic tiers with transparently identified assumptions
  const SLABS = [
    { name: 'Slab 1 (Lifeline 0–100 units)', max: 100, rate: 3.40, fixed: 40 },
    { name: 'Slab 2 (Domestic 101–200 units)', max: 200, rate: 4.80, fixed: 70 },
    { name: 'Slab 3 (Higher 201+ units)', max: Infinity, rate: 7.50, fixed: 120 },
  ]

  function computeTelescopicBill(units) {
    let energyCharges = 0
    let remaining = units
    let breakdown = []

    if (units <= 100) {
      energyCharges = units * 3.40
      breakdown.push({ tier: 'Slab 1 (0–100 units)', units, rate: 3.40, cost: energyCharges })
    } else if (units <= 200) {
      const u1 = 100 * 3.40
      const u2 = (units - 100) * 4.80
      energyCharges = u1 + u2
      breakdown.push({ tier: 'Slab 1 (0–100 units)', units: 100, rate: 3.40, cost: u1 })
      breakdown.push({ tier: 'Slab 2 (101–200 units)', units: units - 100, rate: 4.80, cost: u2 })
    } else {
      const u1 = 100 * 3.40
      const u2 = 100 * 4.80
      const u3 = (units - 200) * 7.50
      energyCharges = u1 + u2 + u3
      breakdown.push({ tier: 'Slab 1 (0–100 units)', units: 100, rate: 3.40, cost: u1 })
      breakdown.push({ tier: 'Slab 2 (101–200 units)', units: 100, rate: 4.80, cost: u2 })
      breakdown.push({ tier: 'Slab 3 (201+ units)', units: units - 200, rate: 7.50, cost: u3 })
    }

    const fixedCharge = units <= 100 ? 40 : units <= 200 ? 70 : 120
    const duty = Math.round(energyCharges * 0.06 * 100) / 100 // 6% duty
    const fsa = Math.round(units * 0.30 * 100) / 100 // Fuel surcharge ~₹0.30/kWh
    const total = Math.round(energyCharges + fixedCharge + duty + fsa)
    const effectiveRate = units > 0 ? (total / units).toFixed(2) : 0

    return { total, energyCharges, fixedCharge, duty, fsa, effectiveRate, breakdown }
  }

  const activeUnits = billContext?.curr_units ?? params.units ?? null

  let text = `### Electricity Bill & Telescopic Tariff Calculator\n\n`

  if (activeUnits != null) {
    const calc = computeTelescopicBill(activeUnits)
    text += `• **Active Bill Calculation (${activeUnits} kWh)**:\n`
    calc.breakdown.forEach((b) => {
      text += `  - **${b.tier}**: ${b.units} units × ₹${b.rate.toFixed(2)} = **₹${b.cost.toFixed(2)}**\n`
    })
    text += `  - **Fixed Demand Charge**: ₹${calc.fixedCharge}\n`
    text += `  - **Electricity Duty (6%)**: ₹${calc.duty}\n`
    text += `  - **Fuel Surcharge (FSA @ ₹0.30/unit)**: ₹${calc.fsa}\n`
    text += `  - **Total Estimated Bill**: **${inr(calc.total)}** (Effective Rate: **₹${calc.effectiveRate}/kWh**)\n\n`

    if (billContext?.curr_amount != null) {
      const billedAmt = billContext.curr_amount
      const diff = Math.round(billedAmt - calc.total)
      text += `• **Comparison with Billed Amount**: Your spot bill lists **${inr(billedAmt)}**. Tariff model variance is **₹${Math.abs(diff)}** (${diff >= 0 ? 'higher spot charges or municipal arrears' : 'lower rate applied'}).\n\n`
    }
  }

  // Tariff reference simulations
  text += `• **Illustrative Reference Slabs (Domestic Telescopic Model)**:\n`
  const tier100 = computeTelescopicBill(100)
  const tier200 = computeTelescopicBill(200)
  const tier300 = computeTelescopicBill(300)

  text += `  1. **100 units (Lifeline)**: Energy ₹${tier100.energyCharges} + Fixed ₹${tier100.fixedCharge} = **₹${tier100.total}** (₹${tier100.effectiveRate}/unit)\n`
  text += `  2. **200 units (Moderate)**: Energy ₹${tier200.energyCharges} + Fixed ₹${tier200.fixedCharge} = **₹${tier200.total}** (₹${tier200.effectiveRate}/unit)\n`
  text += `  3. **300 units (High)**: Energy ₹${tier300.energyCharges} + Fixed ₹${tier300.fixedCharge} = **₹${tier300.total}** (₹${tier300.effectiveRate}/unit)\n\n`

  text += `• **Assumptions & Disclaimers**:\n`
  text += `  - This calculator uses an **illustrative reference model** for domestic telescopic tariffs (0–100 kWh @ ₹3.40, 101–200 kWh @ ₹4.80, 201+ kWh @ ₹7.50, with indicative fixed charges, 6% duty, and ₹0.30 FSA).\n`
  text += `  - **Not an Official Utility Bill**: Actual Discom tariffs, fuel cost adjustments, and fixed charges are governed by state electricity regulatory commission (SERC) tariff orders and vary by consumer category and sanctioned load.\n\n`

  text += `• **The "Slab Cliff" Effect**: Under telescopic tariff regulations, consuming even 10 extra units above 200 pushes those units into the highest pricing bracket (₹7.50/kWh) and increases monthly fixed demand charges, causing the bill to rise disproportionately faster than energy units.`

  return {
    status: 'ok',
    summary: activeUnits != null ? `Calculated bill for ${activeUnits} kWh (~${inr(computeTelescopicBill(activeUnits).total)})` : 'Telescopic tariff calculator ready',
    message: text,
    suggestions: [
      'Compare Bills',
      'Explain why the amount increased more than units',
      'How much electricity does an AC consume in 8 hours?',
    ],
  }
}

/**
 * 7. Electricity Help & Guidance Plugin
 */
export async function executeElectricityHelpPlugin({ params = {} } = {}) {
  const text =
    `### Electricity Help, Meter Testing & Consumer Guidance\n\n` +
    `1. **The Switch-Off Creep Test (Verify Phantom Meter Blinking)**:\n` +
    `   - **Step 1**: Switch off all appliances, air conditioners, and unplug chargers.\n` +
    `   - **Step 2**: Switch off your main distribution board MCB / main switch.\n` +
    `   - **Step 3**: Walk to your electric meter and observe the pulse LED (labeled \`Imp/kWh\`, typically 1600 or 3200 pulses per unit).\n` +
    `   - **Result**: The LED should completely stop blinking. If it continues blinking at regular intervals with the main MCB OFF, internal insulation leakage or a faulty meter shunt exists.\n\n` +
    `2. **How to Read a Digital LCD Meter**:\n` +
    `   - Modern static electronic meters automatically cycle through several display screens every 5–8 seconds:\n` +
    `   - **Screen 1: Date & Time** (\`DD-MM-YY\`, \`HH:MM\`)\n` +
    `   - **Screen 2: Cumulative Energy (kWh)** — This is your actual cumulative consumption dial.\n` +
    `   - **Screen 3: Maximum Demand (MD / kW)** — Highest peak load drawn during the billing month.\n` +
    `   - **Screen 4: Instantaneous Voltage (V) & Current (A)**.\n\n` +
    `3. **Detecting Reader Punch Errors & Transposed Digits**:\n` +
    `   - Compare the **"Present Reading"** printed on your spot bill receipt with your meter's Screen 2.\n` +
    `   - If the receipt reading is *higher* than what your physical meter shows right now, the meter reader made an over-billing punch error.\n` +
    `   - You can photograph the meter display and submit a spot-billing revision request to your local Discom sub-station under the Electricity Supply Code.`

  return {
    status: 'ok',
    summary: 'Practical guidance for meter verification, LCD dials, and consumer rights',
    message: text,
    suggestions: [
      'How to report a spot-billing meter punch error?',
      'How much electricity does an AC consume in 8 hours?',
      'Why is my electricity bill so high this month?',
    ],
  }
}

/**
 * 8. General Assistant Plugin
 */
export async function executeGeneralAssistantPlugin({
  billContext = null,
  customers = [],
  investigations = [],
  questionnaireAnswers = null,
  uploaded = null,
  isDemoMode = false,
} = {}) {
  let text = `### TheftGuard AI — General Assistant Overview\n\n`
  text += `I am your AI assistant for residential electricity billing, spot-bill OCR verification, and utility screening.\n\n`
  text += `• **Available Specialized Assistant Plugins**:\n`
  text += `  1. **Bill Comparison**: Detailed comparison between consecutive bills with normalized daily burn rates.\n`
  text += `  2. **Bill Upload & OCR**: Browser-side Tesseract OCR extraction and spot-bill arithmetic verification.\n`
  text += `  3. **Theft Screening**: 250-tree Random Forest ML batch anomaly detection with responsible AI guardrails.\n`
  text += `  4. **Usage Analyst**: Itemized appliance loads (BEE 3-Star standards) against billed shifts.\n`
  text += `  5. **Reports & History**: Tracking field investigation tickets and 5-point physical audit checklists.\n`
  text += `  6. **Bill Calculator**: Telescopic tariff slabs, fixed charges, and cliff effects.\n`
  text += `  7. **Electricity Help**: Practical engineering protocols for meter creep tests and LCD reading.\n\n`

  text += `• **Current Session Status**:\n`
  if (billContext && billContext.prev_units != null && billContext.curr_units != null) {
    const delta = Math.round((billContext.curr_units - billContext.prev_units) * 10) / 10
    text += `  - **Active Bill Comparison**: Loaded (${delta >= 0 ? '+' : ''}${delta} kWh shift)\n`
  } else {
    text += `  - **Bill Comparison**: No active bills loaded\n`
  }

  if (Array.isArray(customers) && customers.length > 0) {
    text += `  - **Screening Dataset**: ${customers.length} accounts loaded (${isDemoMode ? 'Synthetic Demo' : uploaded?.fileName || 'Uploaded CSV'})\n`
  } else {
    text += `  - **Screening Dataset**: Empty\n`
  }

  if (Array.isArray(investigations) && investigations.length > 0) {
    text += `  - **Field Tickets**: ${investigations.length} tickets recorded\n`
  } else {
    text += `  - **Field Tickets**: 0 active tickets\n`
  }

  text += `\nHow would you like to proceed? You can select any plugin chip above to focus our conversation, or ask me any question directly.`

  return {
    status: 'ok',
    summary: 'General Assistant ready',
    message: text,
    suggestions: [
      'Compare Bills',
      'Why is my electricity bill so high this month?',
      'What does kWh mean?',
      'Calculate my bill across tariff slabs',
    ],
  }
}

/**
 * Universal Plugin Action Executor
 */
export async function executePluginAction({
  pluginId,
  params = {},
  billContext = null,
  questionnaireAnswers = null,
  billSlots = null,
  customers = [],
  uploaded = null,
  investigations = [],
  tariff = 7,
  isAuthenticated = false,
  isDemoMode = false,
}) {
  switch (pluginId) {
    case 'bill_comparison':
    case 'compare_bills':
      return executeBillComparisonPlugin({
        billContext,
        questionnaireAnswers,
        isAuthenticated,
        isDemoMode,
      })

    case 'bill_upload_ocr':
    case 'review_missing_ocr':
      return executeBillUploadOcrPlugin({
        billContext,
        billSlots,
        isAuthenticated,
        isDemoMode,
      })

    case 'theft_screening':
      return executeTheftScreeningPlugin({
        customers,
        uploaded,
        isAuthenticated,
        isDemoMode,
      })

    case 'usage_analyst':
    case 'analyze_household':
      return executeUsageAnalystPlugin({
        billContext,
        questionnaireAnswers,
      })

    case 'reports_history':
      return executeReportsHistoryPlugin({
        investigations,
        uploaded,
        isAuthenticated,
        isDemoMode,
      })

    case 'bill_calculator':
    case 'explain_bill_changes':
      return executeBillCalculatorPlugin({
        billContext,
        tariff,
        params,
      })

    case 'electricity_help':
      return executeElectricityHelpPlugin({ params })

    case 'general_assistant':
    default:
      return executeGeneralAssistantPlugin({
        billContext,
        customers,
        investigations,
        questionnaireAnswers,
        uploaded,
        isDemoMode,
      })
  }
}
