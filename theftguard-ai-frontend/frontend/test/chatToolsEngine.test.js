import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CHAT_TOOLS, executeChatTool } from '../src/lib/chatToolsEngine.js'

describe('Dedicated Chat Workspace — Grounded Tools Engine', () => {
  it('exposes all 5 verified application tools with metadata', () => {
    assert.equal(CHAT_TOOLS.length, 5)
    const toolIds = CHAT_TOOLS.map((t) => t.id)
    assert.ok(toolIds.includes('compare_bills'))
    assert.ok(toolIds.includes('analyze_household'))
    assert.ok(toolIds.includes('estimate_appliance'))
    assert.ok(toolIds.includes('explain_bill_changes'))
    assert.ok(toolIds.includes('review_missing_ocr'))
  })

  // Tool 1: Compare Bills
  describe('Tool: compare_bills', () => {
    it('returns grounded side-by-side comparison when context is complete', async () => {
      const billContext = {
        is_complete: true,
        has_bills: true,
        prev_units: 220,
        curr_units: 245,
        delta_units: 25,
        prev_amount: 1480,
        curr_amount: 1725,
        prev_days: 30,
        curr_days: 31,
        prev_daily: 7.33,
        curr_daily: 7.9,
      }

      const res = await executeChatTool({ toolId: 'compare_bills', billContext })
      assert.equal(res.status, 'ok')
      assert.ok(res.summary.includes('+25 kWh'))
      assert.ok(res.message.includes('220 kWh'))
      assert.ok(res.message.includes('245 kWh'))
      assert.ok(res.message.includes('+25 kWh'))
    })

    it('returns scanning notification when OCR is processing', async () => {
      const billContext = { ocr_processing: true, is_complete: false, has_bills: true }
      const res = await executeChatTool({ toolId: 'compare_bills', billContext })
      assert.equal(res.status, 'warn')
      assert.ok(res.summary.includes('OCR scan in progress'))
      assert.ok(res.message.includes('currently being scanned'))
    })

    it('returns incomplete fields notice when bills have missing units', async () => {
      const billContext = {
        is_complete: false,
        has_bills: true,
        missing_fields: ['Current Bill: Units consumed (kWh)'],
        prev_units: 220,
        curr_units: null,
      }
      const res = await executeChatTool({ toolId: 'compare_bills', billContext })
      assert.equal(res.status, 'warn')
      assert.ok(res.message.includes('Current Bill: Units consumed (kWh)'))
    })

    it('returns guidance when no bills are loaded', async () => {
      const res = await executeChatTool({ toolId: 'compare_bills', billContext: null })
      assert.equal(res.status, 'warn')
      assert.ok(res.message.includes("I don't have an active bill comparison loaded yet"))
    })
  })

  // Tool 2: Analyze Household Usage
  describe('Tool: analyze_household', () => {
    it('synthesizes appliance profile against bill difference', async () => {
      const q = {
        has_ac: 'yes',
        ac_count: 1,
        ac_hours: 8,
        has_geyser: 'yes',
        geyser_hours: 1,
        has_pump: 'none',
        has_refrigerator: 'single_door',
      }
      const billContext = {
        is_complete: true,
        prev_units: 220,
        curr_units: 245,
        delta_units: 25,
        curr_days: 30,
      }

      const res = await executeChatTool({
        toolId: 'analyze_household',
        billContext,
        questionnaireAnswers: q,
      })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('1.5 Ton AC'))
      assert.ok(res.message.includes('Water Heater'))
      assert.ok(res.message.includes('Refrigerator'))
      assert.ok(res.message.includes('25 kWh'))
      assert.ok(res.structuredAnalysis)
    })

    it('returns prompt guidance when questionnaire is uncompleted', async () => {
      const res = await executeChatTool({
        toolId: 'analyze_household',
        billContext: null,
        questionnaireAnswers: null,
      })
      assert.equal(res.status, 'warn')
      assert.ok(res.message.includes('Household Usage Profile Not Completed Yet'))
      assert.ok(res.message.includes('/app/bill-comparison'))
    })
  })

  // Tool 3: Estimate Appliance Load
  describe('Tool: estimate_appliance', () => {
    it('estimates AC power for specified hours and count', async () => {
      const res = await executeChatTool({
        toolId: 'estimate_appliance',
        params: { appliance: 'ac', hours: 6, count: 2 },
      })
      assert.equal(res.status, 'ok')
      assert.ok(res.summary.includes('2 AC(s) for 6h/day'))
      assert.ok(res.message.includes('0.95 kWh per hour'))
      // 2 * 6 * 0.95 = 11.4 kWh/day -> ~342 kWh/month
      assert.ok(res.message.includes('11.4 kWh') || res.message.includes('11.4 units'))
      assert.ok(res.message.includes('342 kWh') || res.message.includes('342 units'))
    })

    it('estimates Geyser heating power for specified hours', async () => {
      const res = await executeChatTool({
        toolId: 'estimate_appliance',
        params: { appliance: 'geyser', hours: 1 },
      })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('2,000-watt (2 kW)'))
      assert.ok(res.message.includes('2.0 units (kWh) for every 1 hour'))
      assert.ok(res.message.includes('60 units/month'))
    })

    it('estimates Water Pump power for specified hours', async () => {
      const res = await executeChatTool({
        toolId: 'estimate_appliance',
        params: { appliance: 'pump', hours: 2 },
      })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('0.75 units (kWh) per running hour'))
      assert.ok(res.message.includes('1.5 units/day'))
      assert.ok(res.message.includes('45 units/month'))
    })
  })

  // Tool 4: Explain Bill Changes
  describe('Tool: explain_bill_changes', () => {
    it('breaks down cycle length, tariff slab, and effective rates when complete', async () => {
      const billContext = {
        is_complete: true,
        prev_units: 220,
        curr_units: 245,
        delta_units: 25,
        pct_change_units: 11.4,
        prev_amount: 1480,
        curr_amount: 1725,
        delta_amount: 245,
        pct_change_amount: 16.6,
        prev_days: 30,
        curr_days: 31,
        prev_daily: 7.33,
        curr_daily: 7.9,
        prev_effective_rate: 6.73,
        curr_effective_rate: 7.04,
      }

      const res = await executeChatTool({ toolId: 'explain_bill_changes', billContext })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('+25 kWh') && res.message.includes('11.4%'))
      assert.ok(res.message.includes('30 days') && res.message.includes('31 days'))
      assert.ok(res.message.includes('16.6%'))
      assert.ok(res.message.includes('6.73') && res.message.includes('7.04'))
    })

    it('returns warning with key drivers when context is missing', async () => {
      const res = await executeChatTool({ toolId: 'explain_bill_changes', billContext: null })
      assert.equal(res.status, 'warn')
      assert.ok(res.message.includes('Telescopic Tariff Slabs'))
      assert.ok(res.message.includes('Billing Cycle Days Difference'))
    })
  })

  // Tool 5: Review Missing OCR Fields
  describe('Tool: review_missing_ocr', () => {
    it('audits slots and flags unread fields when units or amounts are missing', async () => {
      const billSlots = {
        prev: {
          file: { name: 'bill_june.jpg' },
          source: 'ocr',
          fields: {
            consumerNumber: '100458921',
            unitsConsumed: '220',
            amountPayable: '1480',
          },
        },
        curr: {
          file: { name: 'bill_july.jpg' },
          source: 'ocr',
          fields: {
            consumerNumber: '100458921',
            unitsConsumed: '', // missing!
            amountPayable: '1725',
          },
        },
      }

      const res = await executeChatTool({ toolId: 'review_missing_ocr', billSlots })
      assert.equal(res.status, 'warn')
      assert.ok(res.summary.includes('Missing fields detected'))
      assert.ok(res.message.includes('Current Month Bill'))
      assert.ok(res.message.includes('⚠️ MISSING — enter manually'))
    })

    it('confirms audit verdict ready when all comparison fields are populated', async () => {
      const billSlots = {
        prev: {
          file: { name: 'bill_june.jpg' },
          source: 'demo',
          fields: {
            consumerNumber: '100458921',
            unitsConsumed: '220',
            amountPayable: '1480',
          },
        },
        curr: {
          file: { name: 'bill_july.jpg' },
          source: 'demo',
          fields: {
            consumerNumber: '100458921',
            unitsConsumed: '245',
            amountPayable: '1725',
          },
        },
      }

      const res = await executeChatTool({ toolId: 'review_missing_ocr', billSlots })
      assert.equal(res.status, 'ok')
      assert.ok(res.summary.includes('All comparison fields extracted'))
      assert.ok(res.message.includes('Both bills have all required comparison fields populated'))
    })
  })

  it('safely handles unknown tool ID without throwing', async () => {
    const res = await executeChatTool({ toolId: 'unknown_magic_tool' })
    assert.equal(res.status, 'error')
    assert.ok(res.message.includes('not recognized'))
  })
})
