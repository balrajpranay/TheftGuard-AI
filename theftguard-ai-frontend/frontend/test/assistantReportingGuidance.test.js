import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TELANGANA_DISCOMS,
  identifyDiscomByLocation,
  buildReportingOverview,
  buildRequiredInformationChecklist,
  buildComplaintLifecycleExplanation,
  buildDraftComplaint,
} from '../src/lib/electricityReportingGuidance.js'
import { chatWithAssistant, generateClientRuleResponse } from '../src/lib/assistantEngine.js'
import { executeElectricityHelpPlugin } from '../src/lib/assistantPlugins.js'

describe('Telangana Electricity Reporting Guidance — Official Grounding & Routing', () => {
  it('correctly identifies TGSPDCL for Southern Telangana districts', () => {
    const hyd = identifyDiscomByLocation('I live in Hyderabad near Banjara Hills')
    assert.ok(hyd)
    assert.equal(hyd.id, 'TGSPDCL')
    assert.equal(hyd.tollFree, '1912')
    assert.equal(hyd.portalUrl, 'https://tgspdcl.cgg.gov.in')
    assert.equal(hyd.headquarters, 'Mint Compound, Hyderabad')

    const rr = identifyDiscomByLocation('Ranga Reddy district')
    assert.ok(rr)
    assert.equal(rr.id, 'TGSPDCL')

    const medchal = identifyDiscomByLocation('Medchal-Malkajgiri')
    assert.ok(medchal)
    assert.equal(medchal.id, 'TGSPDCL')
  })

  it('correctly identifies TGNPDCL for Northern Telangana districts', () => {
    const warangal = identifyDiscomByLocation('I am in Warangal / Hanumakonda')
    assert.ok(warangal)
    assert.equal(warangal.id, 'TGNPDCL')
    assert.equal(warangal.tollFree, '1912')
    assert.equal(warangal.portalUrl, 'https://tgnpdcl.com')
    assert.ok(warangal.headquarters.includes('Hanumakonda'))

    const knr = identifyDiscomByLocation('Karimnagar town')
    assert.ok(knr)
    assert.equal(knr.id, 'TGNPDCL')

    const nzb = identifyDiscomByLocation('Nizamabad district')
    assert.ok(nzb)
    assert.equal(nzb.id, 'TGNPDCL')
  })

  it('provides statewide 1912 helpline and asks for location when location is unspecified', () => {
    const res = buildReportingOverview({ location: null, language: 'en' })
    assert.ok(res.reply.includes('1912'), 'Must include 1912 helpline')
    assert.ok(res.reply.includes('TGSPDCL'), 'Must mention TGSPDCL')
    assert.ok(res.reply.includes('TGNPDCL'), 'Must mention TGNPDCL')
    assert.ok(res.reply.includes('Tell me your district or town'), 'Must prompt for location when unstated')
    assert.ok(res.reply.includes('spot bill receipt'), 'Must explain that DISCOM name is printed on spot bill')
  })

  it('handles unconfirmed local officer phone numbers without hallucinating contacts', () => {
    const res = generateClientRuleResponse('What is the phone number of my local lineman or AE in Jubilee Hills?')
    assert.ok(res.reply.includes('Official Local Officer & Lineman Contact Numbers'))
    assert.ok(res.reply.includes('TheftGuard AI does not generate or store private personal numbers'))
    assert.ok(res.reply.includes('Check your Spot Bill Receipt'))
    assert.ok(res.reply.includes('ERO / Section Office'))
    assert.ok(res.reply.includes('1912'))
    // Must NOT contain invented 10-digit mobile numbers
    assert.ok(!/\b[6-9]\d{9}\b/.test(res.reply))
  })
})

