import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NAV } from '../src/lib/navConfig.js'
import {
  generateClientRuleResponse,
  chatWithAssistant,
} from '../src/lib/assistantEngine.js'
import {
  createChatSession,
  getChatSession,
  clearAllChatSessions,
  exportChatSession,
  prepareSessionForRegenerate,
  loadChatSessions,
  STORAGE_KEY,
} from '../src/lib/chatSessionStorage.js'

describe('Phase 3.1: Navigation Order & Prominence', () => {
  it('places AI Chat at index 0 (first position) in the navigation bar', () => {
    assert.ok(Array.isArray(NAV))
    assert.equal(NAV[0].to, '/app/chat')
    assert.equal(NAV[0].label, 'AI Chat')
    assert.equal(NAV[0].isPrimary, true)
  })

  it('preserves all other essential routes in correct sequential order', () => {
    const routePaths = NAV.map((item) => item.to)
    assert.ok(routePaths.includes('/app/dashboard'))
    assert.ok(routePaths.includes('/app/bill-comparison'))
    assert.ok(routePaths.includes('/app/screening'))
    assert.ok(routePaths.includes('/app/results'))
    assert.ok(routePaths.includes('/app/comparison'))
    assert.ok(routePaths.includes('/app/reports'))
    assert.ok(routePaths.includes('/app/model'))
    // AI Chat must precede Overview
    const chatIndex = routePaths.indexOf('/app/chat')
    const overviewIndex = routePaths.indexOf('/app/dashboard')
    assert.ok(chatIndex < overviewIndex, 'AI Chat should precede Overview (/app/dashboard)')
  })
})

describe('Phase 3.1: General Knowledge & Non-Electricity Question Handling', () => {
  it('directly answers "What is an LLM?" without dumping electricity tariff features', () => {
    const res = generateClientRuleResponse('What is an LLM?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.toLowerCase().includes('large language model'))
    assert.ok(res.reply.toLowerCase().includes('transformer') || res.reply.toLowerCase().includes('neural network') || res.reply.toLowerCase().includes('patterns'))
    // Should NOT be a bill comparison failure dump
    assert.ok(!res.reply.includes("I don't have an active bill comparison loaded yet"))
    assert.ok(!res.reply.includes("Bill Comparison features"))
  })

  it('directly answers "What is Python?" accurately', () => {
    const res = generateClientRuleResponse('What is Python?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.toLowerCase().includes('programming language'))
    assert.ok(res.reply.toLowerCase().includes('readability') || res.reply.toLowerCase().includes('data science') || res.reply.toLowerCase().includes('general-purpose'))
  })

  it('directly answers "What is machine learning?" accurately', () => {
    const res = generateClientRuleResponse('What is machine learning?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.toLowerCase().includes('machine learning') || res.reply.toLowerCase().includes('artificial intelligence'))
    assert.ok(res.reply.toLowerCase().includes('data') || res.reply.toLowerCase().includes('patterns'))
  })

  it('handles clarification requests like "I don\'t understand your previous answer"', () => {
    const res = generateClientRuleResponse("I don't understand your previous answer")
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.toLowerCase().includes('simple') || res.reply.toLowerCase().includes('plain-english') || res.reply.toLowerCase().includes('break down'))
  })
})

describe('Phase 3.1: Electricity Analysis Accuracy & Neutral Tariff Explanations', () => {
  it('explains tariffs conceptually without asserting universal fixed 100/200 slab boundaries as hard facts', () => {
    const res = generateClientRuleResponse('How do electricity tariffs work?')
    assert.equal(res.provider, 'local_rule_engine')
    // Mentions progressive / telescopic brackets
    assert.ok(res.reply.toLowerCase().includes('telescopic') || res.reply.toLowerCase().includes('slab') || res.reply.toLowerCase().includes('brackets'))
    // Mentions SERC / State regulatory variation
    assert.ok(res.reply.toLowerCase().includes('serc') || res.reply.toLowerCase().includes('state') || res.reply.toLowerCase().includes('discom'))
    // Mentions demand / fixed charges or fuel surcharges
    assert.ok(res.reply.toLowerCase().includes('fixed charge') || res.reply.toLowerCase().includes('demand charge') || res.reply.toLowerCase().includes('fuel') || res.reply.toLowerCase().includes('fsa'))
  })

  it('accurately estimates appliance power consumption for follow-up hours', () => {
    const res4h = generateClientRuleResponse('How much electricity does an AC consume for 4 hours?')
    const res8h = generateClientRuleResponse('How much electricity does an AC consume for 8 hours?')
    assert.equal(res4h.provider, 'local_rule_engine')
    assert.equal(res8h.provider, 'local_rule_engine')
    assert.ok(res4h.reply.includes('kWh') || res4h.reply.includes('units'))
    assert.ok(res8h.reply.includes('kWh') || res8h.reply.includes('units'))
  })
})

describe('Phase 3.1: Context Isolation Across Sessions', () => {
  beforeEach(() => {
    clearAllChatSessions()
  })

  it('guarantees new chat starts clean and does not inherit bill context from previous chat', () => {
    // Session 1 with attached bill
    const s1 = createChatSession({
      title: 'July Comparison',
      attachedBillContext: {
        is_complete: true,
        prev_units: 300,
        curr_units: 420,
        delta_units: 120,
      },
    })

    // Session 2 created clean
    const s2 = createChatSession({
      title: 'General Questions',
      attachedBillContext: null,
    })

    const loaded1 = getChatSession(s1.id)
    const loaded2 = getChatSession(s2.id)

    assert.equal(loaded1.attachedBillContext?.prev_units, 300)
    assert.equal(loaded2.attachedBillContext, null)
  })
})

describe('Phase 3.1: Chat Session Export & Privacy Redaction', () => {
  beforeEach(() => {
    clearAllChatSessions()
  })

  it('exports conversation to markdown with timestamp and role headers', () => {
    const session = createChatSession({
      title: 'Summer AC Consultation',
      initialMessages: [
        { role: 'user', content: 'Why did my bill increase?', timestamp: '10:00 AM' },
        { role: 'assistant', content: 'Your consumption increased by 25 kWh due to seasonal AC load.', timestamp: '10:01 AM' },
      ],
      attachedBillContext: {
        is_complete: true,
        prev_units: 200,
        curr_units: 225,
        delta_units: 25,
      },
    })

    const md = exportChatSession(session.id, 'markdown')
    assert.ok(md.includes('# TheftGuard AI — Summer AC Consultation'))
    assert.ok(md.includes('### User'))
    assert.ok(md.includes('Why did my bill increase?'))
    assert.ok(md.includes('### TheftGuard AI Assistant'))
    assert.ok(md.includes('Your consumption increased by 25 kWh'))
  })

  it('exports conversation to plain text format', () => {
    const session = createChatSession({
      title: 'Appliance Inquiry',
      initialMessages: [
        { role: 'user', content: 'What is a geyser consumption?', timestamp: '11:00 AM' },
        { role: 'assistant', content: 'A 2kW geyser consumes 2 units per hour.', timestamp: '11:01 AM' },
      ],
    })

    const txt = exportChatSession(session.id, 'text')
    assert.ok(txt.includes('THEFTGUARD AI CONVERSATION'))
    assert.ok(txt.includes('[USER]'))
    assert.ok(txt.includes('[ASSISTANT]'))
  })
})

describe('Phase 3.1: Error Recovery & LocalStorage Resilience', () => {
  beforeEach(() => {
    clearAllChatSessions()
  })

  it('recovers gracefully from corrupted JSON data in localStorage without throwing', () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, '{ invalid json garbage :::')
      const sessions = loadChatSessions()
      assert.deepEqual(sessions, [], 'Should recover and return empty array on corrupted JSON')
    }
  })
})

