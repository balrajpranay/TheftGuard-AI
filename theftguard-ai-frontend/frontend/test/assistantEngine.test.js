import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateClientRuleResponse,
  chatWithAssistant,
  DEFAULT_SUGGESTIONS,
  CONTEXT_SUGGESTIONS_BILL_LOADED,
} from '../src/lib/assistantEngine.js'
import { sanitizeAssistantRequest } from '../src/lib/assistantApi.js'

describe('Assistant Engine — Privacy & Input Sanitization', () => {
  it('bounds message text to 1500 chars and trims whitespace', () => {
    const longMsg = '   ' + 'X'.repeat(2000) + '   '
    const res = sanitizeAssistantRequest({ message: longMsg })
    assert.equal(res.message.length, 1500)
    assert.ok(!res.message.startsWith(' '))
  })

  it('bounds history to the last 20 messages and strips sensitive fields', () => {
    const history = []
    for (let i = 0; i < 30; i++) {
      history.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        internal_auth_token: 'secret',
        customer_ssn: '12345',
      })
    }
    const res = sanitizeAssistantRequest({ message: 'Hello', history })
    assert.equal(res.history.length, 20)
    assert.equal(res.history[0].content, 'Message 10')
    assert.equal(res.history[19].content, 'Message 29')
    assert.equal(res.history[0].internal_auth_token, undefined)
    assert.equal(res.history[0].customer_ssn, undefined)
  })

  it('sanitizes bill context and ignores consumer identification text', () => {
    const res = sanitizeAssistantRequest({
      message: 'Explain my bill',
      bill_context: {
        prev_units: '220',
        curr_units: '245',
        delta_units: 25,
        consumer_number: 'CONFIDENTIAL_USCNO_123',
        password: 'my-bank-password',
      },
    })
    assert.equal(res.bill_context.prev_units, 220)
    assert.equal(res.bill_context.curr_units, 245)
    assert.equal(res.bill_context.consumer_number, undefined)
    assert.equal(res.bill_context.password, undefined)
  })
})

