/**
 * TheftGuard AI — Conversational Assistant Engine & Rule-Based Fallback
 *
 * Implements:
 * - Conversational, accurate, and context-aware deterministic assistant reasoning
 * - Intent classification handling definitions, navigation, bill breakdown, appliances, meters, tariffs
 * - Grounded bill metrics (exact units, normalized daily rates, amounts, percentage shifts, effective cost per unit)
 * - Safe, reassuring responses for theft and meter tampering concerns
 * - Follow-up conversation context memory across turns (e.g. changing AC hours)
 * - Seamless automatic fallback when backend service is offline
 */

import { sendAssistantChat } from './assistantApi.js'
import { inr, kwh, pct } from './format.js'
import { synthesizeAnalysis } from './householdQuestionnaire.js'

export const DEFAULT_SUGGESTIONS = [
  'Why is my electricity bill so high this month?',
  'What does kWh mean?',
  'Could you explain me this webpage?',
  'How much electricity does an AC consume in 8 hours?',
  'How do tariff slabs work?',
  'What should I do next?',
]

export const CONTEXT_SUGGESTIONS_BILL_LOADED = [
  'Explain the comparison.',
  'Why did my bill increase between these two months?',
  'What should I do next?',
  'How much power does my air conditioner consume?',
  'How do tariff slabs affect this bill amount?',
  'How can I check if my meter reading is accurate?',
]

const WORD_TO_NUM = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
}

/**
 * Normalizes input text into a set of lower-case words.
 */
function extractWords(text = '') {
  const matches = String(text).toLowerCase().match(/\b[a-z0-9.]+\b/g)
  return new Set(matches || [])
}

/**
 * Extracts number of daily hours and unit count for appliances from user query.
 * Supports digits ("8 hours", "8.5h") and number words ("four hours", "half an hour").
 * Supports comparative queries with both baseline and alternative hours (e.g. "from 8 hours to 4 hours").
 */
export function extractApplianceNumbers(message = '') {
  const text = message.toLowerCase()
  let hours = null
  let previousHours = null
  let count = null

  // Find all hour mentions in text
  const allHours = []
  const digitRegex = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/g
  let match
  while ((match = digitRegex.exec(text)) !== null) {
    allHours.push(parseFloat(match[1]))
  }

  const wordRegex = /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?|hrs?|h)\b/g
  while ((match = wordRegex.exec(text)) !== null) {
    if (WORD_TO_NUM[match[1]] != null) {
      allHours.push(WORD_TO_NUM[match[1]])
    }
  }

  if (text.includes('half an hour') || text.includes('half hour') || text.includes('half a hour')) {
    allHours.push(0.5)
  }

  if (allHours.length >= 2) {
    // E.g. "I use my AC for 8 hours daily. What if I use it for 4 hours instead?"
    previousHours = allHours[0]
    hours = allHours[allHours.length - 1]
  } else if (allHours.length === 1) {
    hours = allHours[0]
  }

  // Unit count
  const digitCountMatch = text.match(/(\d+)\s*(?:ac|air\s*conditioner|split|window|unit)/)
  if (digitCountMatch) {
    count = parseInt(digitCountMatch[1], 10)
  } else {
    const wordCountMatch = text.match(/(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:ac|air\s*conditioner|split|window|unit)/)
    if (wordCountMatch && WORD_TO_NUM[wordCountMatch[1]] != null) {
      count = WORD_TO_NUM[wordCountMatch[1]]
    }
  }

  return { hours, count, previousHours }
}

/**
 * Inspects recent conversation history to find previous context topic.
 */
export function detectHistoryContext(history = []) {
  if (!Array.isArray(history) || history.length === 0) return null
  const recent = history.slice(-6)
  for (let i = recent.length - 1; i >= 0; i--) {
    const text = String(recent[i].content || '').toLowerCase()
    if (/\b(?:llm|llms|large language model)\b/i.test(text)) {
      return 'llm'
    }
    if (/\bpython\b/i.test(text)) {
      return 'python'
    }
    if (/\bapis?\b/i.test(text)) {
      return 'api'
    }
    if (/\b(?:machine learning|deep learning|artificial intelligence)\b/i.test(text)) {
      return 'ai'
    }
    if (/\bac\b/i.test(text) || text.includes('air condition') || /\bcooling\b/i.test(text)) {
      return 'ac'
    }
    if (/\bgeyser\b/i.test(text) || text.includes('water heater')) {
      return 'geyser'
    }
    if (/\bpump\b/i.test(text) || /\bmotor\b/i.test(text) || text.includes('borewell')) {
      return 'pump'
    }
    if (/\bmeter\b/i.test(text) || /\bdial\b/i.test(text)) {
      return 'meter'
    }
    if (/\btariff\b/i.test(text) || /\bslabs?\b/i.test(text)) {
      return 'tariff'
    }
    if (/\bbills?\b/i.test(text) || /\bkwh\b/i.test(text) || /\bcomparison\b/i.test(text)) {
      return 'bill'
    }
  }
  return null
}

/**
 * Extracts previously mentioned appliance hours from recent conversation turns.
 * If currentHours is provided, skips any occurrences matching currentHours to enable follow-up reduction detection.
 */
export function findPreviousHoursFromHistory(history = [], currentHours = null) {
  if (!Array.isArray(history) || history.length === 0) return null
  const recent = history.slice(-8)
  for (let i = recent.length - 1; i >= 0; i--) {
    const text = String(recent[i].content || '').toLowerCase()
    const digitMatches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?\/day|hours?|hrs?|h\b)/g))
    for (const m of digitMatches) {
      const val = parseFloat(m[1])
      if (currentHours == null || Math.abs(val - currentHours) > 0.01) {
        return val
      }
    }
    const wordMatches = Array.from(text.matchAll(/(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?\/day|hours?|hrs?|h\b)/g))
    for (const wm of wordMatches) {
      const val = WORD_TO_NUM[wm[1]]
      if (val != null && (currentHours == null || Math.abs(val - currentHours) > 0.01)) {
        return val
      }
    }
  }
  return null
}

/**
 * Definition of kWh and fundamental electricity units.
 */
export function buildKwhDefinition() {
  return (
    '**kWh stands for Kilowatt-hour.** It is the official billing unit of electrical energy shown on your electricity bill (commonly called **"1 Unit"**).\n\n' +
    '• **What 1 kWh (1 Unit) means in practice:**\n' +
    '  Using 1,000 watts of electrical power continuously for 1 hour equals exactly 1 kWh (1 unit). For example:\n' +
    '  - Running a 1,000W electric iron for 1 hour consumes **1 unit**.\n' +
    '  - Running ten 100W incandescent bulbs for 1 hour consumes **1 unit**.\n' +
    '  - Running a 1.5-ton 3-star AC for about 1 hour consumes approximately **0.95 to 1.1 units**.\n\n' +
    '• **Difference between kW and kWh:**\n' +
    '  - **kW (Kilowatt)** is the *rate* or capacity of power flow (like the speed of water flowing from a tap).\n' +
    '  - **kWh (Kilowatt-hour)** is the *total energy* consumed over time (like the total liters collected in a bucket).\n' +
    '  - **Contracted / Sanctioned Load (kW)**: The maximum peak power capacity sanctioned by your DISCOM (typically 1 to 5 kW for homes).'
  )
}

/**
 * Builds explanatory breakdown when OCR is actively recognizing bill receipts.
 */
export function buildOcrProcessingReply() {
  return (
    `Your electricity bill is currently being scanned using on-device optical character recognition (OCR).\n\n` +
    `• **Scanning in progress**: Reading meter values, dates, units consumed, and amounts payable directly from your uploaded bill image.\n` +
    `• **What to do**: Please wait a few moments for the scan to finish. Once complete, you will see the extracted fields populated in your bill slots.\n` +
    `• **Review**: You can quickly verify the extracted numbers or fill in any unreadable values in **Bill Comparison** (/app/bill-comparison) before running the comparison.`
  )
}

/**
 * Builds explanatory breakdown when bills are partially entered or incomplete.
 */
export function buildIncompleteBillReply(billContext = {}) {
  const missing = billContext.missing_fields && billContext.missing_fields.length > 0
    ? billContext.missing_fields
    : ['Units consumed (kWh)', 'Amount payable (₹)']

  let reply = `I can see bill information loaded in Bill Comparison, but some required fields are incomplete or missing before a full comparative analysis can be calculated.\n\n`
  reply += `**Missing or Incomplete Details Needed:**\n`
  missing.forEach((field) => {
    reply += `• ${field}\n`
  })
  reply += `\n**Currently Recorded Details:**\n`
  const prevStr = billContext.prev_units != null ? `${billContext.prev_units} kWh` : 'Not provided'
  const prevAmt = billContext.prev_amount != null ? `, ₹${billContext.prev_amount}` : ''
  const prevPeriod = billContext.prev_period ? ` (${billContext.prev_period})` : ''
  const currStr = billContext.curr_units != null ? `${billContext.curr_units} kWh` : 'Not provided'
  const currAmt = billContext.curr_amount != null ? `, ₹${billContext.curr_amount}` : ''
  const currPeriod = billContext.curr_period ? ` (${billContext.curr_period})` : ''

  reply += `• Previous Bill: ${prevStr}${prevAmt}${prevPeriod}\n`
  reply += `• Current Bill: ${currStr}${currAmt}${currPeriod}\n\n`
  reply += `Please enter or verify the missing values in the bill forms in **Bill Comparison** (/app/bill-comparison) to see your full consumption delta, normalized daily burn rate, and tariff breakdown.`
  return reply
}

