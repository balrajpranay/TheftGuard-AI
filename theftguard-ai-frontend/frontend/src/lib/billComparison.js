/**
 * Household Electricity Bill Comparison Engine
 * Pure client-side calculations and validations for comparing two consecutive electricity bills.
 */

import { inr, kwh, pct } from './format.js'

export const INITIAL_DUAL_BILL_FIELDS = {
  consumerNumber: '',
  discom: '',
  billingPeriod: '',
  billDate: '',
  billingDays: '',
  previousReading: '',
  currentReading: '',
  unitsConsumed: '',
  amountPayable: '',
}

export const DEMO_PREVIOUS_BILL = {
  consumerNumber: '100458921',
  discom: 'TSSPDCL (Hyderabad Central)',
  billingPeriod: 'June 2026',
  billDate: '2026-07-02',
  previousReading: '14060',
  currentReading: '14280',
  unitsConsumed: '220',
  billingDays: '30',
  amountPayable: '1480',
  tariffCategory: 'LT-1(B) Domestic',
  contractedLoadKw: '3.0 kW',
}

export const DEMO_CURRENT_BILL = {
  consumerNumber: '100458921',
  discom: 'TSSPDCL (Hyderabad Central)',
  billingPeriod: 'July 2026',
  billDate: '2026-08-02',
  previousReading: '14280',
  currentReading: '14525',
  unitsConsumed: '245',
  billingDays: '31',
  amountPayable: '1725',
  tariffCategory: 'LT-1(B) Domestic',
  contractedLoadKw: '3.0 kW',
}

export function createInitialSlotState(defaultFields = {}) {
  return {
    file: null,
    fileInfo: null,
    previewUrl: null,
    isDemo: false,
    source: 'empty', // 'empty' | 'demo' | 'ocr' | 'manual'
    ocrStage: 'idle', // 'idle' | 'processing' | 'done' | 'error'
    ocrProgress: { status: '', percent: 0 },
    ocrMessage: '',
    ocrWarnings: [],
    pdfNotice: '',
    fields: { ...INITIAL_DUAL_BILL_FIELDS, ...defaultFields },
  }
}

/**
 * Cleans string numbers with commas, spaces, currency symbols, or units (e.g. "₹1,725.50" -> 1725.5)
 */