describe('Assistant Engine — Core Intent Quality & Regression Verification', () => {
  // Test 1: "What does kWh mean?"
  it('accurately defines kWh, basic electricity concepts, and power vs energy', () => {
    const res = generateClientRuleResponse('What does kWh mean?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Kilowatt-hour'))
    assert.ok(res.reply.includes('1 Unit'))
    assert.ok(res.reply.includes('1,000 watts'))
    assert.ok(res.reply.includes('Kilowatt'))
    assert.ok(res.suggestions.length > 0)
  })

  // Test 2: "Could you explain me this webpage?"
  it('explains the actual TheftGuard AI webpage and its navigation structure', () => {
    const res = generateClientRuleResponse('Could you explain me this webpage?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('TheftGuard AI'))
    assert.ok(res.reply.includes('/app/bill-comparison'))
    assert.ok(res.reply.includes('/app/bill-upload'))
    assert.ok(res.reply.includes('/app/screening'))
    assert.ok(res.reply.includes('/app/investigations'))
    assert.ok(res.reply.includes('Load Telangana sample bills (Demo)'))
  })

  // Test 3A: "Why is my electricity bill so high this month?" (WITHOUT active bill)
  it('explains top household bill drivers and offers navigation when no bill is loaded', () => {
    const res = generateClientRuleResponse('Why is my electricity bill so high this month?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Air Conditioning'))
    assert.ok(res.reply.includes('Tariff Slab Escalation'))
    assert.ok(res.reply.includes('Meter Reading Punch Errors'))
    assert.ok(res.reply.includes('/app/bill-comparison'))
    assert.ok(res.reply.includes('Load Telangana sample bills (Demo)'))
  })

  // Test 3B: "Why is my electricity bill so high this month?" (WITH active sample bill)
  it('grounds bill explanation in exact active metrics for the Telangana sample bills', () => {
    const sampleContext = {
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      pct_change_units: 11.4,
      prev_days: 30,
      curr_days: 31,
      prev_daily: 7.33,
      curr_daily: 7.9,
      delta_daily: 0.57,
      prev_amount: 1480,
      curr_amount: 1725,
      delta_amount: 245,
      pct_change_amount: 16.6,
      prev_period: 'June 2026',
      curr_period: 'July 2026',
    }
    const res = generateClientRuleResponse('Why is my electricity bill so high this month?', sampleContext)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('220'))
    assert.ok(res.reply.includes('245'))
    assert.ok(res.reply.includes('+25'))
    assert.ok(res.reply.includes('11.4%'))
    assert.ok(res.reply.includes('7.33'))
    assert.ok(res.reply.includes('7.9'))
    assert.ok(res.reply.includes('1,480') || res.reply.includes('1480'))
    assert.ok(res.reply.includes('1,725') || res.reply.includes('1725'))
    assert.ok(res.reply.includes('Tariff Slab Impact'))
  })

  // Test 4A: "What should I do next?" (WITHOUT active bill)
  it('provides helpful onboarding next steps when no bill is loaded', () => {
    const res = generateClientRuleResponse('What should I do next?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Load Your Electricity Bills'))
    assert.ok(res.reply.includes('/app/bill-comparison'))
    assert.ok(res.reply.includes('Review Verified Metrics'))
  })

  // Test 4B: "What should I do next?" (WITH active bill)
  it('provides tailored action plan when bills are loaded', () => {
    const billContext = { prev_units: 200, curr_units: 280, curr_days: 30 }
    const res = generateClientRuleResponse('What should I do next?', billContext)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Verify Your Physical Meter Reading'))
    assert.ok(res.reply.includes('Review Your Appliance Profile'))
    assert.ok(res.reply.includes('Switch-Off Test'))
    assert.ok(res.reply.includes('1912'))
  })

  // Test 5: "Hi there"
  it('greets warmly, outlines capabilities, and offers contextual suggestions', () => {
    const res = generateClientRuleResponse('Hi there')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('TheftGuard AI Bill Assistant'))
    assert.ok(res.reply.includes('/app/bill-comparison'))
    assert.ok(res.suggestions.length > 0)
  })

  // Test 6: "I use my AC for 8 hours every day. How much electricity could it consume?"
  it('dynamically computes AC energy from 8 hours and shows assumptions and estimates', () => {
    const res = generateClientRuleResponse('I use my AC for 8 hours every day. How much electricity could it consume?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('8 hours/day') || res.reply.includes('8.0 hours/day'))
    assert.ok(res.reply.includes('1.5-Ton 3-Star Inverter AC'))
    assert.ok(res.reply.includes('0.95 kWh'))
    assert.ok(res.reply.includes('7.6 kWh'))
    assert.ok(res.reply.includes('228 kWh'))
    assert.ok(res.reply.includes('24°C'))
    assert.ok(res.reply.toLowerCase().includes('estimate'))
  })

  // Test 7: Follow-up context across turns
  it('recognizes follow-up context when user changes hours after discussing AC', () => {
    const history = [
      { role: 'user', content: 'How much power does an AC consume in 8 hours?' },
      { role: 'assistant', content: 'An AC running 8 hours consumes ~7.6 units/day (~228 kWh/month).' },
    ]
    const res = generateClientRuleResponse('And if I run it for 4 hours instead?', null, null, history)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('4 hours/day') || res.reply.includes('4.0 hours/day'))
    assert.ok(res.reply.includes('3.8 kWh'))
    assert.ok(res.reply.includes('114 kWh'))
  })

  // Test 8: Follow-up with word numbers (e.g. "four hours instead")
  it('handles follow-up queries with word numbers like "What if I use it for four hours instead?"', () => {
    const history = [
      { role: 'user', content: 'How much electricity does an AC consume in 8 hours?' },
      { role: 'assistant', content: 'An AC running 8.0 hours/day consumes ~7.6 kWh per day (~228.0 kWh per month).' },
    ]
    const res = generateClientRuleResponse('What if I use it for four hours instead?', null, null, history)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('4.0 hours/day') || res.reply.includes('4 hours/day'))
    assert.ok(res.reply.includes('3.8 kWh'))
    assert.ok(res.reply.includes('114.0 kWh') || res.reply.includes('114 kWh'))
    assert.ok(res.reply.includes('saving') || res.reply.includes('cuts'))
  })

  // Test 9: "Explain the comparison." WITH active bill data
  it('handles "Explain the comparison." with active sample bill data and grounded metrics', () => {
    const sampleContext = {
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      pct_change_units: 11.4,
      prev_days: 30,
      curr_days: 31,
      prev_daily: 7.33,
      curr_daily: 7.9,
      delta_daily: 0.57,
      prev_amount: 1480,
      curr_amount: 1725,
      delta_amount: 245,
      pct_change_amount: 16.6,
      prev_period: 'June 2026',
      curr_period: 'July 2026',
    }
    const res = generateClientRuleResponse('Explain the comparison.', sampleContext)
    assert.equal(res.provider, 'local_rule_engine')
    // Units
    assert.ok(res.reply.includes('220'))
    assert.ok(res.reply.includes('245'))
    assert.ok(res.reply.includes('+25'))
    assert.ok(res.reply.includes('11.4%'))
    // Cycle duration & daily burn rate
    assert.ok(res.reply.includes('30 days'))
    assert.ok(res.reply.includes('31 days'))
    assert.ok(res.reply.includes('7.33'))
    assert.ok(res.reply.includes('7.9'))
    assert.ok(res.reply.includes('7.8%'))
    // Amount & tariff slab
    assert.ok(res.reply.includes('1,480') || res.reply.includes('1480'))
    assert.ok(res.reply.includes('1,725') || res.reply.includes('1725'))
    assert.ok(res.reply.includes('16.6%'))
    assert.ok(res.reply.includes('Tariff Slab Impact') || res.reply.includes('telescopic tariffs'))
    // Effective cost per unit
    assert.ok(res.reply.includes('Effective Cost per Unit'))
    assert.ok(res.reply.includes('6.73'))
    assert.ok(res.reply.includes('7.04'))
    assert.ok(res.reply.includes('+0.31') || res.reply.includes('0.31'))
  })

  // Test 10: "Explain the comparison." WITHOUT active bill data
  it('handles "Explain the comparison." without active bills by explaining missing info and offering navigation', () => {
    const res = generateClientRuleResponse('Explain the comparison.', null)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes("I don't have an active bill comparison loaded yet to explain"))
    assert.ok(res.reply.includes('Bill Comparison (/app/bill-comparison)'))
    assert.ok(res.reply.includes('Load Telangana sample bills (Demo)'))
    assert.ok(res.reply.includes('Common Factors Behind Household Bill Changes'))
  })

  // Test 11: Alternate comparison phrasing
  it('handles alternate comparison queries like "What changed between my bills?" and "Explain these results."', () => {
    const sampleContext = {
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      pct_change_units: 11.4,
      prev_days: 30,
      curr_days: 31,
      prev_daily: 7.33,
      curr_daily: 7.9,
      prev_amount: 1480,
      curr_amount: 1725,
    }
    const res1 = generateClientRuleResponse('What changed between my bills?', sampleContext)
    assert.equal(res1.provider, 'local_rule_engine')
    assert.ok(res1.reply.includes('220'))
    assert.ok(res1.reply.includes('245'))

    const res2 = generateClientRuleResponse('Explain these results.', sampleContext)
    assert.equal(res2.provider, 'local_rule_engine')
    assert.ok(res2.reply.includes('220'))
    assert.ok(res2.reply.includes('245'))

    const res3 = generateClientRuleResponse('What caused this increase?', sampleContext)
    assert.equal(res3.provider, 'local_rule_engine')
    assert.ok(res3.reply.includes('220'))
    assert.ok(res3.reply.includes('245'))
  })

  // Test 12: Questionnaire context incorporation without duplicate questioning
  it('seamlessly synthesizes customer questionnaire answers into comparison explanation without re-prompting', () => {
    const sampleContext = {
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      prev_days: 30,
      curr_days: 31,
      prev_amount: 1480,
      curr_amount: 1725,
    }
    const answers = {
      has_ac: 'yes',
      ac_count: 1,
      ac_hours: 6,
      ac_increased: 'summer',
    }
    const res = generateClientRuleResponse('Explain the comparison.', sampleContext, answers)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Air Conditioning'))
    assert.ok(res.reply.includes('6 hrs/day') || res.reply.includes('6.0 hrs/day') || res.reply.includes('6'))
    assert.ok(res.reply.includes('176.7 kWh') || res.reply.includes('171') || res.reply.includes('176'))
    assert.ok(res.reply.toLowerCase().includes('estimate'))
    // Confirms it does not ask if user uses an AC
    assert.ok(!res.reply.includes('Do you use an air conditioner?'))
  })

  // Test 13: Multi-question queries
  it('handles multi-question queries like "What does kWh mean and why did my bill increase?"', () => {
    const sampleContext = {
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      prev_days: 30,
      curr_days: 31,
      prev_amount: 1480,
      curr_amount: 1725,
    }
    const res = generateClientRuleResponse('What does kWh mean and why did my bill increase?', sampleContext)
    assert.equal(res.provider, 'local_rule_engine')
    // Both sections present
    assert.ok(res.reply.includes('What kWh (Kilowatt-Hour) Means'))
    assert.ok(res.reply.includes('Breakdown of Your Bill Comparison'))
    assert.ok(res.reply.includes('1,000 watts'))
    assert.ok(res.reply.includes('220'))
    assert.ok(res.reply.includes('245'))
  })

  // Test 14: Unknown or unsupported question
  it('responds to unknown questions with clarification instead of generic fallback', () => {
    const res = generateClientRuleResponse('What is the weather on Mars?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('I specialize in household electricity billing'))
    assert.ok(res.reply.includes('Bill Analysis'))
    assert.ok(res.reply.includes('Appliance Estimates'))
    assert.ok(res.reply.includes('Meter Verification'))
  })

  // Test 15: Theft and tampering safety reassurance
  it('responds safely, neutrally, and reassuringly to theft inquiries', () => {
    const res = generateClientRuleResponse('Could this sudden bill increase mean electricity theft or tampering?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('routine household factors'))
    assert.ok(res.reply.includes('1912'))
    assert.ok(res.reply.toLowerCase().includes('does **not** indicate electricity theft'))
    assert.ok(
      res.disclaimers.some((d) =>
        d.toLowerCase().includes('does not establish electricity theft or meter tampering')
      )
    )
  })

  it('supports forceOffline in chatWithAssistant to guarantee deterministic execution', async () => {
    const res = await chatWithAssistant({
      message: 'What are energy saving tips?',
      forceOffline: true,
    })
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('High-Impact Ways to Reduce Your'))
  })

  // Test 16: Two-step conversational AC sequence (8h -> 4h) with 50% reduction and tariff savings
  it('handles the exact sequence: 8h daily AC followed by "What if I use it for 4 hours instead?" with 50% reduction', () => {
    // Step 1: 8 hours standalone without bill comparison
    const step1Msg = 'I use my AC for 8 hours daily. How much electricity could it consume?'
    const res1 = generateClientRuleResponse(step1Msg, null)
    assert.equal(res1.provider, 'local_rule_engine')
    // Assumptions
    assert.ok(res1.reply.includes('1.5-Ton 3-Star Inverter AC'))
    assert.ok(res1.reply.includes('8.0 hours/day') || res1.reply.includes('8 hours/day'))
    assert.ok(res1.reply.includes('0.95 kWh per hour'))
    // Calculations
    assert.ok(res1.reply.includes('7.6 kWh') || res1.reply.includes('7.6 units'))
    assert.ok(res1.reply.includes('228.0 kWh') || res1.reply.includes('228 kWh'))
    assert.ok(res1.reply.includes('₹1,482') || res1.reply.includes('1,482') || res1.reply.includes('₹1,710') || res1.reply.includes('1,710'))
    // Real-world variations
    assert.ok(res1.reply.includes('Real-World Variations') || res1.reply.includes('Actual usage depends'))
    assert.ok(res1.reply.includes('thermostat setpoint'))
    assert.ok(res1.reply.includes('weather conditions'))
    assert.ok(res1.reply.includes('compressor duty cycling'))

    // Step 2: "What if I use it for 4 hours instead?" using conversation history
    const history = [
      { role: 'user', content: step1Msg },
      { role: 'assistant', content: res1.reply },
    ]
    const step2Msg = 'What if I use it for 4 hours instead?'
    const res2 = generateClientRuleResponse(step2Msg, null, null, history)
    assert.equal(res2.provider, 'local_rule_engine')
    // 4 hours calculations
    assert.ok(res2.reply.includes('4.0 hours/day') || res2.reply.includes('4 hours/day'))
    assert.ok(res2.reply.includes('3.8 kWh') || res2.reply.includes('3.8 units'))
    assert.ok(res2.reply.includes('114.0 kWh') || res2.reply.includes('114 kWh'))
    // Reduction: ~114 kWh/month or 50%
    assert.ok(res2.reply.includes('114.0 kWh') || res2.reply.includes('114 kWh'))
    assert.ok(res2.reply.includes('50%'))
    // Rupee savings under the same tariff assumptions (~₹741 to ₹855)
    assert.ok(res2.reply.includes('741') && res2.reply.includes('855'))
    assert.ok(res2.reply.includes('illustrative tariff assumptions') || res2.reply.includes('6.50 to ₹7.50'))
  })

  // Test 17: "Why did the amount increase more than the units?"
  it('answers "Why did the amount increase more than the units?" with grounded tariff slab analysis', () => {
    const sampleContext = {
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      pct_change_units: 11.4,
      prev_days: 30,
      curr_days: 31,
      prev_daily: 7.33,
      curr_daily: 7.9,
      delta_daily: 0.57,
      prev_amount: 1480,
      curr_amount: 1725,
      delta_amount: 245,
      pct_change_amount: 16.6,
      prev_effective_rate: 6.73,
      curr_effective_rate: 7.04,
    }
    const res = generateClientRuleResponse('Why did the amount increase more than the units?', sampleContext)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('16.6%'))
    assert.ok(res.reply.includes('7.8%') || res.reply.includes('11.4%'))
    assert.ok(res.reply.includes('Tariff Slab Impact') || res.reply.includes('telescopic tariffs'))
    assert.ok(res.reply.includes('6.73'))
    assert.ok(res.reply.includes('7.04'))
    assert.ok(res.reply.includes('do NOT indicate electricity theft'))
  })

  // Test 18: "What does this mean?" with active bill context
  it('explains active comparison when user asks "What does this mean?"', () => {
    const sampleContext = {
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      pct_change_units: 11.4,
      prev_days: 30,
      curr_days: 31,
      prev_daily: 7.33,
      curr_daily: 7.9,
      prev_amount: 1480,
      curr_amount: 1725,
    }
    const res = generateClientRuleResponse('What does this mean?', sampleContext)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('220'))
    assert.ok(res.reply.includes('245'))
    assert.ok(res.reply.includes('Cycle Length Normalization'))
  })

  // Test 19: "Explain my current results." with active bill context
  it('explains active comparison when user asks "Explain my current results."', () => {
    const sampleContext = {
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      prev_days: 30,
      curr_days: 31,
      prev_amount: 1480,
      curr_amount: 1725,
    }
    const res = generateClientRuleResponse('Explain my current results.', sampleContext)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('220'))
    assert.ok(res.reply.includes('245'))
    assert.ok(res.reply.includes('Effective Cost per Unit'))
  })

  // Test 20: Incomplete bill comparison handling
  it('explains specific missing fields when bills are partially entered instead of generic fallback', () => {
    const incompleteContext = {
      is_complete: false,
      has_bills: true,
      missing_fields: ['Current Bill: Units consumed (kWh)', 'Current Bill: Amount payable (₹)'],
      prev_units: 220,
      curr_units: null,
      prev_amount: 1480,
      curr_amount: null,
      prev_period: 'June 2026',
      curr_period: 'July 2026',
    }
    const res = generateClientRuleResponse('Explain the comparison.', incompleteContext)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('some required fields are incomplete or missing'))
    assert.ok(res.reply.includes('Current Bill: Units consumed (kWh)'))
    assert.ok(res.reply.includes('Current Bill: Amount payable (₹)'))
    assert.ok(res.reply.includes('220 kWh'))
    assert.ok(res.reply.includes('1480'))
    assert.ok(!res.reply.includes("I don't have an active bill comparison loaded yet"))
  })

  it('correctly handles OCR bill with amount 3447.50 when units are missing, then explains once completed', () => {
    // Stage 1: OCR extracted current amount 3447.50, but units and previous bill are incomplete
    const partialOcrContext = {
      is_complete: false,
      has_bills: true,
      missing_fields: [
        'Previous Bill: Units consumed (kWh)',
        'Previous Bill: Amount payable (₹)',
        'Current Bill: Units consumed (kWh)',
      ],
      prev_units: null,
      curr_units: null,
      prev_amount: null,
      curr_amount: 3447.5,
      prev_period: 'June 2026',
      curr_period: 'July 2026',
    }
    const resIncomplete = generateClientRuleResponse('Explain the comparison.', partialOcrContext)
    assert.equal(resIncomplete.provider, 'local_rule_engine')
    assert.ok(resIncomplete.reply.includes('some required fields are incomplete or missing'))
    assert.ok(resIncomplete.reply.includes('Previous Bill: Units consumed (kWh)'))
    assert.ok(resIncomplete.reply.includes('Current Bill: Units consumed (kWh)'))
    assert.ok(resIncomplete.reply.includes('3447.5') || resIncomplete.reply.includes('3,447.5'))

    // Stage 2: User completes missing fields
    const completedContext = {
      is_complete: true,
      has_bills: true,
      missing_fields: [],
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      pct_change_units: 11.4,
      prev_days: 30,
      curr_days: 31,
      prev_daily: 7.33,
      curr_daily: 7.9,
      delta_daily: 0.57,
      prev_amount: 2850,
      curr_amount: 3447.5,
      delta_amount: 597.5,
      pct_change_amount: 21.0,
      prev_period: 'June 2026',
      curr_period: 'July 2026',
      consumer_matched: true,
    }
    const resComplete = generateClientRuleResponse('Explain the comparison.', completedContext)
    assert.equal(resComplete.provider, 'local_rule_engine')
    assert.ok(resComplete.reply.includes('Here is the verified breakdown of your active bill comparison'))
    assert.ok(resComplete.reply.includes('220 kWh'))
    assert.ok(resComplete.reply.includes('245 kWh'))
    assert.ok(resComplete.reply.includes('+25 kWh'))
    assert.ok(resComplete.reply.includes('3,448') || resComplete.reply.includes('3448') || resComplete.reply.includes('3447.5'))
  })

  // Test 21: Single-message combined AC reduction query
  it('handles single-message comparative AC query "I use my AC for 8 hours daily. What if I use it for 4 hours instead?"', () => {
    const msg = 'I use my AC for 8 hours daily. What if I use it for 4 hours instead?'
    const res = generateClientRuleResponse(msg, null)
    assert.equal(res.provider, 'local_rule_engine')
    // 4 hours calculated
    assert.ok(res.reply.includes('4.0 hours/day') || res.reply.includes('4 hours/day'))
    assert.ok(res.reply.includes('3.8 kWh'))
    assert.ok(res.reply.includes('114.0 kWh') || res.reply.includes('114 kWh'))
    // Reduction from 8h
    assert.ok(res.reply.includes('Reducing daily AC runtime from 8 hours to 4 hours') || res.reply.includes('Reducing daily AC runtime from 8.0 hours to 4.0 hours') || res.reply.includes('previous 8h scenario'))
    assert.ok(res.reply.includes('114.0 kWh') || res.reply.includes('114 kWh'))
    assert.ok(res.reply.includes('50%'))
    assert.ok(res.reply.includes('741') && res.reply.includes('855'))
    // Estimate caveats
    assert.ok(res.reply.includes('engineering estimates'))
    assert.ok(res.reply.includes('star rating'))
    assert.ok(res.reply.includes('ambient temperature'))
    assert.ok(res.reply.includes('thermostat setpoint'))
  })

  // Test 22: Cleared comparison context
  it('reports no active bills when comparison context is cleared to null', () => {
    const res = generateClientRuleResponse('Explain the comparison.', null)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes("I don't have an active bill comparison loaded yet"))
  })

  // Test 23: OCR in-flight recognition state
  it('acknowledges in-progress OCR scanning and does not falsely claim bills are missing', () => {
    const ocrContext = {
      ocr_processing: true,
      is_complete: false,
      has_bills: true,
      missing_fields: [],
    }

    // A: Explain comparison while scanning
    const compRes = generateClientRuleResponse('Explain the comparison.', ocrContext)
    assert.equal(compRes.provider, 'local_rule_engine')
    assert.ok(compRes.reply.includes('currently being scanned'))
    assert.ok(compRes.reply.includes('optical character recognition'))
    assert.ok(!compRes.reply.includes("I don't have an active bill comparison loaded yet"))

    // B: Greeting while scanning
    const greetRes = generateClientRuleResponse('Hi there', ocrContext)
    assert.equal(greetRes.provider, 'local_rule_engine')
    assert.ok(greetRes.reply.includes('currently being scanned with OCR'))

    // C: What should I do next while scanning
    const nextRes = generateClientRuleResponse('What should I do next?', ocrContext)
    assert.equal(nextRes.provider, 'local_rule_engine')
    assert.ok(nextRes.reply.includes('currently being scanned with on-device OCR'))
    assert.ok(nextRes.reply.includes('Wait for OCR Scan'))
  })

  // Test 24: Incomplete bills context with precise missing fields
  it('lists exact missing fields when bill comparison is incomplete', () => {
    const incompleteContext = {
      is_complete: false,
      has_bills: true,
      missing_fields: [
        'Previous Bill: Units consumed (kWh)',
        'Previous Bill: Amount payable (₹)',
        'Current Bill: Units consumed (kWh)',
      ],
      prev_units: null,
      curr_units: null,
      curr_amount: 3447.5,
      curr_period: 'July 2026',
    }

    const res = generateClientRuleResponse('Explain the comparison.', incompleteContext)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Previous Bill: Units consumed (kWh)'))
    assert.ok(res.reply.includes('Previous Bill: Amount payable (₹)'))
    assert.ok(res.reply.includes('Current Bill: Units consumed (kWh)'))
    assert.ok(res.reply.includes('₹3447.5') || res.reply.includes('3447.5'))
    assert.ok(res.reply.includes('Bill Comparison'))
  })

  // Test 25: Seamless transition from OCR scanning to complete comparison
  it('seamlessly transitions from OCR scanning to complete verified comparison once fields populate', () => {
    const scanningContext = {
      ocr_processing: true,
      is_complete: false,
      has_bills: true,
    }
    const r1 = generateClientRuleResponse('Explain the comparison.', scanningContext)
    assert.ok(r1.reply.includes('currently being scanned'))

    const completeContext = {
      is_complete: true,
      has_bills: true,
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      prev_amount: 1480,
      curr_amount: 1725,
      delta_amount: 245,
      prev_days: 30,
      curr_days: 31,
      prev_daily: 7.33,
      curr_daily: 7.9,
    }
    const r2 = generateClientRuleResponse('Explain the comparison.', completeContext)
    assert.ok(r2.reply.includes('220 kWh'))
    assert.ok(r2.reply.includes('245 kWh'))
    assert.ok(r2.reply.includes('+25 kWh'))
    assert.ok(r2.reply.includes('₹1,480') || r2.reply.includes('1480'))
    assert.ok(r2.reply.includes('₹1,725') || r2.reply.includes('1725'))
  })
})