/**
 * Builds grounded side-by-side bill comparison explanation with verified figures.
 */
export function buildComparisonReply(billContext, questionnaireAnswers = null) {
  if (!billContext || billContext.is_complete === false || billContext.prev_units == null || billContext.curr_units == null) {
    return buildIncompleteBillReply(billContext || {})
  }

  const prevU = billContext.prev_units
  const currU = billContext.curr_units
  const deltaU = Math.round((currU - prevU) * 10) / 10
  const pctU = prevU > 0 ? Math.round(((currU - prevU) / prevU) * 1000) / 10 : 0
  const prevD = billContext.prev_days || 30
  const currD = billContext.curr_days || 30
  const prevDaily = Math.round((prevU / prevD) * 100) / 100
  const currDaily = Math.round((currU / currD) * 100) / 100
  const deltaDaily = Math.round((currDaily - prevDaily) * 100) / 100
  const pctDaily = prevDaily > 0 ? Math.round(((currDaily - prevDaily) / prevDaily) * 1000) / 10 : 0
  const prevA = billContext.prev_amount
  const currA = billContext.curr_amount
  const deltaA = prevA != null && currA != null ? Math.round(currA - prevA) : null
  const pctA = prevA && prevA > 0 ? Math.round(((currA - prevA) / prevA) * 1000) / 10 : null
  const prevPeriod = billContext.prev_period || 'Previous Month'
  const currPeriod = billContext.curr_period || 'Current Month'

  // Effective cost per unit (Total Bill Amount ÷ Units Consumed)
  const prevEffective =
    billContext.prev_effective_rate != null
      ? billContext.prev_effective_rate
      : (prevA != null && prevU > 0 ? Math.round((prevA / prevU) * 100) / 100 : null)
  const currEffective =
    billContext.curr_effective_rate != null
      ? billContext.curr_effective_rate
      : (currA != null && currU > 0 ? Math.round((currA / currU) * 100) / 100 : null)
  const deltaEffective =
    prevEffective != null && currEffective != null
      ? Math.round((currEffective - prevEffective) * 100) / 100
      : null

  let reply = `Here is the verified breakdown of your active bill comparison:\n\n`
  if (billContext.consumer_matched === false) {
    reply += `*(Note: The consumer numbers on your two bills did not match. Ensure both bills belong to the same connection before comparing trends.)*\n\n`
  }
  reply += `• **Billed Consumption**:\n`
  reply += `  Shifted from **${kwh(prevU)}** (${prevPeriod}) to **${kwh(currU)}** (${currPeriod}), an increase of **${deltaU >= 0 ? '+' : ''}${deltaU} kWh (${pctU >= 0 ? '+' : ''}${pctU}%)**.\n\n`

  reply += `• **Cycle Length Normalization**:\n`
  if (prevD !== currD) {
    reply += `  Your previous bill covered **${prevD} days**, while this bill covered **${currD} days**. Normalized for cycle length, your daily consumption rate rose from **${prevDaily} to ${currDaily} kWh/day (${deltaDaily >= 0 ? '+' : ''}${deltaDaily} kWh/day or ${pctDaily >= 0 ? '+' : ''}${pctDaily}%)**.\n`
    reply += `  *Context*: Because the current cycle has ${currD > prevD ? `${currD - prevD} extra day(s)` : `${prevD - currD} fewer day(s)`}, part of the overall unit increase is due to the longer billing period; the true daily intensity rose by ${pctDaily >= 0 ? '+' : ''}${pctDaily}%, which is less than the total billed unit increase of ${pctU >= 0 ? '+' : ''}${pctU}%.\n\n`
  } else {
    reply += `  Both billing cycles were **${currD} days**. Normalized daily rate changed from **${prevDaily} to ${currDaily} kWh/day (${deltaDaily >= 0 ? '+' : ''}${deltaDaily} kWh/day or ${pctDaily >= 0 ? '+' : ''}${pctDaily}%)**.\n\n`
  }

  if (prevA != null && currA != null) {
    reply += `• **Bill Amount & Tariff Escalation**:\n`
    reply += `  Total bill amount changed from **${inr(prevA)}** to **${inr(currA)}** (**${deltaA >= 0 ? '+' : ''}${inr(deltaA)} or ${pctA >= 0 ? '+' : ''}${pctA}%**).\n`
    if (pctA != null && pctA > pctDaily) {
      reply += `  *Tariff Slab Impact & Escalation*: Notice that your total bill amount increased by **${pctA}%**, which is higher than the billed energy increase of **${pctU}%** (and daily rate increase of ${pctDaily}%). Under telescopic tariff structures and DISCOM billing schedules, incremental units are subject to higher slab rates alongside applicable fixed demand charges, customer charges, and fuel surcharges, which causes the bill amount to escalate faster than energy consumption. (Note: Whether a specific tariff slab threshold was crossed depends on your utility's specific slab cutoff brackets, e.g. 100 or 200 units).\n`
    }
    reply += `\n`
  }

  if (prevEffective != null && currEffective != null) {
    reply += `• **Effective Cost per Unit** (Total Amount ÷ Units Consumed):\n`
    reply += `  - ${prevPeriod}: ${inr(prevA)} ÷ ${prevU} units = **₹${prevEffective.toFixed(2)} per kWh**\n`
    reply += `  - ${currPeriod}: ${inr(currA)} ÷ ${currU} units = **₹${currEffective.toFixed(2)} per kWh** (${deltaEffective >= 0 ? '+' : ''}₹${deltaEffective.toFixed(2)}/unit)\n`
    reply += `  *Explanation*: Your effective cost per unit includes fixed demand charges, customer charges, fuel surcharge adjustment (FSA), and duties averaged across all units. It is different from your marginal per-unit rate for additional units.\n\n`
  }

  // Synthesize questionnaire answers if present
  let hasProfileData = false
  if (questionnaireAnswers) {
    const q = questionnaireAnswers
    const applianceLines = []

    if (q.has_ac === 'yes' && q.ac_hours > 0) {
      hasProfileData = true
      const count = q.ac_count || 1
      const dailyKwh = Math.round(count * q.ac_hours * 0.95 * 10) / 10
      const monthlyKwh = Math.round(dailyKwh * currD * 10) / 10
      const pctOfBill = currU > 0 ? Math.round((monthlyKwh / currU) * 100) : null
      applianceLines.push(
        `  - **Air Conditioning**: ${count} unit(s) at ~${q.ac_hours} hrs/day = estimated **~${monthlyKwh} kWh/month** (~${dailyKwh} kWh/day${pctOfBill != null ? `, ~${pctOfBill}% of current bill` : ''}).`
      )
    }

    if (q.has_geyser === 'yes' && q.geyser_hours > 0) {
      hasProfileData = true
      const dailyKwh = Math.round(q.geyser_hours * 2.0 * 10) / 10
      const monthlyKwh = Math.round(dailyKwh * currD * 10) / 10
      applianceLines.push(
        `  - **Water Heater (Geyser)**: ~${q.geyser_hours} hrs/day = estimated **~${monthlyKwh} kWh/month** (~${dailyKwh} kWh/day).`
      )
    }

    if (q.has_pump && q.has_pump !== 'none' && q.pump_hours > 0) {
      hasProfileData = true
      const dailyKwh = Math.round(q.pump_hours * 0.75 * 10) / 10
      const monthlyKwh = Math.round(dailyKwh * currD * 10) / 10
      applianceLines.push(
        `  - **Water Pump / Motor**: ~${q.pump_hours} hrs/day = estimated **~${monthlyKwh} kWh/month** (~${dailyKwh} kWh/day).`
      )
    }

    if (q.has_refrigerator && q.has_refrigerator !== 'none') {
      hasProfileData = true
      const monthlyKwh = Math.round(1.0 * currD * 10) / 10
      applianceLines.push(
        `  - **Refrigerator (24/7)**: Standard auto-cycling consumes an estimated **~${monthlyKwh} kWh/month** (~1.0 kWh/day).`
      )
    }

    if (applianceLines.length > 0) {
      reply += `• **Appliance Load Breakdown (From Your Profile)**:\n`
      reply += applianceLines.join('\n') + `\n`
      reply += `  *(Estimates based on BEE 3-star standard appliances. You can adjust your hours in the Household Usage Profile tab above.)*\n\n`
    }
  }

  if (!hasProfileData) {
    reply +=
      `• **Household Profile Opportunity**:\n` +
      `  To see exactly how much your air conditioner, geyser, or pump contributes to this ${deltaU >= 0 ? '+' : ''}${deltaU} kWh shift, complete the quick 4-question **Household Usage Profile** in the tab above!\n\n`
  }

  reply +=
    `**Plausible Causes & Actionable Next Steps:**\n` +
    `1. **Verify Physical Meter Dial**: Check your meter box to confirm cumulative kWh is equal to or greater than the current reading on your bill (rule out meter reader punch errors).\n` +
    `2. **Check Compressor & Thermostat**: In hotter weather, AC compressors run longer duty cycles. Keeping thermostats at **24°C** saves 20% to 25% on cooling.\n` +
    `3. **Switch-Off Test**: Turn off your main MCB for 10 minutes. If the meter pulse LED continues blinking rapidly, inspect for internal wiring leakage or continuous pump overflow.\n` +
    `4. **DISCOM Inquiry**: If you suspect a meter calibration fault or punch error, take a photo of the dial and call **1912** or visit your local DISCOM sub-engineer office.\n\n` +
    `*(Note: Normal seasonal bill fluctuations or slab crossing do NOT indicate electricity theft or tampering.)*`

  return reply
}

