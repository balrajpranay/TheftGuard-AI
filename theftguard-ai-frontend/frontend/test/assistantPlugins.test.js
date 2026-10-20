import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ASSISTANT_PLUGINS,
  getPluginById,
  executePluginAction,
  executeBillComparisonPlugin,
  executeBillUploadOcrPlugin,
  executeTheftScreeningPlugin,
  executeUsageAnalystPlugin,
  executeReportsHistoryPlugin,
  executeBillCalculatorPlugin,
  executeElectricityHelpPlugin,
  executeGeneralAssistantPlugin,
} from '../src/lib/assistantPlugins.js'
import { generateClientRuleResponse } from '../src/lib/assistantEngine.js'

describe('Assistant Plugins & Grounded Tools System', () => {
  describe('Plugin Registry & Schema Verification', () => {
    it('registers exactly 8 domain plugins', () => {
      assert.equal(ASSISTANT_PLUGINS.length, 8)
      const ids = ASSISTANT_PLUGINS.map((p) => p.id)
      assert.ok(ids.includes('general_assistant'))
      assert.ok(ids.includes('bill_comparison'))
      assert.ok(ids.includes('bill_upload_ocr'))
      assert.ok(ids.includes('theft_screening'))
      assert.ok(ids.includes('usage_analyst'))
      assert.ok(ids.includes('reports_history'))
      assert.ok(ids.includes('bill_calculator'))
      assert.ok(ids.includes('electricity_help'))
    })

    it('identifies general_assistant as the default baseline plugin', () => {
      const general = ASSISTANT_PLUGINS.find((p) => p.id === 'general_assistant')
      assert.ok(general)
      assert.equal(general.isDefault, true)

      const specialized = ASSISTANT_PLUGINS.filter((p) => p.id !== 'general_assistant')
      specialized.forEach((p) => assert.equal(p.isDefault, false))
    })

    it('defines complete metadata for every plugin (icon, badge, description, placeholder)', () => {
      ASSISTANT_PLUGINS.forEach((p) => {
        assert.ok(p.id && typeof p.id === 'string')
        assert.ok(p.name && typeof p.name === 'string')
        assert.ok(p.icon && typeof p.icon === 'string')
        assert.ok(p.badge && typeof p.badge === 'string')
        assert.ok(p.description && typeof p.description === 'string')
        assert.ok(p.placeholder && typeof p.placeholder === 'string')
      })
    })

    it('getPluginById retrieves correct metadata or null for unknown', () => {
      const calc = getPluginById('bill_calculator')
      assert.ok(calc)
      assert.equal(calc.name, 'Bill Calculator')
      assert.equal(calc.badge, 'Tariff Slabs')

      assert.equal(getPluginById('non_existent_plugin'), null)
    })
  })

  // 1. Bill Comparison Plugin
  describe('Plugin: bill_comparison', () => {
    it('executes verified comparison when bills are loaded', async () => {
      const billContext = {
        is_complete: true,
        has_bills: true,
        prev_units: 142,
        curr_units: 288,
        delta_units: 146,
        prev_amount: 890,
        curr_amount: 2150,
        prev_days: 30,
        curr_days: 30,
      }

      const res = await executeBillComparisonPlugin({ billContext })
      assert.equal(res.status, 'ok')
      assert.ok(res.summary.includes('+146 kWh'))
      assert.ok(res.message.includes('142 kWh'))
      assert.ok(res.message.includes('288 kWh'))
    })

    it('reports missing data and provides direct link when no bills loaded', async () => {
      const res = await executeBillComparisonPlugin({ billContext: null })
      assert.equal(res.status, 'warn')
      assert.ok(res.message.includes('/app/bill-comparison'))
    })
  })

  // 2. Bill Upload & OCR Plugin
  describe('Plugin: bill_upload_ocr', () => {
    it('audits slots, detects arithmetic match, and confirms readiness', async () => {
      const billSlots = {
        prev: {
          source: 'ocr',
          fields: {
            consumerNumber: '100458921',
            previousReading: '1000',
            currentReading: '1142',
            unitsConsumed: '142',
            amountPayable: '890',
          },
        },
        curr: {
          source: 'ocr',
          fields: {
            consumerNumber: '100458921',
            previousReading: '1142',
            currentReading: '1430',
            unitsConsumed: '288',
            amountPayable: '2150',
          },
        },
      }

      const res = await executeBillUploadOcrPlugin({ billSlots })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('Arithmetic Verified'))
      assert.ok(res.summary.includes('OCR extraction complete'))
    })

    it('detects reading discrepancy when meter reading difference does not match units', async () => {
      const billSlots = {
        prev: {
          source: 'ocr',
          fields: {
            consumerNumber: '100458921',
            previousReading: '1000',
            currentReading: '1142',
            unitsConsumed: '142',
            amountPayable: '890',
          },
        },
        curr: {
          source: 'ocr',
          fields: {
            consumerNumber: '100458921',
            previousReading: '1142',
            currentReading: '1500', // 358 diff
            unitsConsumed: '288', // Mismatch!
            amountPayable: '2150',
          },
        },
      }

      const res = await executeBillUploadOcrPlugin({ billSlots })
      assert.ok(res.message.includes('Reading Discrepancy'))
      assert.ok(res.message.includes('358 kWh'))
    })

    it('explains browser-side privacy and data minimization when empty', async () => {
      const res = await executeBillUploadOcrPlugin({ billSlots: null, billContext: null })
      assert.equal(res.status, 'warn')
      assert.ok(res.message.includes('never sent to external servers or logged'))
      assert.ok(res.message.includes('/app/bill-upload'))
    })
  })

  // 3. Electricity Theft Screening Plugin
  describe('Plugin: theft_screening', () => {
    it('strictly includes responsible AI phrasing and never proves theft', async () => {
      const customers = [
        { id: 'CUST-001', score: 0.85, review_category: 'review' },
        { id: 'CUST-002', score: 0.42, review_category: 'elevated' },
        { id: 'CUST-003', score: 0.12, review_category: 'normal' },
      ]

      const res = await executeTheftScreeningPlugin({ customers, uploaded: { fileName: 'test.csv' } })
      assert.equal(res.status, 'ok')
      assert.ok(res.summary.includes('1 review, 1 elevated'))
      assert.ok(res.message.includes('Not Proof of Theft'))
      assert.ok(res.message.includes('statistical screening indicator'))
      assert.ok(res.message.includes('Benign Explanations'))
      assert.ok(res.message.includes('5-point physical audit checklist'))
    })

    it('strictly isolates demo data and does not invent fake records for empty authenticated workspace', async () => {
      const res = await executeTheftScreeningPlugin({
        customers: [],
        uploaded: null,
        isAuthenticated: true,
        isDemoMode: false,
      })
      assert.equal(res.status, 'warn')
      assert.ok(res.summary.includes('No screening batch loaded'))
      assert.ok(res.message.includes('/app/screening'))
      assert.ok(!res.message.includes('DEMO_CUSTOMERS'))
    })
  })

  // 4. Usage Analyst Plugin
  describe('Plugin: usage_analyst', () => {
    it('itemizes appliance estimates and calculates explained variance against bill shift', async () => {
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
        prev_units: 142,
        curr_units: 288,
        delta_units: 146,
        curr_days: 30,
      }

      const res = await executeUsageAnalystPlugin({ billContext, questionnaireAnswers: q })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('BEE 3-Star Standards'))
      assert.ok(res.message.includes('Actual Bill Change'))
      assert.ok(res.message.includes('+146 kWh'))
      assert.ok(res.message.includes('Explained by Reported Appliances'))
    })

    it('provides prompt guidance and standard appliance benchmarks when profile is empty', async () => {
      const res = await executeUsageAnalystPlugin({ questionnaireAnswers: null })
      assert.equal(res.status, 'warn')
      assert.ok(res.message.includes('Household Profile Not Yet Completed'))
      assert.ok(res.message.includes('/app/bill-comparison'))
    })
  })

  // 5. Reports & History Plugin
  describe('Plugin: reports_history', () => {
    it('summarizes investigation ticket statuses and 5-point audit checklist', async () => {
      const investigations = [
        { id: '1', ticket_code: 'INV-20261020-001', customer_ref: 'CUST-101', status: 'New', priority: 'High', origin: 'Screening' },
        { id: '2', ticket_code: 'INV-20261020-002', customer_ref: 'CUST-102', status: 'In Progress', priority: 'Normal', origin: 'Comparison' },
      ]

      const res = await executeReportsHistoryPlugin({ investigations })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('INV-20261020-001'))
      assert.ok(res.message.includes('5-step checklist'))
      assert.ok(res.message.includes('New / Pending'))
      assert.ok(res.message.includes('In Progress'))
    })

    it('returns guidance when no investigations exist', async () => {
      const res = await executeReportsHistoryPlugin({ investigations: [] })
      assert.equal(res.status, 'warn')
      assert.ok(res.message.includes('5-Point Field Audit Checklist'))
      assert.ok(res.message.includes('/app/investigations'))
    })
  })

  // 6. Bill Calculator Plugin
  describe('Plugin: bill_calculator', () => {
    it('calculates telescopic tariff slabs, fixed charges, and effective rate for active bill', async () => {
      const billContext = {
        curr_units: 288,
        curr_amount: 2150,
      }

      const res = await executeBillCalculatorPlugin({ billContext })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('Slab 1 (0–100 units)'))
      assert.ok(res.message.includes('Slab 2 (101–200 units)'))
      assert.ok(res.message.includes('Slab 3 (201+ units)'))
      assert.ok(res.message.includes('Fixed Demand Charge'))
      assert.ok(res.message.includes('Electricity Duty (6%)'))
      assert.ok(res.message.includes('Fuel Surcharge (FSA'))
      assert.ok(res.message.includes('The "Slab Cliff" Effect'))
    })

    it('simulates reference tiers when no bill is active', async () => {
      const res = await executeBillCalculatorPlugin({ billContext: null })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('100 units (Lifeline)'))
      assert.ok(res.message.includes('200 units (Moderate)'))
      assert.ok(res.message.includes('300 units (High)'))
    })
  })

  // 7. Electricity Help & Guidance Plugin
  describe('Plugin: electricity_help', () => {
    it('provides switch-off creep test protocol and digital meter reading instructions', async () => {
      const res = await executeElectricityHelpPlugin()
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('The Switch-Off Creep Test'))
      assert.ok(res.message.includes('Imp/kWh'))
      assert.ok(res.message.includes('How to Read a Digital LCD Meter'))
      assert.ok(res.message.includes('Cumulative Energy (kWh)'))
      assert.ok(res.message.includes('Maximum Demand (MD / kW)'))
      assert.ok(res.message.includes('Detecting Reader Punch Errors'))
    })
  })

  // 8. General Assistant Plugin
  describe('Plugin: general_assistant', () => {
    it('summarizes all 8 plugins and active session status', async () => {
      const res = await executeGeneralAssistantPlugin({
        billContext: { prev_units: 100, curr_units: 150 },
        customers: [{ id: 'C1' }],
        investigations: [{ id: 'I1' }],
      })
      assert.equal(res.status, 'ok')
      assert.ok(res.message.includes('Bill Comparison'))
      assert.ok(res.message.includes('Bill Upload & OCR'))
      assert.ok(res.message.includes('Theft Screening'))
      assert.ok(res.message.includes('Usage Analyst'))
      assert.ok(res.message.includes('Reports & History'))
      assert.ok(res.message.includes('Bill Calculator'))
      assert.ok(res.message.includes('Electricity Help'))
      assert.ok(res.message.includes('+50 kWh shift'))
    })
  })

  // Universal executor
  describe('executePluginAction routing', () => {
    it('routes correctly to each plugin by ID', async () => {
      const resCalc = await executePluginAction({ pluginId: 'bill_calculator' })
      assert.equal(resCalc.status, 'ok')
      assert.ok(resCalc.message.includes('Telescopic Tariff Calculator'))

      const resHelp = await executePluginAction({ pluginId: 'electricity_help' })
      assert.equal(resHelp.status, 'ok')
      assert.ok(resHelp.message.includes('Switch-Off Creep Test'))
    })
  })

  // Plugin-informed Assistant Reasoning
  describe('Plugin-informed generateClientRuleResponse', () => {
    it('responds with telescopic slab guidance when bill_calculator plugin is active', () => {
      const res = generateClientRuleResponse(
        'How much will my electricity bill cost?',
        null,
        null,
        [],
        ['bill_calculator']
      )
      assert.ok(res.reply.includes('Telescopic Tariff Slab Calculation'))
      assert.ok(res.reply.includes('The Cliff Effect'))
    })

    it('responds with creep test when electricity_help plugin is active', () => {
      const res = generateClientRuleResponse(
        'How can I check if my meter is accurate?',
        null,
        null,
        [],
        ['electricity_help']
      )
      assert.ok(res.reply.includes('Switch-Off Creep Test Protocol'))
      assert.ok(res.reply.includes('Reading the Digital LCD'))
    })

    it('responds with responsible AI screening explanation when theft_screening plugin is active', () => {
      const res = generateClientRuleResponse(
        'What do the screening results show?',
        null,
        null,
        [],
        ['theft_screening']
      )
      assert.ok(res.reply.includes('Electricity Theft Screening & Model Score Triage'))
      assert.ok(res.reply.includes('NOT legal proof of electricity theft'))
    })

    it('responds with 5-point audit protocol when reports_history plugin is active', () => {
      const res = generateClientRuleResponse(
        'What is on the inspection checklist?',
        null,
        null,
        [],
        ['reports_history']
      )
      assert.ok(res.reply.includes('5-Point Field Verification Protocol'))
      assert.ok(res.reply.includes('Seal Integrity'))
    })
  })
})
