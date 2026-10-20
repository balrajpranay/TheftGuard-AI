import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  APPLIANCE_SPECS,
  INITIAL_QUESTIONNAIRE_ANSWERS,
  QUESTIONNAIRE_STEPS,
  calculateApplianceEstimates,
  synthesizeAnalysis,
  getQuestionnaireProgress,
} from '../src/lib/householdQuestionnaire.js'

describe('Household Questionnaire — Schema & Progress', () => {
  it('contains expected progressive questionnaire categories and skip options', () => {
    assert.ok(QUESTIONNAIRE_STEPS.length >= 7)
    const stepIds = QUESTIONNAIRE_STEPS.map((s) => s.id)
    assert.ok(stepIds.includes('occupants'))
    assert.ok(stepIds.includes('has_ac'))
    assert.ok(stepIds.includes('has_geyser'))
    assert.ok(stepIds.includes('has_refrigerator'))
    assert.ok(stepIds.includes('has_pump'))
    assert.ok(stepIds.includes('lifestyle_change'))
    assert.ok(stepIds.includes('meter_confidence'))

    // Verify every single-choice question has a skip or not sure option
    for (const step of QUESTIONNAIRE_STEPS) {
      if (step.options) {
        const hasSkip = step.options.some((o) => o.value === 'skip' || o.value === 'none')
        assert.ok(hasSkip, `Step ${step.id} should include a skip or none option`)
      }
    }
  })

  it('correctly reports questionnaire completion progress', () => {
    assert.equal(getQuestionnaireProgress(INITIAL_QUESTIONNAIRE_ANSWERS).answered, 0)
    assert.equal(getQuestionnaireProgress(INITIAL_QUESTIONNAIRE_ANSWERS).percent, 0)

    const partialAnswers = {
      ...INITIAL_QUESTIONNAIRE_ANSWERS,
      occupants: '3-4',
      has_ac: 'yes',
      has_geyser: 'no',
    }
    const prog = getQuestionnaireProgress(partialAnswers)
    assert.equal(prog.answered, 3)
    assert.ok(prog.percent > 40 && prog.percent < 50)
  })
})

describe('Household Questionnaire — Appliance Energy Calculations', () => {
  it('calculates standard AC energy based on BEE 3-star rating and daily hours', () => {
    // 1 AC, 8 hours/day for 30 days at 0.95 kWh/hr
    const answers = {
      has_ac: 'yes',
      ac_count: 1,
      ac_hours: 8,
      has_geyser: 'no',
      has_refrigerator: 'none',
      has_pump: 'none',
    }
    const res = calculateApplianceEstimates(answers, 30)
    assert.equal(res.estimates.length, 1)
    const acEst = res.estimates[0]
    // 1 * 8 * 0.95 * 30 = 228 kWh
    assert.equal(acEst.estimatedMonthlyKwh, 228.0)
    assert.equal(acEst.dailyHours, 8)
    assert.equal(acEst.wattageWatts, 1200)
    assert.equal(res.totalEstimatedKwh, 228.0)
  })

  it('calculates 2kW geyser energy consumption', () => {
    // 60 minutes/day for 30 days = 1 hour/day * 2.0 kWh/hr * 30 days = 60 kWh
    const answers = {
      has_ac: 'no',
      has_geyser: 'yes',
      geyser_minutes: 60,
      has_refrigerator: 'none',
      has_pump: 'none',
    }
    const res = calculateApplianceEstimates(answers, 30)
    assert.equal(res.estimates.length, 1)
    assert.equal(res.estimates[0].estimatedMonthlyKwh, 60.0)
  })

  it('calculates frost-free refrigerator continuous consumption', () => {
    const answers = {
      has_ac: 'no',
      has_geyser: 'no',
      has_refrigerator: 'double_door',
      has_pump: 'none',
    }
    const res = calculateApplianceEstimates(answers, 30)
    assert.equal(res.estimates.length, 1)
    assert.equal(res.estimates[0].estimatedMonthlyKwh, 30.0) // 1.0 kWh/day * 30
  })

  it('calculates 1 HP water pump running 1 hour daily', () => {
    const answers = {
      has_ac: 'no',
      has_geyser: 'no',
      has_refrigerator: 'none',
      has_pump: 'one_hp',
      pump_hours: 1,
    }
    const res = calculateApplianceEstimates(answers, 30)
    assert.equal(res.estimates.length, 1)
    // 1 * 0.75 * 30 = 22.5 kWh
    assert.equal(res.estimates[0].estimatedMonthlyKwh, 22.5)
  })

  it('safely handles missing or zero answers with zero crash', () => {
    const res = calculateApplianceEstimates({}, 30)
    assert.ok(res.totalEstimatedKwh >= 0)
    assert.equal(res.billingDays, 30)
  })
})

describe('Household Questionnaire — Bill Synthesis & Neutral Safety Disclaimers', () => {
  it('identifies stable consumption within routine variance (±15 kWh)', () => {
    const billSummary = {
      previousUnits: 200,
      currentUnits: 205,
      billingDays: 30,
      amountDifference: 45,
    }
    const analysis = synthesizeAnalysis(billSummary, {})
    assert.equal(analysis.outcome, 'no_unusual_change')
    assert.ok(analysis.headline.includes('Stable'))
    assert.ok(analysis.plausibleCauses[0].includes('routine monthly variance'))
  })

  it('explains consumption increase driven by air conditioning', () => {
    const billSummary = {
      previousUnits: 150,
      currentUnits: 320,
      billingDays: 30,
      amountDifference: 1200,
    }
    const answers = {
      has_ac: 'yes',
      ac_count: 1,
      ac_hours: 8,
      ac_increased: 'summer',
    }
    const analysis = synthesizeAnalysis(billSummary, answers)
    assert.equal(analysis.outcome, 'change_explained_by_appliances')
    assert.ok(analysis.headline.includes('Cooling Load'))
    assert.ok(analysis.plausibleCauses.some((c) => c.includes('air conditioning setup')))
  })

  it('flags meter reading discrepancy when user indicates bill reading exceeds dial', () => {
    const billSummary = {
      previousUnits: 100,
      currentUnits: 300,
      billingDays: 30,
      amountDifference: 1500,
    }
    const answers = {
      meter_confidence: 'reads_higher',
    }
    const analysis = synthesizeAnalysis(billSummary, answers)
    assert.equal(analysis.outcome, 'discrepancy_needs_verification')
    assert.ok(analysis.headline.includes('Possible Billing Reading Discrepancy'))
  })

  it('strictly includes neutral safety disclaimers and never accuses user of theft', () => {
    const billSummary = {
      previousUnits: 100,
      currentUnits: 500, // Large 400 kWh jump
      billingDays: 30,
      amountDifference: 3500,
    }
    const analysis = synthesizeAnalysis(billSummary, {})
    assert.ok(analysis.disclaimers.length >= 2)
    assert.ok(
      analysis.disclaimers.some((d) =>
        d.toLowerCase().includes('does not establish electricity theft or meter tampering')
      )
    )
    // Plausible causes must not allege theft
    for (const cause of analysis.plausibleCauses) {
      assert.ok(!cause.toLowerCase().includes('you are stealing'))
      assert.ok(!cause.toLowerCase().includes('illegal theft'))
    }
  })
})
