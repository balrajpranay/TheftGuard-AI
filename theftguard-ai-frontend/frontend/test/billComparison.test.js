import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanNumber,
  checkConsumerMatch,
  validateBillData,
  calculateBillComparison,
  buildAssistantBillContext,
  createInitialSlotState,
  DEMO_PREVIOUS_BILL,
  DEMO_CURRENT_BILL,
} from '../src/lib/billComparison.js'
import { inr, kwh, pct } from '../src/lib/format.js'

describe('Household Bill Comparison — Validation & Sanitization', () => {
  it('correctly cleans numbers with commas, spaces, and decimal places', () => {
    assert.equal(cleanNumber('1,725'), 1725)
    assert.equal(cleanNumber('14,280.50'), 14280.5)
    assert.equal(cleanNumber(' 245 '), 245)
    assert.equal(cleanNumber(300), 300)
    assert.equal(cleanNumber(''), null)
    assert.equal(cleanNumber(null), null)
    assert.equal(cleanNumber('abc'), null)
  })

  it('validates a complete, healthy bill payload', () => {
    const res = validateBillData(DEMO_CURRENT_BILL, 'Current bill')
    assert.equal(res.isValid, true)
    assert.equal(res.errors.length, 0)
    assert.equal(res.parsed.unitsConsumed, 245)
    assert.equal(res.parsed.amountPayable, 1725)
    assert.equal(res.parsed.billingDays, 31)
    assert.equal(res.parsed.consumerNumber, '100458921')
  })

  it('rejects missing or empty unitsConsumed and amountPayable', () => {
    const res = validateBillData({ unitsConsumed: '', amountPayable: '' }, 'Test bill')
    assert.equal(res.isValid, false)
    assert.ok(res.errors.some((e) => e.includes('Units consumed in kWh is required')))
    assert.ok(res.errors.some((e) => e.includes('Amount payable in ₹ is required')))
  })

  it('rejects negative consumption and negative bill amounts', () => {
    const res = validateBillData({ unitsConsumed: '-50', amountPayable: '-1200' }, 'Test bill')
    assert.equal(res.isValid, false)
    assert.ok(res.errors.some((e) => e.includes('Units consumed cannot be negative')))
    assert.ok(res.errors.some((e) => e.includes('Amount payable cannot be negative')))
  })

  it('rejects non-integer or zero/negative billing days', () => {
    const resZero = validateBillData({ unitsConsumed: '100', amountPayable: '500', billingDays: '0' }, 'Test')
    assert.equal(resZero.isValid, false)
    assert.ok(resZero.errors.some((e) => e.includes('positive whole number')))

    const resDec = validateBillData({ unitsConsumed: '100', amountPayable: '500', billingDays: '30.5' }, 'Test')
    assert.equal(resDec.isValid, false)
    assert.ok(resDec.errors.some((e) => e.includes('positive whole number')))
  })

  it('allows missing billing days with a clear warning', () => {
    const res = validateBillData({ unitsConsumed: '100', amountPayable: '500', billingDays: '' }, 'Test')
    assert.equal(res.isValid, true)
    assert.ok(res.warnings.some((w) => w.includes('Billing days is not specified')))
  })

  it('warns when present reading is lower than previous reading without erroring', () => {
    const res = validateBillData(
      {
        unitsConsumed: '100',
        amountPayable: '500',
        previousReading: '5000',
        currentReading: '4800',
      },
      'Test'
    )
    assert.equal(res.isValid, true)
    assert.ok(res.warnings.some((w) => w.includes('lower than previous reading')))
  })
})

describe('Household Bill Comparison — Consumer Identifier Validation', () => {
  it('detects matching consumer numbers even with formatting differences', () => {
    const match1 = checkConsumerMatch('100458921', '100458921')
    assert.equal(match1.match, true)
    assert.equal(match1.status, 'match')
    assert.equal(match1.warning, null)

    const match2 = checkConsumerMatch('100-458-921', '100458921')
    assert.equal(match2.match, true)
  })

  it('detects mismatched consumer numbers and issues a clear warning', () => {
    const mismatch = checkConsumerMatch('100458921', '998877665')
    assert.equal(mismatch.match, false)
    assert.equal(mismatch.status, 'mismatch')
    assert.equal(mismatch.isMismatch, true)
    assert.ok(mismatch.warning.includes('do not match'))
  })

  it('detects when one or both consumer numbers are missing', () => {
    const oneMiss = checkConsumerMatch('100458921', '')
    assert.equal(oneMiss.match, false)
    assert.equal(oneMiss.status, 'one_missing')
    assert.equal(oneMiss.isMissing, true)
    assert.ok(oneMiss.warning.includes('missing on the current bill'))

    const bothMiss = checkConsumerMatch('', '')
    assert.equal(bothMiss.match, false)
    assert.equal(bothMiss.status, 'both_missing')
    assert.equal(bothMiss.isMissing, true)
    assert.ok(bothMiss.warning.includes('missing on both bills'))
  })
})

