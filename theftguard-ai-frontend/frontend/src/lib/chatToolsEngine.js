/**
 * TheftGuard AI — Grounded Application Tools Engine
 *
 * Connects the AI Chat Workspace to real application workflows and verified bill data.
 * Zero-Hallucination Guarantee:
 * - Tools NEVER invent metrics or claim an action succeeded when data is missing.
 * - When data is missing, tools return actionable guidance and navigation links.
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

export const CHAT_TOOLS = [
  {
    id: 'compare_bills',
    name: 'Compare Bills',
    icon: 'file',
    description: 'Compares your previous and current electricity bills with verified metrics.',
    badge: 'Dual-Bill',
  },
  {
    id: 'analyze_household',
    name: 'Analyze Household Usage',
    icon: 'overview',
    description: 'Itemizes appliance consumption (AC, geysers, pumps) against your bill shift.',
    badge: 'Profile',
  },
  {
    id: 'estimate_appliance',
    name: 'Estimate Appliance Load',
    icon: 'model',
    description: 'Calculates energy draw and running cost for ACs, water heaters, pumps, and fridges.',
    badge: 'Estimator',
  },
  {
    id: 'explain_bill_changes',
    name: 'Explain Bill Changes',
    icon: 'compare',
    description: 'Detailed analysis of daily burn rate, telescopic tariff slabs, and effective rates.',
    badge: 'Tariff',
  },
  {
    id: 'review_missing_ocr',
    name: 'Review Missing OCR Fields',
    icon: 'bill',
    description: 'Audits scanned bill slots and identifies missing values needed for comparison.',
    badge: 'OCR Audit',
  },
]

/**
 * Executes a chosen tool action with grounded data from the application state or session context.
 */
export async function executeChatTool({
  toolId,
  params = {},
  billContext = null,
  questionnaireAnswers = null,
  billSlots = null,
}) {
  switch (toolId) {
    case 'compare_bills':
      return executeCompareBills(billContext, questionnaireAnswers)

    case 'analyze_household':
      return executeAnalyzeHousehold(billContext, questionnaireAnswers)

    case 'estimate_appliance':
      return executeEstimateAppliance(params, billContext)

    case 'explain_bill_changes':
      return executeExplainBillChanges(billContext)

    case 'review_missing_ocr':
      return executeReviewMissingOcr(billContext, billSlots)

    default:
      return {
        status: 'error',
        summary: `Unknown tool "${toolId}"`,
        message: `The tool action "${toolId}" is not recognized. Please choose an action from the tools menu.`,
        suggestions: ['Compare Bills', 'Estimate Appliance Load', 'Analyze Household Usage'],
      }
  }
}

/**
 * Tool 1: Compare Bills
 */
function executeCompareBills(billContext, questionnaireAnswers) {
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
      suggestions: ['Review Missing OCR Fields', 'What should I do next?'],
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
        'Tips to reduce next month’s bill',
      ],
      attachedContext: billContext,
    }
  }

  return {
    status: 'warn',
    summary: 'No bills currently loaded',
    message: buildMissingBillComparisonReply(),
    suggestions: [
      'Load sample bills in Bill Comparison',
      'What does kWh mean?',
      'How much electricity does an AC consume in 8 hours?',
    ],
  }
}

/**
 * Tool 2: Analyze Household Usage
 */
function executeAnalyzeHousehold(billContext, questionnaireAnswers) {
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
      summary: 'Household profile is empty',
      message:
        `**Household Usage Profile Not Completed Yet:**\n\n` +
        `To personalize your electricity breakdown and identify why your bill changed, please answer our quick 4-question household profile.\n\n` +
        `• **What it checks**: Air conditioner hours, water heater (geyser) duration, and water motor / pump usage.\n` +
        `• **How to complete**: You can open the **Household Usage Profile** tab in the assistant drawer or complete it directly in [Bill Comparison](/app/bill-comparison).\n\n` +
        `Alternatively, you can ask me directly: *"I use 1 AC for 8 hours every day. How much does it add to my bill?"*`,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'How much power does a water heater use?',
        'How much power does a water pump consume?',
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
    structuredAnalysis: analysis,
    suggestions: [
      'Compare Bills',
      'Tips to reduce next month’s bill',
      'How do tariff slabs work?',
    ],
  }
}