/**
 * Builds explanatory breakdown when no active bill comparison is loaded.
 */
export function buildMissingBillComparisonReply() {
  return (
    `I don't have an active bill comparison loaded yet to explain.\n\n` +
    `**To compare your bills side-by-side with verified metrics:**\n` +
    `1. Go to Bill Comparison (/app/bill-comparison).\n` +
    `2. Click "Load Telangana sample bills (Demo)" for an instant side-by-side walkthrough, or upload your previous and current bill receipts.\n` +
    `3. Once loaded, ask me again and I will break down your exact consumption difference, normalized daily burn (kWh/day), tariff slab shift, and effective cost per unit!\n\n` +
    `**Common Factors Behind Household Bill Changes:**\n` +
    `1. **Seasonal Weather & Air Conditioning**:\n` +
    `   In hotter months, AC compressors work much harder to reach thermostat temperatures. Even running the same hours, high outdoor heat can increase power draw by 30% to 50%.\n\n` +
    `2. **Telescopic Tariff Slab Escalation (The "Cliff Effect")**:\n` +
    `   When your monthly units cross a tariff slab threshold (e.g., above 100 or 200 units), the additional units are billed at a significantly higher rate, and fixed customer charges increase.\n\n` +
    `3. **Meter Reading Punch Errors or Door Lock Estimates**:\n` +
    `   If a meter reader mistypes a digit or the meter was inaccessible (billed on average/estimate), your bill reading can be higher than the actual meter dial.\n\n` +
    `4. **Unnoticed Continuous Power Leaks**:\n` +
    `   A running water motor due to an overflowing tank, worn refrigerator door gaskets, or aging inverter batteries drawing continuous charge.`
  )
}

/**
 * Builds air conditioner consumption explanation with dynamic calculation and follow-up memory.
 */
export function buildAcReply(
  hours = 8.0,
  count = 1,
  billContext = null,
  history = [],
  recentContext = null,
  explicitPrevHours = null
) {
  const kwhPerHour = 0.95 // BEE 3-star inverter AC compressor cycling rate
  const dailyKwh = Math.round(count * hours * kwhPerHour * 10) / 10
  const monthlyKwh = Math.round(dailyKwh * 30 * 10) / 10
  const costMin = Math.round(monthlyKwh * 6.5)
  const costMax = Math.round(monthlyKwh * 7.5)

  let reply =
    `**Estimated Air Conditioner Power Consumption:**\n\n` +
    `• **Assumptions**: ${count} unit(s) of 1.5-Ton 3-Star Inverter AC running for **${hours} hours/day**.\n` +
    `• **Compressor Cycling Rate**: Standard 3-star inverter ACs have a rated power of ~1,200W, averaging **~0.95 kWh per hour** as the compressor cycles to maintain room temperature.\n\n` +
    `**Calculated Estimates:**\n` +
    `• **Daily Energy**: ${hours} hrs × 0.95 kWh/hr${count > 1 ? ` × ${count} ACs` : ''} = **~${dailyKwh} kWh (units) per day**.\n` +
    `• **Monthly Energy (30 days)**: ${dailyKwh} kWh/day × 30 days = **~${monthlyKwh} kWh (units) per month**.\n` +
    `• **Estimated Cost**: At standard Indian domestic slab rates (~₹6.50 to ₹7.50/unit), this cooling load adds approximately **₹${costMin.toLocaleString('en-IN')} to ₹${costMax.toLocaleString('en-IN')}** to your monthly bill.\n\n`

  // Follow-up comparison if user changed hours from a previous turn or provided in prompt
  const prevHours = explicitPrevHours != null ? explicitPrevHours : findPreviousHoursFromHistory(history, hours)
  if (prevHours != null && Math.abs(prevHours - hours) > 0.01) {
    const prevDaily = Math.round(count * prevHours * kwhPerHour * 10) / 10
    const prevMonthly = Math.round(prevDaily * 30 * 10) / 10
    const deltaMonthly = Math.round((prevMonthly - monthlyKwh) * 10) / 10
    const pctChange = prevMonthly > 0 ? Math.round((Math.abs(deltaMonthly) / prevMonthly) * 100) : 0
    const savedMin = Math.round(Math.abs(deltaMonthly) * 6.5)
    const savedMax = Math.round(Math.abs(deltaMonthly) * 7.5)
    if (deltaMonthly > 0) {
      reply += `• **Comparison with your previous ${prevHours}h scenario**: Reducing daily AC runtime from ${prevHours} hours to ${hours} hours cuts your estimated monthly cooling consumption from ~${prevMonthly} kWh down to ~${monthlyKwh} kWh—saving approximately **${deltaMonthly} kWh/month, or ${pctChange}% (~₹${savedMin.toLocaleString('en-IN')} to ₹${savedMax.toLocaleString('en-IN')}) each month** under illustrative tariff assumptions (~₹6.50 to ₹7.50/unit)!\n\n`
    } else {
      reply += `• **Comparison with your previous ${prevHours}h scenario**: Increasing daily AC runtime from ${prevHours} hours to ${hours} hours raises your monthly cooling consumption from ~${prevMonthly} kWh up to ~${monthlyKwh} kWh—adding approximately **${Math.abs(deltaMonthly)} kWh/month, or +${pctChange}% (~₹${savedMin.toLocaleString('en-IN')} to ₹${savedMax.toLocaleString('en-IN')}) each month** under illustrative tariff assumptions (~₹6.50 to ₹7.50/unit).\n\n`
    }
  }

  if (billContext && billContext.delta_units != null) {
    reply += `In your active comparison, your total bill changed by **${billContext.delta_units >= 0 ? '+' : ''}${billContext.delta_units} kWh**. `
    if (Math.abs(billContext.delta_units - monthlyKwh) < 50) {
      reply += `This estimated AC usage of ~${monthlyKwh} kWh closely aligns with the observed consumption change.\n\n`
    } else {
      reply += `Note that this ${monthlyKwh} kWh is total estimated monthly cooling load, whereas your bill changed by ${billContext.delta_units >= 0 ? '+' : ''}${billContext.delta_units} kWh compared to last month.\n\n`
    }
  }

  reply +=
    `• **Real-World Variations**: Please note that these figures are engineering estimates. Actual energy consumption depends on appliance star rating (e.g. 3-star vs 5-star inverter), room size and room insulation, outdoor ambient temperature, weather conditions, thermostat setpoint, and compressor duty cycling.\n\n` +
    `*Energy Saving Tip*: Setting your AC thermostat at **24°C** instead of 18°C or 20°C saves up to 24% on cooling energy with no loss in comfort. Cleaning filters every 2 weeks prevents compressor strain.`

  return reply
}

/**
 * Pure client-side rule-based assistant reasoning.
 */