describe('Household Bill Comparison — Consumption & Cost Calculations', () => {
  it('accurately calculates a typical consumption increase (Telangana sample bills)', () => {
    const res = calculateBillComparison(DEMO_PREVIOUS_BILL, DEMO_CURRENT_BILL)
    assert.equal(res.canCompare, true)
    assert.equal(res.errors.length, 0)
    assert.equal(res.consumerCheck.match, true)

    const m = res.metrics
    // Consumption: 220 -> 245
    assert.equal(m.prevUnits, 220)
    assert.equal(m.currUnits, 245)
    assert.equal(m.consumptionDelta, 25)
    assert.equal(m.consumptionPctChange, 11.4) // (25/220)*100 = 11.36 -> 11.4%

    // Days & daily rate: 220/30 = 7.33, 245/31 = 7.90
    assert.equal(m.prevDays, 30)
    assert.equal(m.currDays, 31)
    assert.equal(m.prevDaily, 7.33)
    assert.equal(m.currDaily, 7.90)
    assert.equal(m.dailyDelta, 0.57)
    assert.equal(m.dailyPctChange, 7.8) // (0.57/7.33)*100 = 7.77 -> 7.8%

    // Cost: ₹1,480 -> ₹1,725
    assert.equal(m.prevAmount, 1480)
    assert.equal(m.currAmount, 1725)
    assert.equal(m.amountDelta, 245)
    assert.equal(m.amountPctChange, 16.6) // (245/1480)*100 = 16.55 -> 16.6%

    // Summary statements generated
    assert.ok(res.summary.headline.includes('Rose by 25 kWh'))
    assert.ok(res.summary.statements.some((s) => s.includes('increased by 25 kWh (+11.4%)')))
    assert.ok(res.summary.statements.some((s) => s.includes('increased by ₹245 (+16.6%)')))
  })

  it('accurately calculates a consumption and cost decrease', () => {
    const prev = {
      consumerNumber: 'CUST-888',
      unitsConsumed: '300',
      amountPayable: '2400',
      billingDays: '30',
    }
    const curr = {
      consumerNumber: 'CUST-888',
      unitsConsumed: '210',
      amountPayable: '1500',
      billingDays: '30',
    }

    const res = calculateBillComparison(prev, curr)
    assert.equal(res.canCompare, true)

    const m = res.metrics
    assert.equal(m.consumptionDelta, -90)
    assert.equal(m.consumptionPctChange, -30.0)
    assert.equal(m.dailyDelta, -3.0)
    assert.equal(m.dailyPctChange, -30.0)
    assert.equal(m.amountDelta, -900)
    assert.equal(m.amountPctChange, -37.5)

    assert.ok(res.summary.headline.includes('Dropped by 90 kWh'))
  })

  it('normalizes consumption properly when billing cycles are of unequal length', () => {
    // 300 units in 30 days = 10 kWh/day
    // 300 units in 20 days = 15 kWh/day
    const prev = {
      consumerNumber: 'CUST-777',
      unitsConsumed: '300',
      amountPayable: '2000',
      billingDays: '30',
    }
    const curr = {
      consumerNumber: 'CUST-777',
      unitsConsumed: '300',
      amountPayable: '2000',
      billingDays: '20',
    }

    const res = calculateBillComparison(prev, curr)
    assert.equal(res.canCompare, true)

    const m = res.metrics
    assert.equal(m.consumptionDelta, 0)
    assert.equal(m.consumptionPctChange, 0)
    // Daily rate rose significantly because 300 units were used in only 20 days
    assert.equal(m.prevDaily, 10.0)
    assert.equal(m.currDaily, 15.0)
    assert.equal(m.dailyDelta, 5.0)
    assert.equal(m.dailyPctChange, 50.0)

    assert.ok(res.summary.statements.some((s) => s.includes('30 days vs 20 days')))
  })

  it('safely handles zero previous consumption without NaN or division by zero crashes', () => {
    const prevZero = {
      consumerNumber: 'CUST-101',
      unitsConsumed: '0',
      amountPayable: '120',
      billingDays: '30',
    }
    const currNonZero = {
      consumerNumber: 'CUST-101',
      unitsConsumed: '85',
      amountPayable: '480',
      billingDays: '30',
    }

    const res = calculateBillComparison(prevZero, currNonZero)
    assert.equal(res.canCompare, true)

    const m = res.metrics
    assert.equal(m.prevUnits, 0)
    assert.equal(m.currUnits, 85)
    assert.equal(m.consumptionDelta, 85)
    assert.equal(m.consumptionPctChange, null) // Safe null when base is 0
    assert.equal(m.dailyPctChange, null) // Safe null when base is 0
    assert.ok(Number.isFinite(m.amountPctChange)) // ₹120 to ₹480 is valid

    assert.ok(res.summary.statements.some((s) => s.includes('0 kWh baseline')))
  })

  it('safely handles zero previous and current consumption and amounts', () => {
    const prevZero = {
      consumerNumber: 'CUST-102',
      unitsConsumed: '0',
      amountPayable: '0',
      billingDays: '30',
    }
    const currZero = {
      consumerNumber: 'CUST-102',
      unitsConsumed: '0',
      amountPayable: '0',
      billingDays: '30',
    }

    const res = calculateBillComparison(prevZero, currZero)
    assert.equal(res.canCompare, true)

    const m = res.metrics
    assert.equal(m.consumptionDelta, 0)
    assert.equal(m.consumptionPctChange, 0)
    assert.equal(m.amountDelta, 0)
    assert.equal(m.amountPctChange, 0)
  })

  it('refuses comparison when required fields are missing or invalid', () => {
    const invalidPrev = { unitsConsumed: '', amountPayable: '500' }
    const validCurr = { unitsConsumed: '100', amountPayable: '600' }

    const res = calculateBillComparison(invalidPrev, validCurr)
    assert.equal(res.canCompare, false)
    assert.ok(res.errors.length > 0)
  })
})