/**
 * Tool 3: Estimate Appliance Load
 */
function executeEstimateAppliance(params = {}, billContext = null) {
  const appliance = (params.appliance || 'ac').toLowerCase()
  const hours = typeof params.hours === 'number' ? params.hours : 8.0
  const count = typeof params.count === 'number' ? params.count : 1

  if (appliance.includes('ac') || appliance.includes('air')) {
    const text = buildAcReply(hours, count, billContext)
    return {
      status: 'ok',
      summary: `Estimated ${count} AC(s) for ${hours}h/day`,
      message: text,
      suggestions: [
        'And if I run it for 4 hours instead?',
        'How much electricity does a water heater use?',
        'How much power does a water pump consume?',
      ],
    }
  }

  if (appliance.includes('geyser') || appliance.includes('water heater') || appliance.includes('heater')) {
    const dailyKwh = Math.round(hours * 2.0 * 10) / 10
    const monthlyKwh = Math.round(dailyKwh * 30 * 10) / 10
    const cost = Math.round(monthlyKwh * 7)

    const text =
      `**Water Heater / Geyser Power Consumption Estimate:**\n\n` +
      `• **Rating**: Standard 15L to 25L storage geysers use a **2,000-watt (2 kW)** heating element.\n` +
      `• **Rate of Consumption**: A 2 kW geyser consumes **2.0 units (kWh) for every 1 hour** of continuous heating.\n` +
      `• **Daily & Monthly Load**: Running it for **${hours} hour(s) daily** consumes ~**${dailyKwh} units/day** (**~${monthlyKwh} units/month**), adding roughly **₹${cost}** to your monthly bill.\n\n` +
      `*Tip*: Turn off the geyser 15–20 minutes before bathing. Leaving a geyser on all day wastes 1.5 to 2.5 units daily in standby standing thermal losses alone.`

    return {
      status: 'ok',
      summary: `Estimated Geyser for ${hours}h/day (~${monthlyKwh} kWh/mo)`,
      message: text,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'How much power does a water pump consume?',
        'Tips to reduce next month’s bill',
      ],
    }
  }

  if (appliance.includes('pump') || appliance.includes('motor') || appliance.includes('borewell')) {
    const dailyKwh = Math.round(hours * 0.75 * 10) / 10
    const monthlyKwh = Math.round(dailyKwh * 30 * 10) / 10
    const cost = Math.round(monthlyKwh * 7)

    const text =
      `**Water Pump / Motor Power Consumption Estimate:**\n\n` +
      `• **1 HP Pump / Borewell (750W)**: Consumes approximately **0.75 units (kWh) per running hour**.\n` +
      `• **0.5 HP Booster Pump (375W)**: Consumes approximately **0.38 units (kWh) per running hour**.\n` +
      `• **Daily & Monthly Load**: Running a 1 HP pump for **${hours} hour(s) daily** adds ~**${dailyKwh} units/day** (**~${monthlyKwh} units/month**, roughly **₹${cost}**/month).\n\n` +
      `*Tip*: Install an automatic overhead water-level controller to avoid continuous overflow, which is one of the most common causes of unnoticed bill jumps.`

    return {
      status: 'ok',
      summary: `Estimated 1HP Pump for ${hours}h/day (~${monthlyKwh} kWh/mo)`,
      message: text,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'How can I check if my meter reading is accurate?',
        'Tips to reduce next month’s bill',
      ],
    }
  }

  // Refrigerator default
  const text =
    `**Refrigerator Power Consumption Estimate:**\n\n` +
    `• **Standard 250L Frost-Free (3-Star)**: Draws ~150W rated power, running auto-cycling compressors 24/7. It consumes approximately **1.0 unit (kWh) per day** (~30 to 35 units per month, ~₹210 to ₹250/mo).\n` +
    `• **Direct-Cool Single Door (190L)**: Uses less power, averaging **0.75 units/day** (~22 to 25 units/month).\n` +
    `• **Large Multi-Door (400L+)**: Averages **1.5 to 1.8 units/day** (~45 to 55 units/month).\n\n` +
    `*Check*: If the rubber door gasket is loose or worn, warm air enters continuously, causing the compressor to run double duty and raising power consumption significantly.`

  return {
    status: 'ok',
    summary: 'Estimated Refrigerator (~30-35 kWh/mo)',
    message: text,
    suggestions: [
      'How much electricity does an AC consume in 8 hours?',
      'How much power does a water heater use?',
      'Tips to reduce next month’s bill',
    ],
  }
}