describe('Phase 3.1: Response Regeneration Support', () => {
  beforeEach(() => {
    clearAllChatSessions()
  })

  it('prepareSessionForRegenerate pops last assistant turn and returns the previous user prompt', () => {
    const session = createChatSession({
      title: 'Test Session',
      initialMessages: [
        { role: 'user', content: 'What is an inverter AC?' },
        { role: 'assistant', content: 'An inverter AC modulates compressor speed.' },
      ],
    })

    const result = prepareSessionForRegenerate(session.id)
    assert.ok(result)
    assert.equal(result.lastUserPrompt, 'What is an inverter AC?')
    assert.equal(result.session.messages.length, 1)
    assert.equal(result.session.messages[0].role, 'user')
  })
})

describe('Phase 3.2: 10 Benchmark Queries & Context Routing Verification', () => {
  it('Benchmark 1: "What is an LLM?" routes to LLM explanation without electricity features', () => {
    const res = generateClientRuleResponse('What is an LLM?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Large Language Model'))
    assert.ok(res.reply.includes('Transformer'))
    assert.ok(!res.reply.includes('Bill Comparison features'))
    assert.ok(!res.reply.includes('I don\'t have an active bill comparison'))
    assert.ok(res.suggestions.some((s) => s.includes('Python') || s.includes('machine learning')))
  })

  it('Benchmark 2: "What is an LLM? Explain it with a simple example." does NOT return AC calculation', () => {
    const history = [
      { role: 'user', content: 'How much electricity does a 1.5-ton inverter AC consume in 8 hours?' },
      { role: 'assistant', content: 'An AC running 8 hours consumes ~7.6 kWh/day.' },
    ]
    const res = generateClientRuleResponse('What is an LLM? Explain it with a simple example.', null, null, history)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Large Language Model'))
    assert.ok(res.reply.includes('Example') || res.reply.includes('example'))
    // Crucial bug prevention: must NEVER trigger AC calculation
    assert.ok(!res.reply.includes('Air Conditioner Power Consumption'))
    assert.ok(!res.reply.includes('1.5-Ton 3-Star Inverter AC'))
  })

  it('Benchmark 3: "What is the difference between AI, machine learning, and deep learning?" does NOT route to bill comparison', () => {
    const res = generateClientRuleResponse('What is the difference between AI, machine learning, and deep learning?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Artificial Intelligence (AI)'))
    assert.ok(res.reply.includes('Machine Learning (ML)'))
    assert.ok(res.reply.includes('Deep Learning (DL)'))
    // Crucial bug prevention: must NEVER treat "difference" as bill comparison
    assert.ok(!res.reply.includes('I don\'t have an active bill comparison loaded yet'))
    assert.ok(!res.reply.includes('Billed Consumption'))
  })

  it('Benchmark 4: "What is Python, and why is it used in AI?" does NOT return AC estimate', () => {
    const history = [
      { role: 'user', content: 'How much electricity does a 1.5-ton inverter AC consume in 8 hours?' },
      { role: 'assistant', content: 'An AC running 8 hours consumes ~7.6 kWh/day.' },
    ]
    const res = generateClientRuleResponse('What is Python, and why is it used in AI?', null, null, history)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Python'))
    assert.ok(res.reply.includes('programming language'))
    assert.ok(res.reply.includes('PyTorch') || res.reply.includes('scikit-learn'))
    assert.ok(!res.reply.includes('Air Conditioner Power Consumption'))
  })

  it('Benchmark 5: "Explain APIs like I am a beginner." returns waiter analogy explanation', () => {
    const res = generateClientRuleResponse('Explain APIs like I am a beginner.')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Application Programming Interface'))
    assert.ok(res.reply.includes('Waiter') || res.reply.includes('waiter'))
    assert.ok(res.reply.includes('Frontend') || res.reply.includes('Client'))
  })

  it('Benchmark 6: "What does kWh mean?" returns kWh definition and practical examples', () => {
    const res = generateClientRuleResponse('What does kWh mean?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('Kilowatt-hour'))
    assert.ok(res.reply.includes('1 Unit'))
    assert.ok(res.reply.includes('1,000 watts'))
  })

  it('Benchmark 7: "How much electricity does a 1.5-ton inverter AC consume in 8 hours?" returns ~7.6 kWh/day and ~228 kWh/month', () => {
    const res = generateClientRuleResponse('How much electricity does a 1.5-ton inverter AC consume in 8 hours?')
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('1.5-Ton 3-Star Inverter AC'))
    assert.ok(res.reply.includes('8 hours/day') || res.reply.includes('8.0 hours/day'))
    assert.ok(res.reply.includes('7.6 kWh') || res.reply.includes('7.6 units'))
    assert.ok(res.reply.includes('228') && res.reply.includes('month'))
  })

  it('Benchmark 8: "What if I run it for only 4 hours?" compares 4h vs 8h with ~50% savings', () => {
    const history = [
      { role: 'user', content: 'How much electricity does a 1.5-ton inverter AC consume in 8 hours?' },
      { role: 'assistant', content: 'A 1.5-Ton 3-Star Inverter AC running for 8 hours uses ~7.6 kWh/day (~228 kWh/month).' },
    ]
    const res = generateClientRuleResponse('What if I run it for only 4 hours?', null, null, history)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('4 hours/day') || res.reply.includes('4.0 hours/day'))
    assert.ok(res.reply.includes('3.8 kWh'))
    assert.ok(res.reply.includes('114'))
    assert.ok(res.reply.includes('Comparison with your previous 8') || res.reply.includes('saving'))
  })

  it('Benchmark 9: "Explain my bill comparison." with attached bill context returns verified comparison', () => {
    const billContext = {
      is_complete: true,
      has_bills: true,
      prev_units: 220,
      curr_units: 245,
      delta_units: 25,
      pct_change_units: 11.4,
      prev_days: 30,
      curr_days: 31,
      prev_amount: 1480,
      curr_amount: 1725,
      delta_amount: 245,
      pct_change_amount: 16.6,
      prev_period: 'June 2026',
      curr_period: 'July 2026',
      consumer_matched: true,
    }
    const res = generateClientRuleResponse('Explain my bill comparison.', billContext)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('220 kWh'))
    assert.ok(res.reply.includes('245 kWh'))
    assert.ok(res.reply.includes('11.4%'))
    assert.ok(res.reply.includes('₹1,480') || res.reply.includes('1480'))
    assert.ok(res.reply.includes('₹1,725') || res.reply.includes('1725'))
    assert.ok(res.reply.includes('Cycle Length Normalization'))
    assert.ok(res.reply.includes('Effective Cost per Unit'))
  })

  it('Benchmark 10: "Explain my bill comparison" with NO bill context returns missing bill explanation', () => {
    const res = generateClientRuleResponse('Explain my bill comparison', null)
    assert.equal(res.provider, 'local_rule_engine')
    assert.ok(res.reply.includes('I don\'t have an active bill comparison loaded yet'))
    assert.ok(res.reply.includes('Bill Comparison (/app/bill-comparison)'))
    assert.ok(res.reply.includes('Load Telangana sample bills (Demo)'))
  })
})