describe('Household Bill Comparison — Indian Currency & Value Formatting', () => {
  it('formats Indian currency and percentages cleanly', () => {
    assert.match(inr(1725), /₹\s*1,725/)
    assert.match(inr(25000), /₹\s*25,000/)
    assert.equal(kwh(245), '245 kWh')
    assert.equal(pct(11.4, 1), '+11.4%')
    assert.equal(pct(-7.8, 1), '-7.8%')
    assert.equal(pct(0, 1), '0.0%')
  })
})

describe('Household Bill Comparison — OCR Field Synchronization & Slot Removal', () => {
  it('preserves manually entered fields when OCR returns empty strings for missed fields', () => {
    const existingSlotFields = {
      consumerNumber: '',
      discom: '',
      billingPeriod: '',
      billDate: '',
      billingDays: '',
      previousReading: '',
      currentReading: '',
      unitsConsumed: '220', // manually entered by user
      amountPayable: '',
    }

    // OCR extracted consumerNumber and amountPayable, but missed unitsConsumed
    const ocrExtractedFields = {
      consumerNumber: '100458921',
      discom: 'TSSPDCL (Telangana Southern Power)',
      billingPeriod: 'June 2026',
      billDate: '02-07-2026',
      billingDays: '30',
      previousReading: '',
      currentReading: '',
      unitsConsumed: '', // missed by OCR
      amountPayable: '3447.50',
    }

    // Merge only non-empty fields
    const merged = { ...existingSlotFields }
    for (const [k, v] of Object.entries(ocrExtractedFields)) {
      if (v !== '' && v != null) {
        merged[k] = v
      }
    }

    assert.equal(merged.consumerNumber, '100458921')
    assert.equal(merged.unitsConsumed, '220') // preserved!
    assert.equal(merged.amountPayable, '3447.50') // updated!
    assert.equal(merged.billingDays, '30')
  })

  it('correctly calculates comparison when missing OCR units are manually provided', () => {
    // Current bill where OCR extracted amount 3447.50, and user entered 245 units
    const currFields = {
      consumerNumber: '100458921',
      billingPeriod: 'July 2026',
      unitsConsumed: '245',
      amountPayable: '3447.50',
      billingDays: '30',
    }
    // Previous bill where user entered units 220 and amount 2850
    const prevFields = {
      consumerNumber: '100458921',
      billingPeriod: 'June 2026',
      unitsConsumed: '220',
      amountPayable: '2850.00',
      billingDays: '30',
    }

    const res = calculateBillComparison(prevFields, currFields)
    assert.equal(res.canCompare, true)
    assert.equal(res.metrics.consumptionDelta, 25)
    assert.equal(res.metrics.amountDelta, 597.5)
  })

  it('prevents stale comparison data when one bill slot is cleared', () => {
    const validPrev = {
      consumerNumber: '100458921',
      unitsConsumed: '220',
      amountPayable: '1480',
      billingDays: '30',
    }
    const emptyCurr = {
      consumerNumber: '',
      unitsConsumed: '',
      amountPayable: '',
      billingDays: '',
    }

    const res = calculateBillComparison(validPrev, emptyCurr)
    assert.equal(res.canCompare, false)
    assert.ok(res.errors.some((e) => e.includes('Current bill: Units consumed in kWh is required')))
    assert.ok(res.errors.some((e) => e.includes('Current bill: Amount payable in ₹ is required')))
  })
})