/**
 * Tool 4: Explain Bill Changes
 */
function executeExplainBillChanges(billContext) {
  if (!billContext || billContext.is_complete === false || billContext.prev_units == null || billContext.curr_units == null) {
    return {
      status: 'warn',
      summary: 'Requires active bill comparison',
      message:
        `To explain the exact changes in your bill, I need two consecutive bills loaded in **Bill Comparison** (/app/bill-comparison).\n\n` +
        `**Key Drivers Behind Household Bill Increases:**\n` +
        `1. **Telescopic Tariff Slabs (The Cliff Effect)**: Crossing a monthly threshold (e.g. 100 or 200 units) triggers higher per-unit rates and higher fixed demand charges.\n` +
        `2. **Billing Cycle Days Difference**: A 33-day bill naturally shows higher total units than a 29-day bill even if daily burn rate stayed constant.\n` +
        `3. **Higher Ambient Heat**: High outdoor temperatures force AC compressors to run twice as long to maintain room setpoint temperatures.\n` +
        `4. **Reader Punch Errors**: An inaccurate spot-billing digit causes an immediate artificial unit jump.\n\n` +
        `You can click **"Load Telangana sample bills (Demo)"** in Bill Comparison to explore a live side-by-side analysis!`,
      suggestions: ['Compare Bills', 'What does kWh mean?', 'How do tariff slabs work?'],
    }
  }

  const prevU = billContext.prev_units
  const currU = billContext.curr_units
  const deltaU = Math.round((currU - prevU) * 10) / 10
  const pctU = prevU > 0 ? Math.round(((currU - prevU) / prevU) * 1000) / 10 : 0
  const prevA = billContext.prev_amount
  const currA = billContext.curr_amount
  const deltaA = prevA != null && currA != null ? Math.round(currA - prevA) : null
  const pctA = prevA && prevA > 0 ? Math.round(((currA - prevA) / prevA) * 1000) / 10 : null
  const prevD = billContext.prev_days || 30
  const currD = billContext.curr_days || 30
  const prevDaily = Math.round((prevU / prevD) * 100) / 100
  const currDaily = Math.round((currU / currD) * 100) / 100
  const deltaDaily = Math.round((currDaily - prevDaily) * 100) / 100
  const pctDaily = prevDaily > 0 ? Math.round(((currDaily - prevDaily) / prevDaily) * 1000) / 10 : 0

  let text = `### Verified In-Depth Bill Change Breakdown\n\n`
  text += `1. **Billed Energy Shift**:\n`
  text += `   - Previous Month: **${kwh(prevU)}** (${billContext.prev_period || 'Previous Month'})\n`
  text += `   - Current Month: **${kwh(currU)}** (${billContext.curr_period || 'Current Month'})\n`
  text += `   - Overall Change: **${deltaU >= 0 ? '+' : ''}${deltaU} kWh (${pctU >= 0 ? '+' : ''}${pctU}%)**\n\n`

  text += `2. **Billing Cycle Days Normalization**:\n`
  if (prevD !== currD) {
    text += `   - Previous cycle was **${prevD} days** (${prevDaily} kWh/day).\n`
    text += `   - Current cycle was **${currD} days** (${currDaily} kWh/day).\n`
    text += `   - Normalized daily burn rate changed by **${deltaDaily >= 0 ? '+' : ''}${deltaDaily} kWh/day (${pctDaily >= 0 ? '+' : ''}${pctDaily}%)**.\n`
    text += `   - *Note*: Because current billing period is ${currD > prevD ? `${currD - prevD} day(s) longer` : `${prevD - currD} day(s) shorter`}, part of the overall unit increase is due to the calendar duration, not higher daily usage intensity.\n\n`
  } else {
    text += `   - Both cycles were **${currD} days**. Daily burn changed from **${prevDaily} to ${currDaily} kWh/day (${deltaDaily >= 0 ? '+' : ''}${deltaDaily} kWh/day)**.\n\n`
  }

  if (prevA != null && currA != null) {
    text += `3. **Bill Amount vs Units Divergence (Tariff Impact)**:\n`
    text += `   - Amount changed from **${inr(prevA)}** to **${inr(currA)}** (**${deltaA >= 0 ? '+' : ''}${inr(deltaA)} or ${pctA >= 0 ? '+' : ''}${pctA}%**).\n`
    if (pctA != null && pctA > pctDaily) {
      text += `   - *Why amount rose faster than units*: Your bill amount increased by **${pctA}%**, while energy rose by **${pctU}%**. Under telescopic tariff slabs, incremental units cross into higher per-unit pricing brackets, and fixed demand charges increase alongside electricity duty and fuel surcharges.\n\n`
    }
  }

  if (billContext.prev_effective_rate != null && billContext.curr_effective_rate != null) {
    text += `4. **Effective Cost per Unit (Total Bill ÷ Units)**:\n`
    text += `   - Previous: **₹${billContext.prev_effective_rate.toFixed(2)} / kWh**\n`
    text += `   - Current: **₹${billContext.curr_effective_rate.toFixed(2)} / kWh** (${billContext.curr_effective_rate >= billContext.prev_effective_rate ? '+' : ''}₹${(billContext.curr_effective_rate - billContext.prev_effective_rate).toFixed(2)}/unit)\n\n`
  }

  text += `*(Reminder: Bill shifts are routine household occurrences driven by weather and appliances, and do not establish electricity theft or meter tampering.)*`

  return {
    status: 'ok',
    summary: `Explained bill change (${deltaU >= 0 ? '+' : ''}${deltaU} kWh, ${deltaA != null ? inr(deltaA) : 'N/A'})`,
    message: text,
    suggestions: [
      'Analyze Household Usage',
      'How can I check if my meter reading is accurate?',
      'Tips to reduce next month’s bill',
    ],
  }
}