export function generateClientRuleResponse(
  message = '',
  billContext = null,
  questionnaireAnswers = null,
  history = []
) {
  const lowerMsg = String(message || '').toLowerCase().trim()
  const words = extractWords(lowerMsg)
  const recentContext = detectHistoryContext(history)

  // Synthesize structured analysis if bill context exists
  const analysis = billContext
    ? synthesizeAnalysis(
        {
          previousUnits: billContext.prev_units,
          currentUnits: billContext.curr_units,
          billingDays: billContext.curr_days || 30,
          amountDifference: billContext.delta_amount,
        },
        questionnaireAnswers || {}
      )
    : null

  const disclaimers = [
    'Educational Guidance: Estimates are based on standard BEE 3-star appliance ratings.',
    'Neutral Finding: Normal household fluctuations, weather, visitors, or tariff slab crossing does not establish electricity theft or meter tampering.',
  ]

  // ---------------------------------------------------------------------------
  // INTENT 1: Theft, meter tampering, or fraud concerns (Safety & Neutrality first)
  // ---------------------------------------------------------------------------
  if (
    words.has('theft') ||
    words.has('tampering') ||
    words.has('tamper') ||
    words.has('steal') ||
    words.has('stolen') ||
    words.has('fraud') ||
    words.has('illegal') ||
    words.has('hooking')
  ) {
    return {
      reply:
        'A high or fluctuating electricity bill is almost always caused by routine household factors: hotter summer weather leading to longer air conditioning cycles, visiting relatives, or stepping into a higher telescopic tariff slab.\n\n' +
        '**Important Safety Reassurance:**\n' +
        '• An increase in your electricity bill does **NOT** indicate electricity theft or meter tampering.\n' +
        '• TheftGuard AI provides feeder-level loss screening tools for electricity distribution engineers at the substation level, not for penalizing household consumers.\n' +
        '• If you suspect unauthorized physical hooking on your external service line or a mechanical meter fault, do not attempt to inspect live wires yourself. Contact your local DISCOM sub-engineer office or call the national **1912** electricity helpline for an authorized inspection.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'How can I check if my meter reading is accurate?',
        'Why is my electricity bill so high this month?',
        'How do tariff slabs work?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT CHECKERS
  // ---------------------------------------------------------------------------
  const isLlmQuery =
    words.has('llm') ||
    words.has('llms') ||
    lowerMsg.includes('large language model') ||
    lowerMsg.includes('what is an llm') ||
    lowerMsg.includes('what is a llm') ||
    lowerMsg.includes('explain llm') ||
    (recentContext === 'llm' && (lowerMsg.includes('example') || lowerMsg.includes('simple') || words.has('it') || words.has('explain')))

  const isAiMlDlDifferenceQuery =
    (lowerMsg.includes('difference') || lowerMsg.includes('compare') || lowerMsg.includes('distinction') || lowerMsg.includes('vs')) &&
    ((lowerMsg.includes('ai') || lowerMsg.includes('artificial intelligence')) &&
      (lowerMsg.includes('machine learning') || lowerMsg.includes('ml') || lowerMsg.includes('deep learning') || lowerMsg.includes('dl')))

  const isPythonQuery =
    words.has('python') ||
    lowerMsg.includes('what is python') ||
    lowerMsg.includes('python programming') ||
    lowerMsg.includes('explain python') ||
    (recentContext === 'python' && (words.has('it') || lowerMsg.includes('why') || lowerMsg.includes('ai')))

  const isApiQuery =
    words.has('api') ||
    words.has('apis') ||
    lowerMsg.includes('what is an api') ||
    lowerMsg.includes('what is api') ||
    lowerMsg.includes('explain api') ||
    lowerMsg.includes('explain apis') ||
    lowerMsg.includes('like i am a beginner') ||
    lowerMsg.includes('for beginners') ||
    (recentContext === 'api' && (lowerMsg.includes('example') || words.has('it') || lowerMsg.includes('simple')))

  const isGeneralAiMlQuery =
    lowerMsg.includes('machine learning') ||
    lowerMsg.includes('what is ml') ||
    lowerMsg.includes('how does ml work') ||
    lowerMsg.includes('what is ai') ||
    lowerMsg.includes('artificial intelligence') ||
    (words.has('what') && words.has('ai') && words.size <= 4)

  const isGeneralTechQuery =
    isLlmQuery ||
    isAiMlDlDifferenceQuery ||
    isPythonQuery ||
    isApiQuery ||
    isGeneralAiMlQuery

  // ---------------------------------------------------------------------------
  // INTENT 1A: General AI Question — "What is an LLM?" (With Simple Example support)
  // ---------------------------------------------------------------------------
  if (isLlmQuery) {
    const wantsExample = lowerMsg.includes('example') || lowerMsg.includes('simple')
    let exampleText = ''
    if (wantsExample) {
      exampleText =
        '• **Simple Real-World Example**:\n' +
        '  Imagine typing the phrase *"The sky is..."* into your phone keyboard, and it suggests *"blue"*. An LLM does something similar, but across billions of possible words, complex thoughts, and full paragraphs. If you give it a recipe, it predicts the next cooking step; if you give it a computer bug, it predicts the corrected code line.\n\n'
    } else {
      exampleText =
        '• **Simple Analogy**:\n' +
        '  Think of an LLM like an advanced version of autocomplete on your phone—but scaled up to understand nuanced instructions, follow conversational context, summarize documents, write code, and answer complex questions.\n\n'
    }

    return {
      reply:
        '**A Large Language Model (LLM)** is a type of artificial intelligence designed to understand, process, and generate human-like text.\n\n' +
        '• **How it works:**\n' +
        '  LLMs are built on deep neural network architectures called **Transformers**. They are trained on vast collections of text (books, articles, websites) to learn the statistical relationships between words and phrases.\n\n' +
        '• **How it generates responses:**\n' +
        '  When you ask a question, the model does not "think" like a human or look up pre-written answers. Instead, it predicts the most statistically probable next words (tokens) one by one, based on the context of your conversation.\n\n' +
        exampleText +
        '• **How TheftGuard AI uses this:**\n' +
        '  In TheftGuard AI, conversational AI handles natural language explanations, while verified deterministic math engines compute exact kilowatt-hours and billing numbers to ensure 100% calculation accuracy with zero hallucination.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'What is Python, and why is it used in AI?',
        'What is the difference between AI, machine learning, and deep learning?',
        'Explain APIs like I am a beginner.',
        'What does kWh mean?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 1B: Technical Distinction — AI vs. Machine Learning vs. Deep Learning
  // ---------------------------------------------------------------------------
  if (isAiMlDlDifferenceQuery) {
    return {
      reply:
        '**The Difference Between AI, Machine Learning, and Deep Learning:**\n\n' +
        'A helpful way to understand the difference is to picture **nested Russian nesting dolls** (or concentric circles), where each field is a specialized subset of the larger one:\n\n' +
        '1. **Artificial Intelligence (AI) — The Broadest Umbrella**:\n' +
        '   • Any computer technique that enables machines to mimic human intelligence, reasoning, or decision-making.\n' +
        '   • Includes rule-based systems, expert logic, search algorithms, as well as learning models.\n\n' +
        '2. **Machine Learning (ML) — A Subset of AI**:\n' +
        '   • Systems that learn patterns directly from historical data rather than requiring human engineers to hardcode every rule.\n' +
        '   • Instead of writing `if usage > 300`, an ML algorithm studies thousands of past consumption records and discovers the boundary patterns automatically.\n' +
        '   • Common algorithms include Random Forests, Decision Trees, and Support Vector Machines.\n\n' +
        '3. **Deep Learning (DL) — A Specialized Subset of ML**:\n' +
        '   • Uses deep, multi-layered artificial neural networks inspired by biological neurons in the human brain.\n' +
        '   • Excels at massive, high-dimensional unstructured data like images (vision), audio (speech), and natural language (LLMs).\n\n' +
        '• **In TheftGuard AI**:\n' +
        '  We use **Machine Learning** (a 13-feature Random Forest model) to detect feeder distribution loss anomalies, and **Natural Language AI** to power this helpful assistant workspace.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'What is an LLM?',
        'What is Python, and why is it used in AI?',
        'Explain APIs like I am a beginner.',
        'What does kWh mean?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 1C: General Tech Question — "What is Python, and why is it used in AI?"
  // ---------------------------------------------------------------------------
  if (isPythonQuery) {
    return {
      reply:
        '**Python** is one of the world’s most popular, high-level, interpreted programming languages, renowned for its clean, readable syntax and versatility.\n\n' +
        '• **Why Python dominates Artificial Intelligence:**\n' +
        '  1. **Rich AI & Scientific Ecosystem**: The world’s leading machine learning libraries—such as PyTorch, TensorFlow, scikit-learn, and NumPy—are built natively for Python.\n' +
        '  2. **Readability & Rapid Prototyping**: Python reads almost like plain English. This allows data scientists and researchers to focus on mathematical models and algorithms rather than low-level memory management.\n' +
        '  3. **Seamless Integration**: Python connects effortlessly with high-performance C/C++ backends, enabling fast hardware acceleration on GPUs and TPUs.\n\n' +
        '• **Role in TheftGuard AI:**\n' +
        '  TheftGuard AI’s backend microservice is built in Python using **FastAPI** and **scikit-learn**. It executes our 13-feature Random Forest model to analyze transformer-level consumption patterns and screen for technical and commercial distribution losses.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'What is an LLM?',
        'What is the difference between AI, machine learning, and deep learning?',
        'Explain APIs like I am a beginner.',
        'What does kWh mean?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 1D: General Tech Question — "Explain APIs like I am a beginner."
  // ---------------------------------------------------------------------------
  if (isApiQuery) {
    return {
      reply:
        '**What is an API? (Explained for Beginners)**\n\n' +
        '**API** stands for **Application Programming Interface**. In simple terms, an API is a messenger that lets two different software applications talk to each other and exchange information.\n\n' +
        '• **The Restaurant Waiter Analogy**:\n' +
        '  - Imagine you are sitting at a table in a restaurant looking at the menu. You are the **Client (Frontend)**.\n' +
        '  - The kitchen is the **Server (Backend)** that has the ingredients and prepares the meal.\n' +
        '  - You cannot walk straight into the kitchen to cook the food yourself.\n' +
        '  - Instead, the **Waiter** is the **API**. The waiter takes your order (the request), delivers it to the kitchen, and brings back your prepared food (the response) to your table!\n\n' +
        '• **How TheftGuard AI uses APIs**:\n' +
        '  When you ask a question or upload a bill in this web application, the React browser interface sends an API request to our Python backend server at `/ml/v1/assistant/chat`, and the server sends back the verified response.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'What is an LLM?',
        'What is Python, and why is it used in AI?',
        'What is the difference between AI, machine learning, and deep learning?',
        'What does kWh mean?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 1E: Machine Learning & AI Concepts
  // ---------------------------------------------------------------------------
  if (isGeneralAiMlQuery) {
    return {
      reply:
        '**Machine Learning (ML)** is a branch of artificial intelligence where computers learn to find patterns and make predictions from data, without being explicitly programmed with every rule.\n\n' +
        '• **Traditional Code vs. Machine Learning:**\n' +
        '  - *Traditional programming*: A developer writes specific rules (e.g. `if bill > 200 then flag`).\n' +
        '  - *Machine learning*: An algorithm is fed historical consumption data and discovers subtle multi-variable patterns on its own.\n\n' +
        '• **In TheftGuard AI:**\n' +
        '  We utilize a **Random Forest classifier** trained on 13 engineered features—such as consumption variance, drop ratios, and seasonal patterns—to help utility engineers identify distribution losses at the transformer level.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'What is an LLM?',
        'What is Python, and why is it used in AI?',
        'Explain APIs like I am a beginner.',
        'What does kWh mean?',
      ],
      disclaimers,
    }
  }

  const isKwhQuery =
    lowerMsg.includes('kwh') ||
    lowerMsg.includes('kilowatt hour') ||
    lowerMsg.includes('what is a unit') ||
    lowerMsg.includes('what does unit mean') ||
    lowerMsg.includes('meaning of unit') ||
    lowerMsg.includes('define unit') ||
    lowerMsg.includes('kw vs kwh') ||
    lowerMsg.includes('sanctioned load') ||
    lowerMsg.includes('contracted load') ||
    (words.has('unit') && (words.has('what') || words.has('meaning') || words.has('define') || words.has('means')))

  const isComparisonQuery =
    !isGeneralTechQuery &&
    (
      lowerMsg.includes('explain the comparison') ||
      lowerMsg.includes('explain this comparison') ||
      lowerMsg.includes('explain comparison') ||
      lowerMsg.includes('explain my bill comparison') ||
      lowerMsg.includes('explain the bill comparison') ||
      lowerMsg.includes('explain these results') ||
      lowerMsg.includes('explain the results') ||
      lowerMsg.includes('explain results') ||
      lowerMsg.includes('explain my current results') ||
      lowerMsg.includes('explain current results') ||
      lowerMsg.includes('explain my results') ||
      lowerMsg.includes('what changed between my bills') ||
      lowerMsg.includes('what changed between the bills') ||
      lowerMsg.includes('what changed between bills') ||
      lowerMsg.includes('what caused this increase') ||
      lowerMsg.includes('what caused the increase') ||
      lowerMsg.includes('compare my bills') ||
      lowerMsg.includes('compare these bills') ||
      lowerMsg.includes('compare bills') ||
      lowerMsg.includes('bill comparison') ||
      lowerMsg.includes('breakdown of my bill') ||
      lowerMsg.includes('breakdown of the bill') ||
      lowerMsg.includes('breakdown of bill') ||
      lowerMsg.includes('explain my bill') ||
      lowerMsg.includes('explain bill') ||
      lowerMsg.includes('why is my bill high') ||
      lowerMsg.includes('bill so high') ||
      lowerMsg.includes('bill high') ||
      lowerMsg.includes('why did my bill increase') ||
      lowerMsg.includes('why did my bill change') ||
      lowerMsg.includes('why did the amount increase more than the units') ||
      lowerMsg.includes('why did the amount increase more than units') ||
      lowerMsg.includes('amount increase more than the units') ||
      lowerMsg.includes('amount increase more than units') ||
      lowerMsg.includes('amount increased more than units') ||
      lowerMsg.includes('why did the amount increase') ||
      ((lowerMsg.includes('what changed') || lowerMsg.includes('what does this mean') || lowerMsg.includes('what do these results mean') || lowerMsg.includes('what does it mean')) && (billContext != null || recentContext === 'bill')) ||
      ((lowerMsg.includes('explain the difference') || lowerMsg.includes('explain difference')) && (billContext != null || recentContext === 'bill' || words.has('bill') || words.has('bills') || words.has('units') || words.has('kwh'))) ||
      lowerMsg.includes('bill spike') ||
      lowerMsg.includes('bill jump') ||
      lowerMsg.includes('huge bill') ||
      (words.has('amount') && words.has('increase') && (words.has('units') || words.has('kwh'))) ||
      (words.has('explain') && (words.has('comparison') || (words.has('difference') && (words.has('bill') || words.has('bills') || words.has('units') || words.has('kwh') || billContext != null)) || words.has('results') || words.has('metrics') || words.has('bill') || words.has('bills'))) ||
      (words.has('compare') && (words.has('bill') || words.has('bills') || words.has('months'))) ||
      (words.has('why') && words.has('bill') && (words.has('high') || words.has('increase') || words.has('change') || words.has('up') || words.has('jump') || words.has('spike')))
    )

  const isAcQuery =
    !isGeneralTechQuery &&
    (
      words.has('ac') ||
      lowerMsg.includes('air conditioner') ||
      lowerMsg.includes('air conditioning') ||
      words.has('cooling') ||
      (recentContext === 'ac' && (
        lowerMsg.includes('hour') ||
        lowerMsg.includes('hrs') ||
        lowerMsg.includes('what if') ||
        lowerMsg.includes('what about') ||
        lowerMsg.includes('and for') ||
        lowerMsg.includes('instead') ||
        (lowerMsg.includes('run') && (lowerMsg.includes('only') || lowerMsg.includes('for') || /\d+/.test(lowerMsg)))
      ))
    )

  // ---------------------------------------------------------------------------
  // MULTI-QUESTION QUERY HANDLING
  // ---------------------------------------------------------------------------
  if (isKwhQuery && isComparisonQuery) {
    const kwhText = buildKwhDefinition()
    let compText
    if (billContext && billContext.ocr_processing) {
      compText = buildOcrProcessingReply()
    } else if (
      billContext &&
      (billContext.is_complete === false ||
        (billContext.has_bills && (billContext.curr_units == null || billContext.prev_units == null)))
    ) {
      compText = buildIncompleteBillReply(billContext)
    } else if (billContext && billContext.prev_units != null && billContext.curr_units != null) {
      compText = buildComparisonReply(billContext, questionnaireAnswers)
    } else {
      compText = buildMissingBillComparisonReply()
    }
    return {
      reply:
        `Here are answers to both parts of your question:\n\n` +
        `---\n\n### 1. What kWh (Kilowatt-Hour) Means\n` +
        kwhText +
        `\n\n---\n\n### 2. Breakdown of Your Bill Comparison\n` +
        compText,
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: billContext ? CONTEXT_SUGGESTIONS_BILL_LOADED : DEFAULT_SUGGESTIONS,
      disclaimers,
    }
  }

  if (isAcQuery && isComparisonQuery) {
    const { hours: parsedHours, count: parsedCount, previousHours } = extractApplianceNumbers(lowerMsg)
    const hours = parsedHours != null ? parsedHours : 8.0
    const count = parsedCount != null ? parsedCount : 1
    const acText = buildAcReply(hours, count, billContext, history, recentContext, previousHours)
    let compText
    if (billContext && billContext.ocr_processing) {
      compText = buildOcrProcessingReply()
    } else if (
      billContext &&
      (billContext.is_complete === false ||
        (billContext.has_bills && (billContext.curr_units == null || billContext.prev_units == null)))
    ) {
      compText = buildIncompleteBillReply(billContext)
    } else if (billContext && billContext.prev_units != null && billContext.curr_units != null) {
      compText = buildComparisonReply(billContext, questionnaireAnswers)
    } else {
      compText = buildMissingBillComparisonReply()
    }
    return {
      reply:
        `Here are answers to both parts of your question:\n\n` +
        `---\n\n### 1. Air Conditioner Power Consumption\n` +
        acText +
        `\n\n---\n\n### 2. Breakdown of Your Bill Comparison\n` +
        compText,
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: billContext ? CONTEXT_SUGGESTIONS_BILL_LOADED : DEFAULT_SUGGESTIONS,
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 2: Definition of kWh and basic electricity concepts
  // ---------------------------------------------------------------------------
  if (isKwhQuery) {
    return {
      reply:
        buildKwhDefinition() +
        '\n\nWould you like me to estimate how much kWh your household appliances consume, or compare your latest monthly units?',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'Why is my electricity bill so high this month?',
        'How do tariff slabs work?',
        'What should I do next?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 3: Navigation and Webpage Explanation
  // ---------------------------------------------------------------------------
  if (
    lowerMsg.includes('webpage') ||
    lowerMsg.includes('website') ||
    lowerMsg.includes('this page') ||
    lowerMsg.includes('this tool') ||
    lowerMsg.includes('this app') ||
    lowerMsg.includes('explain me this') ||
    lowerMsg.includes('explain this app') ||
    lowerMsg.includes('how does theftguard work') ||
    lowerMsg.includes('what can you do') ||
    (words.has('navigate') || (words.has('how') && words.has('use') && words.has('tool')))
  ) {
    return {
      reply:
        '**TheftGuard AI** is an intelligent electricity analytics platform designed for both household consumers and distribution utility engineers.\n\n' +
        'Here is a quick guide to what you can do on this website:\n\n' +
        '1. **Bill Comparison (`/app/bill-comparison`)** *(Current Workspace)*:\n' +
        '   Compare two consecutive monthly electricity bills side-by-side. Inspect changes in billed kWh, normalized daily burn (kWh/day), and tariff slab costs.\n\n' +
        '2. **Household Usage Questionnaire & AI Assistant**:\n' +
        '   Answer 4 quick optional questions about your home (AC, geysers, pumps) to generate a personalized energy breakdown and understand why your bill shifted.\n\n' +
        '3. **Single Bill Audit (`/app/bill-upload`)**:\n' +
        '   Upload a single spot-billing slip (such as TSSPDCL in Telangana) for browser-based OCR to check meter reading accuracy and punch errors.\n\n' +
        '4. **Utility Feeder Screening (`/app/screening`) & Overview (`/app/dashboard`)**:\n' +
        '   Allows electricity board engineers to screen entire distribution transformer (DT) customer batches using our 13-feature machine learning model.\n\n' +
        '5. **Field Investigations (`/app/investigations`) & Reports (`/app/reports`)**:\n' +
        '   Manages field audit checklists, photographic evidence, and inspection workflows.\n\n' +
        'To get started right now, you can click **"Load Telangana sample bills (Demo)"** in Bill Comparison to explore a live side-by-side analysis!',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'Why did my bill increase between these two months?',
        'What does kWh mean?',
        'What should I do next?',
        'How much electricity does an AC consume in 8 hours?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 4: "What should I do next?" / Next steps guidance
  // ---------------------------------------------------------------------------
  if (
    lowerMsg.includes('what should i do next') ||
    lowerMsg.includes('what to do next') ||
    lowerMsg.includes('what next') ||
    lowerMsg.includes('next steps') ||
    lowerMsg.includes('how to proceed') ||
    lowerMsg.includes('what should i do') ||
    lowerMsg.includes('what do i do now')
  ) {
    if (billContext && billContext.ocr_processing) {
      return {
        reply:
          `Your bill is currently being scanned with on-device OCR.\n\n` +
          '1. **Wait for OCR Scan**: The reader is recognizing meter readings, dates, and amounts from your bill.\n' +
          '2. **Verify Extracted Values**: Check that units consumed (kWh) and amount payable (₹) match your paper bill.\n' +
          '3. **Fill Any Missing Fields**: If any label on your bill was unclear, enter the numbers directly into the form.\n' +
          '4. **Review Comparison**: Once both bills are entered, ask me to explain the comparison for a complete breakdown.',
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: [
          'What does kWh mean?',
          'How much electricity does an AC consume in 8 hours?',
          'How can I check if my meter reading is accurate?',
        ],
        disclaimers,
      }
    }

    if (billContext && billContext.prev_units != null && billContext.curr_units != null) {
      const delta = Math.round((billContext.curr_units - billContext.prev_units) * 10) / 10
      return {
        reply:
          `Based on your active bill comparison (${kwh(billContext.prev_units)} vs ${kwh(billContext.curr_units)}, a shift of ${delta >= 0 ? '+' : ''}${delta} kWh), here is your recommended action plan:\n\n` +
          '1. **Verify Your Physical Meter Reading**:\n' +
          '   Go to your physical meter box. Check if the cumulative reading on the dial is equal to or higher than the "Current Reading" printed on your bill. If the meter dial shows a lower number, your bill was inflated by a reader punch error.\n\n' +
          '2. **Review Your Appliance Profile**:\n' +
          '   Click on the **"Household Usage Profile"** tab in this drawer. Enter your AC hours and heavy appliances to verify whether normal cooling explains this difference.\n\n' +
          '3. **Perform a Switch-Off Test**:\n' +
          '   Turn off your home MCB or unplug appliances for 10 minutes. If the red impulse LED on your meter continues blinking rapidly, investigate internal wiring leakage or a running water pump.\n\n' +
          '4. **Request a Bill Revision if Inaccurate**:\n' +
          '   If your bill has a punch error or suspected meter fault, take a photo of the meter dial and submit a revision request to your DISCOM office or call **1912**.',
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: [
          'How can I check if my meter reading is accurate?',
          'How do tariff slabs affect this bill amount?',
          'Tips to reduce next month’s bill',
        ],
        disclaimers,
      }
    }

    if (billContext && (billContext.is_complete === false || billContext.has_bills)) {
      return {
        reply:
          `You have bill information loaded in Bill Comparison, but some details are still needed before computing a full comparison.\n\n` +
          '1. **Enter Missing Details**: Check the bill slot cards in **Bill Comparison** (/app/bill-comparison) and enter any missing units or amounts.\n' +
          '2. **Verify Meter Reading**: Confirm the current reading against your physical meter dial.\n' +
          '3. **Ask for Breakdown**: Once both bills have units and amounts, ask me "Explain the comparison" for full analysis.\n' +
          '4. **Fill Household Profile**: Add your AC or geyser usage in the Household Usage Profile tab to see itemized appliance costs.',
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: [
          'What does kWh mean?',
          'How can I check if my meter reading is accurate?',
          'How much electricity does an AC consume in 8 hours?',
        ],
        disclaimers,
      }
    }

    return {
      reply:
        'Here is the best way to proceed step-by-step:\n\n' +
        '1. **Load Your Electricity Bills**:\n' +
        '   Go to **Bill Comparison** (`/app/bill-comparison`). You can click **"Load Telangana sample bills (Demo)"** to see an immediate example, or upload your own previous and current bill receipts.\n\n' +
        '2. **Review Verified Metrics**:\n' +
        '   The tool will calculate your exact consumption difference, normalized daily burn (kWh/day), and tariff impact.\n\n' +
        '3. **Complete the 4-Question Usage Profile**:\n' +
        '   Answer quick questions about your AC, water heater, and water pump to see an itemized energy breakdown.\n\n' +
        '4. **Take Action on Insights**:\n' +
        '   Use our practical energy-saving checklist and meter-verification steps to ensure your billing is accurate and keep costs down.\n\n' +
        'Would you like me to walk you through comparing your bills, or explain how electricity meters work?',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'Could you explain me this webpage?',
        'What does kWh mean?',
        'Why is my electricity bill so high this month?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 5: Bill Comparison Breakdown / "Explain the comparison" / "Why is bill high"
  // ---------------------------------------------------------------------------
  if (isComparisonQuery) {
    if (billContext && billContext.ocr_processing) {
      return {
        reply: buildOcrProcessingReply(),
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: [
          'What does kWh mean?',
          'How much electricity does an AC consume in 8 hours?',
          'How do tariff slabs work?',
        ],
        disclaimers,
      }
    }

    if (
      billContext &&
      (billContext.is_complete === false ||
        (billContext.has_bills && (billContext.curr_units == null || billContext.prev_units == null)))
    ) {
      return {
        reply: buildIncompleteBillReply(billContext),
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: [
          'What should I do next?',
          'How much electricity does an AC consume in 8 hours?',
          'What does kWh mean?',
        ],
        disclaimers,
      }
    }

    if (billContext && billContext.prev_units != null && billContext.curr_units != null) {
      return {
        reply: buildComparisonReply(billContext, questionnaireAnswers),
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: [
          'What should I do next?',
          'How much electricity does an AC consume in 8 hours?',
          'How can I check if my meter reading is accurate?',
          'Tips to reduce next month’s bill',
        ],
        disclaimers,
      }
    }

    return {
      reply: buildMissingBillComparisonReply(),
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'How can I check if my meter reading is accurate?',
        'What does kWh mean?',
        'How much electricity does an AC consume in 8 hours?',
        'What should I do next?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 6: Air Conditioning Queries & Follow-ups
  // ---------------------------------------------------------------------------
  if (isAcQuery) {
    const { hours: parsedHours, count: parsedCount, previousHours } = extractApplianceNumbers(lowerMsg)
    const hours = parsedHours != null ? parsedHours : 8.0
    const count = parsedCount != null ? parsedCount : 1
    return {
      reply: buildAcReply(hours, count, billContext, history, recentContext, previousHours),
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'And if I run it for 4 hours instead?',
        'How do tariff slabs affect this bill amount?',
        'Tips to reduce next month’s bill',
        'Why is my electricity bill so high this month?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 7: Geyser / Water Heater
  // ---------------------------------------------------------------------------
  if (words.has('geyser') || lowerMsg.includes('water heater') || (recentContext === 'geyser' && lowerMsg.includes('hours'))) {
    const { hours: parsedHours } = extractApplianceNumbers(lowerMsg)
    const hours = parsedHours != null ? parsedHours : 0.5 // default 30 mins
    const dailyKwh = Math.round(hours * 2.0 * 10) / 10
    const monthlyKwh = Math.round(dailyKwh * 30 * 10) / 10
    const cost = Math.round(monthlyKwh * 7)

    return {
      reply:
        `**Water Heater / Geyser Power Consumption:**\n\n` +
        `• **Rating**: Standard 15L to 25L storage geysers use a **2,000-watt (2 kW)** heating element.\n` +
        `• **Rate of Consumption**: A 2 kW geyser consumes **2.0 units (kWh) for every 1 hour** of continuous heating.\n` +
        `• **Daily & Monthly Load**: Running it for **${hours * 60} minutes/day** consumes ~**${dailyKwh} units/day** (**~${monthlyKwh} units/month**), adding roughly **₹${cost}** to your monthly bill.\n\n` +
        `*Tip*: Turn off the geyser 15–20 minutes before bathing. Leaving a geyser on all day wastes 1.5 to 2.5 units daily in standby standing thermal losses alone.`,
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'Tips to reduce next month’s bill',
        'How do tariff slabs work?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 8: Refrigerator
  // ---------------------------------------------------------------------------
  if (words.has('refrigerator') || words.has('fridge')) {
    return {
      reply:
        `**Refrigerator Power Consumption:**\n\n` +
        `• **Standard 250L Frost-Free (3-Star)**: Draws ~150W rated power, running auto-cycling compressors 24/7. It consumes approximately **1.0 unit (kWh) per day** (~30 to 35 units per month).\n` +
        `• **Direct-Cool Single Door (190L)**: Uses less power, averaging **0.75 units/day** (~22 to 25 units/month).\n` +
        `• **Large Multi-Door (400L+)**: Averages **1.5 to 1.8 units/day** (~45 to 55 units/month).\n\n` +
        `*Check*: If the rubber door gasket is loose or worn, warm air enters continuously, causing the compressor to run double duty and raising power consumption significantly.`,
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'How can I check if my meter reading is accurate?',
        'Tips to reduce next month’s bill',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 9: Water Pump / Motor
  // ---------------------------------------------------------------------------
  if (words.has('pump') || words.has('motor') || words.has('borewell')) {
    const { hours: parsedHours } = extractApplianceNumbers(lowerMsg)
    const hours = parsedHours != null ? parsedHours : 1.0
    const dailyKwh = Math.round(hours * 0.75 * 10) / 10
    const monthlyKwh = Math.round(dailyKwh * 30 * 10) / 10

    return {
      reply:
        `**Water Pump / Motor Consumption:**\n\n` +
        `• **1 HP Pump / Borewell (750W)**: Consumes approximately **0.75 units (kWh) per running hour**.\n` +
        `• **0.5 HP Booster Pump (375W)**: Consumes approximately **0.38 units (kWh) per running hour**.\n` +
        `• Running a 1 HP pump for **${hours} hour(s) daily** adds ~**${dailyKwh} units/day** (**~${monthlyKwh} units/month**).\n\n` +
        `*Tip*: Install an automatic overhead water-level controller to avoid continuous overflow, which is one of the most common causes of unnoticed bill jumps.`,
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'Why is my electricity bill so high this month?',
        'Tips to reduce next month’s bill',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 10: Meter verification / faulty meter / switch-off test
  // ---------------------------------------------------------------------------
  if (
    words.has('meter') ||
    words.has('reading') ||
    words.has('dial') ||
    words.has('faulty') ||
    words.has('jumping') ||
    words.has('blink') ||
    lowerMsg.includes('check my meter') ||
    lowerMsg.includes('meter reading accurate')
  ) {
    return {
      reply:
        'Here is how you can verify your electricity meter step-by-step:\n\n' +
        '1. **Compare the Physical Dial Reading**:\n' +
        '   Go to your physical meter box. Wait for the digital display to cycle to the cumulative kWh value (labeled "KWH" or "TOTAL UNITS"). Compare this number with the "Current Reading" on your bill.\n' +
        '   - **Normal**: The meter dial should be equal to or slightly higher than the bill reading (since units have passed since billing day).\n' +
        '   - **Punch Error**: If the meter dial shows a lower number than the bill reading, the reader mistyped it. Take a photo and request a bill revision.\n\n' +
        '2. **The "Switch-Off Test" (Check for Phantom Draw or Faulty Meter)**:\n' +
        '   - Turn OFF your main MCB switch inside your home, or unplug all appliances.\n' +
        '   - Observe the small red LED pulse light on the meter (marked "CAL" or "imp/kWh").\n' +
        '   - The blinking should **stop completely**. If it continues blinking at high frequency while all home power is off, there may be internal wiring leakage, a running booster pump, or a meter calibration fault.\n\n' +
        '3. **Reporting to DISCOM**:\n' +
        '   In Telangana, call **1912** or visit your local DISCOM sub-engineer office with a dated photo of your meter dial to request an official meter accuracy test.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'Why is my electricity bill so high this month?',
        'What should I do next?',
        'How do tariff slabs work?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 11: Tariff slabs, fixed charges, and effective cost
  // ---------------------------------------------------------------------------
  if (
    words.has('slab') ||
    words.has('slabs') ||
    words.has('tariff') ||
    words.has('tariffs') ||
    lowerMsg.includes('tariff') ||
    lowerMsg.includes('slab') ||
    words.has('rate') ||
    words.has('telescopic') ||
    words.has('charge') ||
    words.has('charges') ||
    lowerMsg.includes('fixed charge') ||
    lowerMsg.includes('cost per unit')
  ) {
    return {
      reply:
        '**Understanding Domestic Electricity Tariff Slabs & Billing Structures:**\n\n' +
        'Domestic electricity billing in India typically employs a **telescopic (tiered) tariff structure** determined by each state’s Electricity Regulatory Commission (such as TSERC in Telangana, KERC in Karnataka, or MERC in Maharashtra):\n\n' +
        '• **Slab Brackets (Tiered Rates)**: Consumption is segmented into slab tiers. Initial lifeline units are billed at lower, subsidized rates, while incremental consumption crossing into higher slabs is billed at progressively higher per-unit rates.\n' +
        '• **Specific Slabs Vary by Utility**: Slab boundaries (e.g. 50, 100, 200, or 400 units) and per-unit rates depend on your local DISCOM tariff schedule, consumer category (e.g., LT-I Domestic), and applicable state subsidy schemes (such as Gruha Jyothi or domestic lifeline subsidies).\n\n' +
        '**Why the Bill Amount Often Rises Faster Than Units (The "Cliff Effect"):**\n' +
        'When monthly consumption increases and steps into a higher slab bracket, three factors compound:\n' +
        '1. **Higher marginal unit rate**: Incremental units are charged at the higher rate bracket.\n' +
        '2. **Fixed Demand Charges**: Monthly customer/demand charges (based on sanctioned load in kW) often increase across tiers.\n' +
        '3. **Surcharges & Duty**: Electricity duty and Fuel Surcharge Adjustments (FSA/FAC) are calculated on total energy and charges.\n\n' +
        '**Effective Cost per Unit**: Calculated as (Total Bill Amount ÷ Units Consumed). This is always higher than the base slab rate because it averages fixed charges, duties, and surcharges across your total units.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'Why did my bill increase between these two months?',
        'How much electricity does an AC consume in 8 hours?',
        'Tips to reduce next month’s bill',
      ],
      disclaimers,
    }
  }



  // ---------------------------------------------------------------------------
  // INTENT 11D: Clarification / "I don't understand your previous answer"
  // ---------------------------------------------------------------------------
  const isClarificationRequest =
    lowerMsg.includes("don't understand") ||
    lowerMsg.includes('dont understand') ||
    lowerMsg.includes('did not understand') ||
    lowerMsg.includes('could not understand') ||
    lowerMsg.includes('explain simpler') ||
    lowerMsg.includes('explain in simpler') ||
    lowerMsg.includes('make it simple') ||
    lowerMsg.includes('too complicated') ||
    lowerMsg.includes('too technical') ||
    lowerMsg.includes('what do you mean') ||
    lowerMsg.includes('clarify that') ||
    lowerMsg.includes('simplify')

  if (isClarificationRequest) {
    const lastContext = detectHistoryContext(history)
    let summaryText = ''

    if (lastContext === 'ac') {
      summaryText =
        '1. **ACs consume significant power**: A standard 1.5-ton AC uses about 1 unit (kWh) of electricity for each hour it runs.\n' +
        '2. **Running 8 hours daily adds ~240 units/month**: This single appliance can account for over half of an average summer bill.\n' +
        '3. **Setting it at 24°C saves money**: Running at 24°C instead of 18°C lowers compressor run-time and cuts your bill by up to 24%.'
    } else if (lastContext === 'tariff') {
      summaryText =
        '1. **Electricity rates rise in steps (slabs)**: The more units you use in a month, the higher the price per unit becomes for those extra units.\n' +
        '2. **Fixed charges also increase**: Beyond a certain usage level, utilities charge higher monthly connection fees.\n' +
        '3. **Result**: A 20% increase in power usage can cause your bill amount to increase by 30% or more.'
    } else if (lastContext === 'bill' && billContext && billContext.curr_units != null && billContext.prev_units != null) {
      const delta = Math.round((billContext.curr_units - billContext.prev_units) * 10) / 10
      summaryText =
        `1. **Your usage increased**: You used **${kwh(billContext.curr_units)}** this month compared to **${kwh(billContext.prev_units)}** last month (${delta >= 0 ? '+' : ''}${delta} units).\n` +
        `2. **Check your meter**: Make sure the reading on your bill matches the dial on your physical meter to rule out reader mistypes.\n` +
        `3. **Review appliances**: Extra cooling, geyser hours, or visitors usually explain unit increases.`
    } else {
      summaryText =
        '1. **kWh means "Units"**: 1 unit on your bill = using 1,000 watts for 1 hour (e.g. an iron for 1 hour).\n' +
        '2. **Seasonal shifts are normal**: Heat waves, summer cooling, and extra days in the billing cycle are the most common causes of high bills.\n' +
        '3. **No theft accusation**: TheftGuard AI is an educational tool. Bill increases do NOT imply power theft.'
    }

    return {
      reply:
        'I apologize if my previous answer was too technical! Here is a simple, plain-English summary:\n\n' +
        summaryText +
        '\n\nWould you like me to explain any specific part in more detail?',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'How do tariff slabs work?',
        'How can I check if my meter reading is accurate?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 12: Energy saving recommendations
  // ---------------------------------------------------------------------------
  if (
    words.has('reduce') ||
    words.has('save') ||
    words.has('saving') ||
    words.has('savings') ||
    words.has('tips') ||
    words.has('lower') ||
    words.has('conserve') ||
    words.has('cut') ||
    lowerMsg.includes('save electricity') ||
    lowerMsg.includes('reduce bill')
  ) {
    return {
      reply:
        '**High-Impact Ways to Reduce Your Monthly Electricity Bill:**\n\n' +
        '1. **Air Conditioner Optimization (Largest Savings)**:\n' +
        '   • Keep the thermostat at **24°C to 25°C**. Every 1°C increase saves 4% to 6% on cooling power.\n' +
        '   • Use the AC sleep/timer mode to automatically turn off 1–2 hours before morning wake-up.\n' +
        '   • Clean AC air filters every 15 days; clogged filters force compressors to run 15% longer.\n\n' +
        '2. **Water Heater / Geyser Management**:\n' +
        '   • Switch on the geyser only 15–20 minutes before bathing; do not leave it on continuously.\n' +
        '   • A 2kW geyser left powered for 2 hours daily wastes ~120 units each month.\n\n' +
        '3. **Switch to 5-Star BLDC Ceiling Fans**:\n' +
        '   • BLDC fans consume ~28W compared to ~75W for traditional induction fans, saving ~15 to 20 units per fan every month.\n\n' +
        '4. **Water Motor Automation**:\n' +
        '   • Install an automatic water-level controller to eliminate rooftop tank overflow.\n\n' +
        '5. **Eliminate Standby Phantom Draw**:\n' +
        '   • Turn off set-top boxes, microwave displays, and entertainment systems at the wall switch when unused.',
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: [
        'How much electricity does an AC consume in 8 hours?',
        'How do tariff slabs work?',
        'What should I do next?',
      ],
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 13: Greetings and conversation opening ("Hi there", "Hello")
  // ---------------------------------------------------------------------------
  const isPureGreeting =
    !isGeneralTechQuery &&
    !isKwhQuery &&
    !isComparisonQuery &&
    !isAcQuery &&
    (words.has('hi') ||
      words.has('hello') ||
      words.has('hey') ||
      words.has('namaste') ||
      words.has('greetings') ||
      lowerMsg.startsWith('hi there') ||
      lowerMsg.startsWith('hello there') ||
      lowerMsg.startsWith('good morning') ||
      lowerMsg.startsWith('good afternoon') ||
      lowerMsg.startsWith('good evening')) &&
    !words.has('kwh') &&
    !words.has('bill') &&
    !words.has('ac') &&
    !words.has('meter') &&
    !words.has('geyser') &&
    !words.has('pump') &&
    !words.has('motor') &&
    !words.has('fridge') &&
    !words.has('refrigerator') &&
    !words.has('tariff') &&
    !words.has('slab') &&
    !words.has('investigation')

  if (isPureGreeting) {
    let greeting = 'Hello! Welcome to the **TheftGuard AI Bill Assistant**.\n\n'
    if (billContext && billContext.ocr_processing) {
      greeting +=
        `I notice your electricity bill is currently being scanned with OCR. Once recognition completes, I will be ready to explain your consumption changes and cost breakdown!\n\n` +
        `In the meantime, feel free to ask about kWh, appliance power usage, or how meters work.`
      return {
        reply: greeting,
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: [
          'What does kWh mean?',
          'How much electricity does an AC consume in 8 hours?',
          'How do tariff slabs work?',
        ],
        disclaimers,
      }
    }

    if (billContext && billContext.prev_units != null && billContext.curr_units != null) {
      const delta = Math.round((billContext.curr_units - billContext.prev_units) * 10) / 10
      greeting +=
        `I see your active bill comparison between **${billContext.prev_period || 'Previous Month'}** (${kwh(billContext.prev_units)}) and **${billContext.curr_period || 'Current Month'}** (${kwh(billContext.curr_units)}), showing a shift of **${delta >= 0 ? '+' : ''}${delta} kWh**.\n\n` +
        `How can I help you today? You can ask me why your bill changed, how much electricity your appliances consume, or what steps to take next.`
      return {
        reply: greeting,
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: CONTEXT_SUGGESTIONS_BILL_LOADED,
        disclaimers,
      }
    }

    if (billContext && (billContext.is_complete === false || billContext.has_bills)) {
      greeting +=
        `I can see bill information loaded in Bill Comparison, though some details are still needed before computing a full comparison.\n\n` +
        `You can fill in any missing fields on the bill cards, or ask me any question about power usage and tariffs!`
      return {
        reply: greeting,
        provider: 'local_rule_engine',
        structured_analysis: analysis,
        suggestions: [
          'What should I do next?',
          'What does kWh mean?',
          'How much electricity does an AC consume in 8 hours?',
        ],
        disclaimers,
      }
    }

    greeting +=
      'I help residential consumers understand electricity bills, compare monthly consumption, calculate appliance power use (AC, geysers, pumps), and identify billing errors.\n\n' +
      'You can upload your bills in **Bill Comparison** (`/app/bill-comparison`) to see an itemized breakdown, or ask me any question about power usage and tariffs!'

    return {
      reply: greeting,
      provider: 'local_rule_engine',
      structured_analysis: analysis,
      suggestions: DEFAULT_SUGGESTIONS,
      disclaimers,
    }
  }

  // ---------------------------------------------------------------------------
  // INTENT 14: Unknown or unsupported questions (Helpful clarification)
  // ---------------------------------------------------------------------------
  return {
    reply:
      `I want to make sure I give you accurate guidance. I specialize in household electricity billing, appliance energy consumption, and meter accuracy.\n\n` +
      `Here are some specific topics I can help you with right now:\n` +
      `• **Bill Analysis**: Why your bill increased, what kWh means, and how telescopic tariff slabs work.\n` +
      `• **Appliance Estimates**: How much electricity your AC, geyser, refrigerator, or water pump consumes for specific hours.\n` +
      `• **Meter Verification**: How to check your physical meter dial and run a switch-off test for reading errors.\n` +
      `• **Navigation**: How to use Bill Comparison, Bill Upload OCR, or Utility Screening.\n\n` +
      `Could you clarify which of these topics you would like to explore?`,
    provider: 'local_rule_engine',
    structured_analysis: analysis,
    suggestions: [
      'What does kWh mean?',
      'Why is my electricity bill so high this month?',
      'How much electricity does an AC consume in 8 hours?',
      'What should I do next?',
    ],
    disclaimers,
  }
}

/**
 * High-level chat function that attempts backend communication and transparently
 * falls back to the deterministic client rule engine if the backend is unreachable.
 */
export async function chatWithAssistant({
  message,
  billContext = null,
  questionnaireAnswers = null,
  history = [],
  forceOffline = false,
  signal = null,
}) {
  if (forceOffline) {
    return generateClientRuleResponse(message, billContext, questionnaireAnswers, history)
  }

  try {
    const res = await sendAssistantChat(
      {
        message,
        bill_context: billContext,
        questionnaire_answers: questionnaireAnswers,
        history,
      },
      { signal }
    )
    return res
  } catch (err) {
    if (err.code === 'cancelled' || signal?.aborted) {
      throw err
    }
    // Graceful offline fallback
    console.info('Backend assistant unavailable; falling back to local client rule engine:', err.message)
    const local = generateClientRuleResponse(message, billContext, questionnaireAnswers, history)
    return {
      ...local,
      provider: 'client_rule_engine (offline fallback)',
    }
  }
}