describe('Household Bill Comparison — buildAssistantBillContext Reliability', () => {
  it('returns null when both bill slots are empty initial states', () => {
    const slots = {
      prev: createInitialSlotState(),
      curr: createInitialSlotState(),
    }
    const ctx = buildAssistantBillContext(slots)
    assert.equal(ctx, null)
  })

  it('returns ocr_processing: true when either slot has OCR in progress', () => {
    const slots = {
      prev: {
        ...createInitialSlotState(),
        source: 'manual',
        ocrStage: 'processing',
      },
      curr: createInitialSlotState(),
    }
    const ctx = buildAssistantBillContext(slots)
    assert.ok(ctx)
    assert.equal(ctx.ocr_processing, true)
    assert.equal(ctx.is_complete, false)
    assert.equal(ctx.has_bills, true)
  })

  it('returns is_complete: false with exact missing fields when fields are incomplete', () => {
    const slots = {
      prev: {
        ...createInitialSlotState(),
        source: 'ocr',
        fields: {
          ...createInitialSlotState().fields,
          consumerNumber: '100458921',
          billingPeriod: 'June 2026',
          // unitsConsumed and amountPayable missing
        },
      },
      curr: {
        ...createInitialSlotState(),
        source: 'ocr',
        fields: {
          ...createInitialSlotState().fields,
          consumerNumber: '100458921',
          billingPeriod: 'July 2026',
          amountPayable: '3447.50',
          // unitsConsumed missing
        },
      },
    }
    const ctx = buildAssistantBillContext(slots)
    assert.ok(ctx)
    assert.equal(ctx.ocr_processing, false)
    assert.equal(ctx.is_complete, false)
    assert.equal(ctx.has_bills, true)
    assert.ok(ctx.missing_fields.includes('Previous Bill: Units consumed (kWh)'))
    assert.ok(ctx.missing_fields.includes('Previous Bill: Amount payable (₹)'))
    assert.ok(ctx.missing_fields.includes('Current Bill: Units consumed (kWh)'))
    assert.equal(ctx.curr_amount, 3447.5)
  })

  it('returns is_complete: true with full metrics when both slots are complete and valid', () => {
    const slots = {
      prev: {
        ...createInitialSlotState(),
        source: 'demo',
        fields: DEMO_PREVIOUS_BILL,
      },
      curr: {
        ...createInitialSlotState(),
        source: 'demo',
        fields: DEMO_CURRENT_BILL,
      },
    }
    const ctx = buildAssistantBillContext(slots, true)
    assert.ok(ctx)
    assert.equal(ctx.ocr_processing, false)
    assert.equal(ctx.is_complete, true)
    assert.equal(ctx.prev_units, 220)
    assert.equal(ctx.curr_units, 245)
    assert.equal(ctx.delta_units, 25)
    assert.equal(ctx.prev_amount, 1480)
    assert.equal(ctx.curr_amount, 1725)
    assert.equal(ctx.delta_amount, 245)
    assert.equal(ctx.prev_daily, 7.33)
    assert.equal(ctx.curr_daily, 7.9)
    assert.equal(ctx.prev_effective_rate, 6.73)
    assert.equal(ctx.curr_effective_rate, 7.04)
    assert.equal(ctx.consumer_matched, true)
  })

  it('immediately updates context when one slot is cleared', () => {
    const slots = {
      prev: {
        ...createInitialSlotState(),
        source: 'demo',
        fields: DEMO_PREVIOUS_BILL,
      },
      curr: {
        ...createInitialSlotState(),
        source: 'demo',
        fields: DEMO_CURRENT_BILL,
      },
    }
    const initialCtx = buildAssistantBillContext(slots, true)
    assert.equal(initialCtx.is_complete, true)

    // Remove curr slot
    const updatedSlots = {
      ...slots,
      curr: createInitialSlotState(),
    }
    const updatedCtx = buildAssistantBillContext(updatedSlots, true)
    assert.equal(updatedCtx.is_complete, false)
    assert.ok(updatedCtx.missing_fields.includes('Current Bill: Units consumed (kWh)'))
    assert.ok(updatedCtx.missing_fields.includes('Current Bill: Amount payable (₹)'))

    // Clear both
    const emptySlots = {
      prev: createInitialSlotState(),
      curr: createInitialSlotState(),
    }
    const emptyCtx = buildAssistantBillContext(emptySlots, true)
    assert.equal(emptyCtx, null)
  })
})