/**
 * Tool 5: Review Missing OCR Fields
 */
function executeReviewMissingOcr(billContext, billSlots) {
  const prevSlot = billSlots?.prev
  const currSlot = billSlots?.curr

  const prevLoaded = Boolean(
    prevSlot?.file ||
    prevSlot?.previewUrl ||
    prevSlot?.source !== 'empty' ||
    (prevSlot?.fields && Object.values(prevSlot.fields).some((v) => v !== ''))
  )
  const currLoaded = Boolean(
    currSlot?.file ||
    currSlot?.previewUrl ||
    currSlot?.source !== 'empty' ||
    (currSlot?.fields && Object.values(currSlot.fields).some((v) => v !== ''))
  )

  if (!prevLoaded && !currLoaded && (!billContext || !billContext.has_bills)) {
    return {
      status: 'warn',
      summary: 'No bills scanned yet',
      message:
        `**No Bill Scans to Audit:**\n\n` +
        `Neither previous nor current bill receipts have been loaded in **Bill Comparison** (/app/bill-comparison).\n\n` +
        `• You can upload photos of your spot-billing receipts (JPG, PNG) or review PDF bills.\n` +
        `• Tesseract OCR will automatically read meter readings, units consumed, and amounts payable directly in your browser.`,
      suggestions: [
        'Compare Bills',
        'What does kWh mean?',
        'How does TheftGuard work?',
      ],
    }
  }

  let text = `### Bill Scan & Field Extraction Audit\n\n`

  // Previous bill slot
  text += `• **Previous Month Bill**:\n`
  if (!prevLoaded) {
    text += `  - Status: *No bill loaded*\n`
    text += `  - Missing: Please upload a receipt or click "Load Telangana sample bills (Demo)".\n`
  } else {
    const pf = prevSlot?.fields || {}
    const pUnits = cleanNumber(pf.unitsConsumed)
    const pAmt = cleanNumber(pf.amountPayable)
    text += `  - Consumer No: **${pf.consumerNumber ? 'Extracted' : 'Missing'}**\n`
    text += `  - Units Consumed (kWh): **${pUnits !== null ? `${pUnits} kWh (Ready)` : '⚠️ MISSING — enter manually'}**\n`
    text += `  - Amount Payable (₹): **${pAmt !== null ? `₹${pAmt} (Ready)` : '⚠️ MISSING — enter manually'}**\n`
    text += `  - Billing Period: ${pf.billingPeriod || 'Not detected'}\n`
    text += `  - Meter Readings: Prev ${pf.previousReading || 'N/A'}, Pres ${pf.currentReading || 'N/A'}\n`
  }

  text += `\n• **Current Month Bill**:\n`
  if (!currLoaded) {
    text += `  - Status: *No bill loaded*\n`
    text += `  - Missing: Please upload a receipt or click "Load Telangana sample bills (Demo)".\n`
  } else {
    const cf = currSlot?.fields || {}
    const cUnits = cleanNumber(cf.unitsConsumed)
    const cAmt = cleanNumber(cf.amountPayable)
    text += `  - Consumer No: **${cf.consumerNumber ? 'Extracted' : 'Missing'}**\n`
    text += `  - Units Consumed (kWh): **${cUnits !== null ? `${cUnits} kWh (Ready)` : '⚠️ MISSING — enter manually'}**\n`
    text += `  - Amount Payable (₹): **${cAmt !== null ? `₹${cAmt} (Ready)` : '⚠️ MISSING — enter manually'}**\n`
    text += `  - Billing Period: ${cf.billingPeriod || 'Not detected'}\n`
    text += `  - Meter Readings: Prev ${cf.previousReading || 'N/A'}, Pres ${cf.currentReading || 'N/A'}\n`
  }

  const isReady =
    prevLoaded &&
    currLoaded &&
    cleanNumber(prevSlot?.fields?.unitsConsumed) !== null &&
    cleanNumber(prevSlot?.fields?.amountPayable) !== null &&
    cleanNumber(currSlot?.fields?.unitsConsumed) !== null &&
    cleanNumber(currSlot?.fields?.amountPayable) !== null

  if (isReady) {
    text += `\n**Audit Verdict**: Both bills have all required comparison fields populated! You can run **Compare Bills** to see your complete delta.`
  } else {
    text += `\n**Audit Verdict**: Some required fields (Units Consumed or Amount Payable) are missing or unread. Open **[Bill Comparison](/app/bill-comparison)** to fill the amber-highlighted boxes.`
  }

  return {
    status: isReady ? 'ok' : 'warn',
    summary: isReady ? 'All comparison fields extracted' : 'Missing fields detected in scan',
    message: text,
    suggestions: [
      isReady ? 'Compare Bills' : 'Open Bill Comparison to enter missing values',
      'How much electricity does an AC consume in 8 hours?',
      'What should I do next?',
    ],
  }
}