describe('Assistant Engine — Safe Markdown Formatting & Escape Handling', () => {
  it('cleans accidental literal backslash markdown escapes', async () => {
    const { cleanMarkdownEscapes } = await import('../src/lib/formatAssistantMessage.js')
    const escaped = 'Here is \\*\\*bold text\\*\\* and \\*italic\\* and \\`code\\`'
    const cleaned = cleanMarkdownEscapes(escaped)
    assert.equal(cleaned, 'Here is **bold text** and *italic* and `code`')
  })

  it('tokenizes inline markdown (bold, italic, code, safe links) correctly', async () => {
    const { tokenizeInlineContent } = await import('../src/lib/formatAssistantMessage.js')
    const input = 'Use [Bill Comparison](/app/bill-comparison) for **220 units** and `0.95 kWh`.'
    const tokens = tokenizeInlineContent(input)
    assert.ok(tokens.some((t) => t.type === 'link' && t.label === 'Bill Comparison' && t.url === '/app/bill-comparison' && t.isInternal))
    assert.ok(tokens.some((t) => t.type === 'bold' && t.value === '220 units'))
    assert.ok(tokens.some((t) => t.type === 'code' && t.value === '0.95 kWh'))
  })

  it('blocks unsafe URL protocols like javascript: in markdown links', async () => {
    const { tokenizeInlineContent } = await import('../src/lib/formatAssistantMessage.js')
    const input = 'Click [Dangerous](javascript:alert(1)) link'
    const tokens = tokenizeInlineContent(input)
    // javascript: link is sanitized to plain text
    assert.ok(!tokens.some((t) => t.type === 'link'))
    assert.ok(tokens.some((t) => t.type === 'text' && t.value === 'Dangerous'))
  })

  it('parses message blocks including dividers, headings, bullets, and numbered items', async () => {
    const { parseMessageBlocks } = await import('../src/lib/formatAssistantMessage.js')
    const raw =
      '### 1. Section Title\n' +
      '---\n' +
      '• First bullet point with **bold**.\n' +
      '  - Indented sub-bullet.\n' +
      '1. Step one.\n' +
      '2. Step two.\n\n' +
      'Normal paragraph.'
    const blocks = parseMessageBlocks(raw)
    assert.equal(blocks[0].type, 'heading')
    assert.equal(blocks[0].level, 3)
    assert.equal(blocks[1].type, 'divider')
    assert.equal(blocks[2].type, 'bullet')
    assert.equal(blocks[2].indent, 0)
    assert.equal(blocks[3].type, 'bullet')
    assert.ok(blocks[3].indent > 0)
    assert.equal(blocks[4].type, 'numbered')
    assert.equal(blocks[4].number, '1')
    assert.equal(blocks[5].type, 'numbered')
    assert.equal(blocks[5].number, '2')
  })
})