describe('Telangana Electricity Reporting Guidance — Documents Checklist & Safety', () => {
  it('provides comprehensive documents checklist with active bill context when loaded', () => {
    const billContext = { consumer_number: '100234567', curr_units: 320 }
    const res = buildRequiredInformationChecklist({ billContext, language: 'en' })

    assert.ok(res.reply.includes('USC: **100234567**'), 'Must reflect active user USC')
    assert.ok(res.reply.includes('Unique Service Number (USC)'))
    assert.ok(res.reply.includes('Screen 2 (Cumulative kWh)'))
    assert.ok(res.reply.includes('Screen 1 (Date)'))
    assert.ok(res.reply.includes('Recent Spot Bill Receipts'))
    assert.ok(res.reply.includes('Never touch meter terminals'), 'Must contain safety warning')
  })

  it('provides generic checklist placeholders when no bill context is loaded', () => {
    const res = buildRequiredInformationChecklist({ billContext: null, language: 'en' })
    assert.ok(res.reply.includes('Unique Service Number (USC)'))
    assert.ok(res.reply.includes('monthly spot bill receipt'))
    assert.ok(res.reply.includes('Never touch meter terminals'))
  })
})

describe('Telangana Electricity Reporting Guidance — Complaint Lifecycle & Post-Submission', () => {
  it('explains the complete 5-step complaint lifecycle under TGERC standards', () => {
    const res = buildComplaintLifecycleExplanation({ language: 'en' })
    assert.ok(res.reply.includes('Docket Generation & SMS Tracking'))
    assert.ok(res.reply.includes('Site Inspection by Technical Officers'))
    assert.ok(res.reply.includes('Assistant Engineer (AE / Operations)'))
    assert.ok(res.reply.includes('Meter Testing'))
    assert.ok(res.reply.includes('Bill Rectification & Ledger Adjustment'))
    assert.ok(res.reply.includes('Consumer Grievance Redressal Forum (CGRF)'))
    assert.ok(res.reply.includes('Vidyut Ombudsman'))
  })
})

describe('Telangana Electricity Reporting Guidance — Complaint Drafting & Non-Accusatory Tone', () => {
  it('generates a structured draft complaint with explicit "Draft Only" disclaimer', () => {
    const billContext = { consumer_number: '987654321', curr_units: 420, prev_units: 180 }
    const res = buildDraftComplaint({ billContext, location: 'Hyderabad', language: 'en' })

    assert.ok(res.reply.includes('Date: [Current Date]'))
    assert.ok(res.reply.includes('Assistant Engineer (Operations)'))
    assert.ok(res.reply.includes('Southern Power Distribution Company of Telangana Limited (TGSPDCL)'))
    assert.ok(res.reply.includes('USC Number: 987654321'))
    assert.ok(res.reply.includes('420 kWh'))
    assert.ok(res.reply.includes('180 kWh/month'))
    assert.ok(res.reply.includes('Draft Only (Not Automatically Submitted)'), 'Must explicitly state it is a draft')
    assert.ok(res.reply.includes('TheftGuard AI does not connect to DISCOM dispatch systems'), 'Must disclaim live submission')
    assert.ok(res.reply.includes('1912'))
    assert.ok(!res.reply.includes('theft occurred'), 'Must never claim theft occurred in complaint')
  })

  it('never treats a high bill or model score as proof of electricity theft', () => {
    const res = generateClientRuleResponse('How do I report a suspected electricity issue?')
    assert.ok(res.reply.includes('1912'))
    assert.ok(res.reply.includes('TGSPDCL') || res.reply.includes('TGNPDCL'))
    assert.ok(res.disclaimers.some((d) => d.includes('does not establish electricity theft')))
  })
})