export function cleanNumber(val) {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  const cleaned = String(val)
    .replace(/[₹$€£]/g, '')
    .replace(/\b(?:rs\.?|inr|kwh|units?)\b/gi, '')
    .replace(/,/g, '')
    .trim()
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Normalizes a consumer identifier for reliable matching
 */
export function normalizeConsumerId(id) {
  if (!id) return ''
  return String(id).replace(/[\s\-_/.]/g, '').toLowerCase()
}

/**
 * Validates consumer identifiers across two bills
 */
export function checkConsumerMatch(prevId, currId) {
  const normPrev = normalizeConsumerId(prevId)
  const normCurr = normalizeConsumerId(currId)

  if (!normPrev && !normCurr) {
    return {
      status: 'both_missing',
      match: false,
      isMissing: true,
      isMismatch: false,
      warning:
        'Consumer / USCNO reference is missing on both bills. Verify that both bills belong to the same connection before comparing.',
    }
  }

  if (!normPrev || !normCurr) {
    const missingSlot = !normPrev ? 'previous' : 'current'
    return {
      status: 'one_missing',
      match: false,
      isMissing: true,
      isMismatch: false,
      warning: `Consumer number is missing on the ${missingSlot} bill. Verify that both bills belong to the same connection before comparing.`,
    }
  }

  if (normPrev !== normCurr) {
    return {
      status: 'mismatch',
      match: false,
      isMissing: false,
      isMismatch: true,
      warning: `Consumer numbers do not match ("${prevId}" vs "${currId}"). Comparing bills from different connections or premises may produce misleading results.`,
    }
  }

  return {
    status: 'match',
    match: true,
    isMissing: false,
    isMismatch: false,
    warning: null,
  }
}

/**
 * Validates a single bill's fields for comparison calculations
 */
export function validateBillData(fields = {}, role = 'Bill') {
  const errors = []
  const warnings = []

  const rawUnits = fields.unitsConsumed
  const units = cleanNumber(rawUnits)

  if (rawUnits === '' || rawUnits === undefined || rawUnits === null) {
    errors.push(`${role}: Units consumed in kWh is required.`)
  } else if (units === null) {
    errors.push(`${role}: Units consumed must be a valid number (received "${rawUnits}").`)
  } else if (units < 0) {
    errors.push(`${role}: Units consumed cannot be negative (${units} kWh).`)
  }

  const rawAmount = fields.amountPayable
  const amount = cleanNumber(rawAmount)

  if (rawAmount === '' || rawAmount === undefined || rawAmount === null) {
    errors.push(`${role}: Amount payable in ₹ is required.`)
  } else if (amount === null) {
    errors.push(`${role}: Amount payable must be a valid number (received "${rawAmount}").`)
  } else if (amount < 0) {
    errors.push(`${role}: Amount payable cannot be negative (₹${amount}).`)
  }

  const rawDays = fields.billingDays
  const days = cleanNumber(rawDays)

  if (rawDays === '' || rawDays === undefined || rawDays === null) {
    warnings.push(`${role}: Billing days is not specified. Average daily consumption (kWh/day) cannot be computed.`)
  } else if (days === null || !Number.isInteger(days) || days <= 0) {
    errors.push(`${role}: Billing days must be a positive whole number (received "${rawDays}").`)
  } else if (days > 90) {
    warnings.push(`${role}: Billing days (${days}) is unusually long for a standard monthly cycle (normally 28-35 days).`)
  }

  // Reading sequence check if readings provided
  const prevReading = cleanNumber(fields.previousReading)
  const currReading = cleanNumber(fields.currentReading)
  if (prevReading !== null && currReading !== null) {
    if (currReading < prevReading) {
      warnings.push(
        `${role}: Present meter reading (${currReading}) is lower than previous reading (${prevReading}). Check if a meter rollover or meter replacement occurred.`
      )
    }
  }

  if (!fields.consumerNumber) {
    warnings.push(`${role}: Consumer / USCNO number is blank.`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    parsed: {
      unitsConsumed: units,
      amountPayable: amount,
      billingDays: days,
      consumerNumber: fields.consumerNumber ? String(fields.consumerNumber).trim() : '',
      discom: fields.discom ? String(fields.discom).trim() : '',
      billingPeriod: fields.billingPeriod ? String(fields.billingPeriod).trim() : '',
      billDate: fields.billDate ? String(fields.billDate).trim() : '',
      previousReading: prevReading,
      currentReading: currReading,
    },
  }
}

/**
 * Generates deterministic, responsible textual summary statements
 */
export function generateComparisonSummary(m) {
  const statements = []

  // 1. Consumption statement
  if (m.consumptionDelta > 0) {
    const pctStr = m.consumptionPctChange !== null ? ` (+${m.consumptionPctChange}%)` : ' (from a 0 kWh baseline)'
    statements.push(
      `Your recorded consumption increased by ${m.consumptionDelta} kWh${pctStr}, from ${m.prevUnits} kWh to ${m.currUnits} kWh.`
    )
  } else if (m.consumptionDelta < 0) {
    const pctStr = m.consumptionPctChange !== null ? ` (${m.consumptionPctChange}%)` : ''
    statements.push(
      `Your recorded consumption decreased by ${Math.abs(m.consumptionDelta)} kWh${pctStr}, from ${m.prevUnits} kWh to ${m.currUnits} kWh.`
    )
  } else {
    statements.push(`Your recorded consumption remained unchanged at ${m.currUnits} kWh.`)
  }

  // 2. Billing days and daily consumption rate
  if (m.hasDailyRate) {
    if (m.prevDays !== m.currDays) {
      if (m.dailyDelta > 0) {
        const pctStr = m.dailyPctChange !== null ? ` (+${m.dailyPctChange}%)` : ''
        statements.push(
          `Accounting for unequal billing cycle durations (${m.prevDays} days vs ${m.currDays} days), your average daily consumption increased by +${m.dailyDelta} kWh/day${pctStr}, shifting from ${m.prevDaily} to ${m.currDaily} kWh/day.`
        )
      } else if (m.dailyDelta < 0) {
        const pctStr = m.dailyPctChange !== null ? ` (${m.dailyPctChange}%)` : ''
        statements.push(
          `Accounting for unequal billing cycle durations (${m.prevDays} days vs ${m.currDays} days), your average daily consumption decreased by ${Math.abs(m.dailyDelta)} kWh/day${pctStr}, shifting from ${m.prevDaily} to ${m.currDaily} kWh/day.`
        )
      } else {
        statements.push(
          `Even though cycle lengths differed (${m.prevDays} days vs ${m.currDays} days), your daily consumption remained steady at ${m.currDaily} kWh/day.`
        )
      }
    } else {
      if (m.dailyDelta > 0) {
        const pctStr = m.dailyPctChange !== null ? ` (+${m.dailyPctChange}%)` : ''
        statements.push(
          `Across matching ${m.currDays}-day cycles, average daily consumption changed by +${m.dailyDelta} kWh/day${pctStr} (from ${m.prevDaily} to ${m.currDaily} kWh/day).`
        )
      } else if (m.dailyDelta < 0) {
        const pctStr = m.dailyPctChange !== null ? ` (${m.dailyPctChange}%)` : ''
        statements.push(
          `Across matching ${m.currDays}-day cycles, average daily consumption changed by ${m.dailyDelta} kWh/day${pctStr} (from ${m.prevDaily} to ${m.currDaily} kWh/day).`
        )
      } else {
        statements.push(`Average daily consumption remained identical at ${m.currDaily} kWh/day.`)
      }
    }
  } else {
    statements.push(
      'Billing cycle duration (days) was not provided on both bills. Cycle normalization could not be calculated.'
    )
  }

  // 3. Bill amount statement
  if (m.amountDelta > 0) {
    const pctStr = m.amountPctChange !== null ? ` (+${m.amountPctChange}%)` : ' (from a ₹0 baseline)'
    statements.push(
      `Your total bill amount increased by ${inr(m.amountDelta)}${pctStr}, changing from ${inr(m.prevAmount)} to ${inr(m.currAmount)}.`
    )
  } else if (m.amountDelta < 0) {
    const pctStr = m.amountPctChange !== null ? ` (${m.amountPctChange}%)` : ''
    statements.push(
      `Your total bill amount decreased by ${inr(Math.abs(m.amountDelta))}${pctStr}, changing from ${inr(m.prevAmount)} to ${inr(m.currAmount)}.`
    )
  } else {
    statements.push(`Your total bill amount remained unchanged at ${inr(m.currAmount)}.`)
  }

  return {
    headline:
      m.consumptionDelta > 0
        ? `Recorded Consumption Rose by ${m.consumptionDelta} kWh`
        : m.consumptionDelta < 0
          ? `Recorded Consumption Dropped by ${Math.abs(m.consumptionDelta)} kWh`
          : 'Recorded Consumption Unchanged',
    statements,
    disclaimers: [
      'Consumption change versus cost change: In Indian electricity billing (e.g. TSSPDCL LT-1 Domestic), tariffs are structured into progressive telescopic slabs (e.g. 0-50, 51-100, 101-200 units). Crossing into a higher slab, fuel surcharge adjustments (FSA), electricity duty, or fixed contracted load charges can cause bill amounts to rise faster than consumed units.',
      'Neutral assessment: A change in recorded consumption or bill amount is a routine occurrence in residential connections. Variations are commonly caused by seasonal weather (such as summer air conditioning or winter water heaters), changes in occupancy, holiday schedules, or guests. An increase alone does not establish electricity theft or meter irregularity.',
    ],
  }
}

/**
 * Calculates complete comparative differences between previous and current bills
 */
export function calculateBillComparison(prevFields, currFields) {
  const prevValidation = validateBillData(prevFields, 'Previous bill')
  const currValidation = validateBillData(currFields, 'Current bill')

  const allErrors = [...prevValidation.errors, ...currValidation.errors]
  const allWarnings = [...prevValidation.warnings, ...currValidation.warnings]

  const consumerCheck = checkConsumerMatch(prevFields?.consumerNumber, currFields?.consumerNumber)
  if (consumerCheck.warning) {
    allWarnings.unshift(consumerCheck.warning)
  }

  if (!prevValidation.isValid || !currValidation.isValid) {
    return {
      canCompare: false,
      errors: allErrors,
      warnings: allWarnings,
      consumerCheck,
      prevValidation,
      currValidation,
    }
  }

  const p = prevValidation.parsed
  const c = currValidation.parsed

  // 1. Consumption comparison
  const prevUnits = p.unitsConsumed
  const currUnits = c.unitsConsumed
  const consumptionDelta = Math.round((currUnits - prevUnits) * 100) / 100

  let consumptionPctChange = null
  if (prevUnits > 0) {
    consumptionPctChange = Math.round(((currUnits - prevUnits) / prevUnits) * 1000) / 10
  } else if (prevUnits === 0 && currUnits === 0) {
    consumptionPctChange = 0
  }

  // 2. Billing days & daily rate
  const prevDays = p.billingDays
  const currDays = c.billingDays
  const hasDailyRate = Boolean(prevDays && currDays && prevDays > 0 && currDays > 0)

  let prevDaily = null
  let currDaily = null
  let dailyDelta = null
  let dailyPctChange = null

  if (hasDailyRate) {
    prevDaily = Math.round((prevUnits / prevDays) * 100) / 100
    currDaily = Math.round((currUnits / currDays) * 100) / 100
    dailyDelta = Math.round((currDaily - prevDaily) * 100) / 100
    if (prevDaily > 0) {
      dailyPctChange = Math.round(((currDaily - prevDaily) / prevDaily) * 1000) / 10
    } else if (prevDaily === 0 && currDaily === 0) {
      dailyPctChange = 0
    }
  }

  // 3. Bill amount comparison
  const prevAmount = p.amountPayable
  const currAmount = c.amountPayable
  const amountDelta = Math.round((currAmount - prevAmount) * 100) / 100

  let amountPctChange = null
  if (prevAmount > 0) {
    amountPctChange = Math.round(((currAmount - prevAmount) / prevAmount) * 1000) / 10
  } else if (prevAmount === 0 && currAmount === 0) {
    amountPctChange = 0
  }

  // 4. Effective cost per unit (₹/kWh)
  const prevEffectiveRate = prevUnits > 0 ? Math.round((prevAmount / prevUnits) * 100) / 100 : null
  const currEffectiveRate = currUnits > 0 ? Math.round((currAmount / currUnits) * 100) / 100 : null

  // 5. Generate deterministic textual explanation
  const summary = generateComparisonSummary({
    prevUnits,
    currUnits,
    consumptionDelta,
    consumptionPctChange,
    prevDays,
    currDays,
    hasDailyRate,
    prevDaily,
    currDaily,
    dailyDelta,
    dailyPctChange,
    prevAmount,
    currAmount,
    amountDelta,
    amountPctChange,
    prevEffectiveRate,
    currEffectiveRate,
  })

  return {
    canCompare: true,
    errors: [],
    warnings: allWarnings,
    consumerCheck,
    prevValidation,
    currValidation,
    metrics: {
      prevUnits,
      currUnits,
      consumptionDelta,
      consumptionPctChange,
      prevDays,
      currDays,
      hasDailyRate,
      prevDaily,
      currDaily,
      dailyDelta,
      dailyPctChange,
      prevAmount,
      currAmount,
      amountDelta,
      amountPctChange,
      prevEffectiveRate,
      currEffectiveRate,
    },
    summary,
  }
}

/**
 * Constructs the standardized assistant bill context object from slot states.
 * Supports:
 * - null when both slots are empty
 * - ocr_processing: true when local Tesseract OCR is in-flight on either bill
 * - is_complete: false with missing_fields when bills are present but values incomplete
 * - is_complete: true with full metrics when both bills have valid units and amount
 */
export function buildAssistantBillContext(billSlots, isConsumerApproved = true) {
  if (!billSlots) return null
  const prevSlot = billSlots.prev || createInitialSlotState()
  const currSlot = billSlots.curr || createInitialSlotState()

  const hasAnyPrev =
    Object.values(prevSlot.fields || {}).some((v) => v !== '' && v != null) ||
    Boolean(prevSlot.file) ||
    prevSlot.source !== 'empty'
  const hasAnyCurr =
    Object.values(currSlot.fields || {}).some((v) => v !== '' && v != null) ||
    Boolean(currSlot.file) ||
    currSlot.source !== 'empty'

  if (!hasAnyPrev && !hasAnyCurr && prevSlot.source === 'empty' && currSlot.source === 'empty') {
    return null
  }

  const isOcrProcessing = prevSlot.ocrStage === 'processing' || currSlot.ocrStage === 'processing'
  const comparison = calculateBillComparison(prevSlot.fields || {}, currSlot.fields || {})

  if (comparison.canCompare && comparison.metrics) {
    const m = comparison.metrics
    return {
      is_complete: true,
      has_bills: true,
      ocr_processing: false,
      missing_fields: [],
      prev_units: m.prevUnits,
      curr_units: m.currUnits,
      delta_units: m.consumptionDelta,
      pct_change_units: m.consumptionPctChange,
      prev_days: m.prevDays,
      curr_days: m.currDays,
      prev_daily: m.prevDaily,
      curr_daily: m.currDaily,
      delta_daily: m.dailyDelta,
      prev_amount: m.prevAmount,
      curr_amount: m.currAmount,
      delta_amount: m.amountDelta,
      pct_change_amount: m.amountPctChange,
      prev_effective_rate: m.prevEffectiveRate,
      curr_effective_rate: m.currEffectiveRate,
      prev_period: prevSlot.fields?.billingPeriod || null,
      curr_period: currSlot.fields?.billingPeriod || null,
      consumer_matched: Boolean(isConsumerApproved),
    }
  }

  // Bills are present, but required comparison fields are incomplete or invalid
  const missing = []
  const prevUnits = cleanNumber(prevSlot.fields?.unitsConsumed)
  const prevAmt = cleanNumber(prevSlot.fields?.amountPayable)
  const currUnits = cleanNumber(currSlot.fields?.unitsConsumed)
  const currAmt = cleanNumber(currSlot.fields?.amountPayable)

  if (prevUnits === null) {
    missing.push('Previous Bill: Units consumed (kWh)')
  } else if (prevUnits < 0) {
    missing.push('Previous Bill: Units consumed cannot be negative')
  }

  if (prevAmt === null) {
    missing.push('Previous Bill: Amount payable (₹)')
  } else if (prevAmt < 0) {
    missing.push('Previous Bill: Amount payable cannot be negative')
  }

  if (currUnits === null) {
    missing.push('Current Bill: Units consumed (kWh)')
  } else if (currUnits < 0) {
    missing.push('Current Bill: Units consumed cannot be negative')
  }

  if (currAmt === null) {
    missing.push('Current Bill: Amount payable (₹)')
  } else if (currAmt < 0) {
    missing.push('Current Bill: Amount payable cannot be negative')
  }

  return {
    is_complete: false,
    has_bills: true,
    ocr_processing: isOcrProcessing,
    missing_fields: isOcrProcessing ? [] : missing,
    prev_units: prevUnits,
    curr_units: currUnits,
    prev_amount: prevAmt,
    curr_amount: currAmt,
    prev_period: prevSlot.fields?.billingPeriod || null,
    curr_period: currSlot.fields?.billingPeriod || null,
    consumer_matched: Boolean(isConsumerApproved),
  }
}