describe('Telangana Electricity Reporting Guidance — Multilingual Telugu & Hindi Support', () => {
  it('answers reporting questions in simple, natural everyday Telugu', async () => {
    const res = await chatWithAssistant({
      message: 'విద్యుత్ సమస్య గురించి ఎలా ఫిర్యాదు చేయాలి?',
      forceOffline: true,
      language: 'te',
    })

    assert.ok(res.reply.includes('1912'), 'Must include 1912 in Telugu')
    assert.ok(res.reply.includes('TGSPDCL') || res.reply.includes('TSNPDCL') || res.reply.includes('TGNPDCL'))
    assert.ok(res.reply.includes('హెల్ప్‌లైన్'))
    assert.ok(res.reply.includes('డాకెట్ నంబర్'))
    assert.ok(res.reply.includes('ఎట్టిపరిస్థితుల్లో తాకవద్దు'), 'Must include safety warning in Telugu')
  })

  it('generates a complaint draft in Telugu with disclaimer', async () => {
    const res = await chatWithAssistant({
      message: 'ఫిర్యాదు లేఖ రాయడానికి సహాయం చేయండి',
      forceOffline: true,
      language: 'te',
    })

    assert.ok(res.reply.includes('అసిస్టెంట్ ఇంజనీర్'))
    assert.ok(res.reply.includes('సర్వీస్ నంబర్'))
    assert.ok(res.reply.includes('డ్రాఫ్ట్ మాత్రమే'))
    assert.ok(res.reply.includes('1912'))
  })

  it('explains documents checklist in Telugu', async () => {
    const res = await chatWithAssistant({
      message: 'ఫిర్యాదు కోసం ఏ పత్రాలు కావాలి?',
      forceOffline: true,
      language: 'te',
    })

    assert.ok(res.reply.includes('USC'))
    assert.ok(res.reply.includes('మీటర్ రీడింగ్'))
    assert.ok(res.reply.includes('స్పాట్ బిల్లు'))
    assert.ok(res.reply.includes('భద్రతా హెచ్చరిక'))
  })

  it('explains complaint lifecycle in Telugu', async () => {
    const res = await chatWithAssistant({
      message: 'ఫిర్యాదు చేసిన తర్వాత ఏమి జరుగుతుంది?',
      forceOffline: true,
      language: 'te',
    })

    assert.ok(res.reply.includes('డాకెట్ నంబర్'))
    assert.ok(res.reply.includes('సాంకేతిక తనిఖీ'))
    assert.ok(res.reply.includes('మీటర్ ఖచ్చితత్వ పరీక్ష'))
    assert.ok(res.reply.includes('CGRF'))
  })

  it('answers reporting questions in clear Hindi', async () => {
    const res = await chatWithAssistant({
      message: 'बिजली की शिकायत कैसे दर्ज करें?',
      forceOffline: true,
      language: 'hi',
    })

    assert.ok(res.reply.includes('1912'))
    assert.ok(res.reply.includes('TGSPDCL') || res.reply.includes('TGNPDCL'))
    assert.ok(res.reply.includes('हेल्पलाइन'))
    assert.ok(res.reply.includes('डॉकेट'))
    assert.ok(res.reply.includes('सुरक्षा'))
  })

  it('generates a complaint draft in Hindi with disclaimer', async () => {
    const res = await chatWithAssistant({
      message: 'शिकायत पत्र लिखने में मदद करें',
      forceOffline: true,
      language: 'hi',
    })

    assert.ok(res.reply.includes('सहायक अभियंता'))
    assert.ok(res.reply.includes('USC संख्या'))
    assert.ok(res.reply.includes('केवल प्रारूप'))
    assert.ok(res.reply.includes('1912'))
  })
})

describe('Telangana Electricity Reporting Guidance — Plugin Integration', () => {
  it('executes electricity_help plugin for reporting queries', async () => {
    const res = await executeElectricityHelpPlugin({
      params: { query: 'How do I report a suspected electricity issue?' },
    })
    assert.equal(res.status, 'ok')
    assert.ok(res.message.includes('1912'))
    assert.ok(res.message.includes('TGSPDCL') || res.message.includes('TGNPDCL'))
  })

  it('executes electricity_help plugin for complaint drafting', async () => {
    const res = await executeElectricityHelpPlugin({
      params: { query: 'Can you help me write a complaint for my meter?' },
      billContext: { consumer_number: '887766554' },
    })
    assert.equal(res.status, 'ok')
    assert.ok(res.message.includes('USC Number: 887766554'))
    assert.ok(res.message.includes('Draft Only'))
  })
})
