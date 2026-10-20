/**
 * TheftGuard AI — Language & Localization Unit Tests
 *
 * Verifies:
 * 1. Language dictionary integrity across English ('en'), Hindi ('hi'), and Telugu ('te').
 * 2. Key lookups, interpolation ({name}, {fileName}), and fallback mechanics.
 * 3. Account-isolated storage contract:
 *    - Authenticated users persist under `theftguard_language_user_<userId>`.
 *    - Guest/demo mode persists under `theftguard_language_guest`.
 *    - Zero preference leakage across distinct accounts.
 * 4. AI assistant localized reasoning:
 *    - kWh definition, power vs energy, and LCD meter dial guidance.
 *    - Webpage structure and navigation overview.
 *    - Dynamic AC appliance calculation in native script.
 *    - Neutral, reassuring theft/tampering responses.
 *    - Everyday simple Telugu phrasing for Telangana electricity consumers.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  SUPPORTED_LANGUAGES,
  translations,
  t,
} from '../src/i18n/translations.js'

import {
  GUEST_LANG_STORAGE_KEY,
  USER_LANG_PREFIX,
  getLanguageStorageKey,
  readPersistedLanguage,
  persistLanguage,
} from '../src/context/LanguageContext.js'

import {
  generateClientRuleResponse,
  chatWithAssistant,
} from '../src/lib/assistantEngine.js'

describe('Language & Localization — Dictionary Integrity & Fallback', () => {
  it('registers exactly 3 supported interface languages: English, Hindi, and Telugu', () => {
    assert.equal(SUPPORTED_LANGUAGES.length, 3)
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code)
    assert.deepEqual(codes, ['en', 'hi', 'te'])

    const telugu = SUPPORTED_LANGUAGES.find((l) => l.code === 'te')
    assert.equal(telugu.nativeName, 'తెలుగు')
    assert.equal(telugu.label, 'Telugu')

    const hindi = SUPPORTED_LANGUAGES.find((l) => l.code === 'hi')
    assert.equal(hindi.nativeName, 'हिन्दी')
    assert.equal(hindi.label, 'Hindi')

    const english = SUPPORTED_LANGUAGES.find((l) => l.code === 'en')
    assert.equal(english.nativeName, 'English')
  })

  it('translates common workspace navigation items across all 3 languages', () => {
    const navKeys = ['chat', 'overview', 'screening', 'results', 'comparison', 'billUpload', 'billComparison', 'investigations', 'reports', 'model', 'settings']

    for (const key of navKeys) {
      const enVal = t(`nav.${key}`, 'en')
      const hiVal = t(`nav.${key}`, 'hi')
      const teVal = t(`nav.${key}`, 'te')

      assert.ok(typeof enVal === 'string' && enVal.length > 0, `en nav.${key} must be non-empty`)
      assert.ok(typeof hiVal === 'string' && hiVal.length > 0, `hi nav.${key} must be non-empty`)
      assert.ok(typeof teVal === 'string' && teVal.length > 0, `te nav.${key} must be non-empty`)

      // Must be distinct non-English strings for Hindi and Telugu
      assert.notEqual(hiVal, enVal, `hi nav.${key} should differ from English`)
      assert.notEqual(teVal, enVal, `te nav.${key} should differ from English`)
    }

    assert.equal(t('nav.settings', 'en'), 'Settings')
    assert.equal(t('nav.settings', 'hi'), 'सेटिंग्स')
    assert.equal(t('nav.settings', 'te'), 'సెట్టింగ్‌లు')
  })

  it('interpolates dynamic parameters correctly in translation strings', () => {
    const resEn = t('topBanner.authText', 'en', { name: 'Aditi Sharma' })
    assert.ok(resEn.includes('Aditi Sharma'))

    const resHi = t('topBanner.authText', 'hi', { name: 'राहुल वर्मा' })
    assert.ok(resHi.includes('राहुल वर्मा'))

    const resTe = t('topBanner.authText', 'te', { name: 'శ్రీనివాస్ రావు' })
    assert.ok(resTe.includes('శ్రీనివాస్ రావు'))
  })

  it('falls back to English when a key or language is invalid or missing', () => {
    // Missing key entirely returns key string
    assert.equal(t('nonexistent.nested.key', 'en'), 'nonexistent.nested.key')
    assert.equal(t('nonexistent.nested.key', 'te'), 'nonexistent.nested.key')

    // Invalid language code defaults to English
    assert.equal(t('common.save', 'fr'), 'Save')
    assert.equal(t('common.save', null), 'Save')
  })
})

describe('Language & Localization — Account-Isolated Storage Contract', () => {
  // Mock localStorage for node test runner
  let mockStorage = {}

  beforeEach(() => {
    mockStorage = {}
    global.window = {
      localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(mockStorage, k) ? mockStorage[k] : null),
        setItem: (k, v) => { mockStorage[k] = String(v) },
        removeItem: (k) => { delete mockStorage[k] },
        clear: () => { mockStorage = {} },
      },
    }
  })

  it('maps unauthenticated/guest users to the guest language key', () => {
    assert.equal(getLanguageStorageKey(null), GUEST_LANG_STORAGE_KEY)
    assert.equal(getLanguageStorageKey(''), GUEST_LANG_STORAGE_KEY)
    assert.equal(getLanguageStorageKey('   '), GUEST_LANG_STORAGE_KEY)
  })

  it('maps authenticated user IDs to dedicated account-scoped keys', () => {
    const user1Id = 'usr-uuid-1111'
    const user2Id = 'usr-uuid-2222'

    assert.equal(getLanguageStorageKey(user1Id), `${USER_LANG_PREFIX}usr-uuid-1111`)
    assert.equal(getLanguageStorageKey(user2Id), `${USER_LANG_PREFIX}usr-uuid-2222`)
  })

  it('strictly isolates language preferences between distinct accounts', () => {
    const userA = 'user-alpha-123'
    const userB = 'user-beta-456'

    // User A sets Telugu
    persistLanguage(userA, 'te')
    assert.equal(readPersistedLanguage(userA), 'te')

    // User B sets Hindi
    persistLanguage(userB, 'hi')
    assert.equal(readPersistedLanguage(userB), 'hi')

    // Guest defaults/sets English
    persistLanguage(null, 'en')
    assert.equal(readPersistedLanguage(null), 'en')

    // Verify User A preference was NOT overwritten by User B or Guest
    assert.equal(readPersistedLanguage(userA), 'te')
    assert.equal(readPersistedLanguage(userB), 'hi')
    assert.equal(readPersistedLanguage(null), 'en')
  })

  it('persists preferences across page reloads and browser sessions', () => {
    const operatorId = 'op-tsnpdcl-789'
    persistLanguage(operatorId, 'te')

    // Simulate session reload reading from localStorage
    const restored = readPersistedLanguage(operatorId)
    assert.equal(restored, 'te')
  })
})

describe('Language & Localization — Multilingual AI Assistant Reasoning', () => {
  it('explains kWh in natural, accessible Telugu with plain everyday terminology', async () => {
    const res = await chatWithAssistant({
      message: 'What does kWh mean?',
      forceOffline: true,
      language: 'te',
    })

    assert.ok(res.reply.includes('కిలోవాట్-అవర్'), 'Should mention కిలోవాట్-అవర్ in Telugu')
    assert.ok(res.reply.includes('యూనిట్'), 'Should explain that kWh is called a Unit')
    assert.ok(res.reply.includes('1000 వాట్ల'), 'Should give concrete 1000W appliance example')
    assert.ok(res.reply.includes('kW'), 'Should explain kW (power)')
    assert.ok(res.reply.includes('LCD డిస్ప్లే'), 'Should explain how to read the physical meter LCD')

    // Suggestions should be in Telugu
    assert.ok(res.suggestions.some((s) => /బిల్లు|కరెంట్|టారిఫ్/.test(s)))
  })

  it('explains kWh in clear, accessible Hindi', async () => {
    const res = await chatWithAssistant({
      message: 'What does kWh mean?',
      forceOffline: true,
      language: 'hi',
    })

    assert.ok(res.reply.includes('किलोवाट-घंटा'), 'Should mention किलोवाट-घंटा')
    assert.ok(res.reply.includes('यूनिट'), 'Should explain Unit concept')
    assert.ok(res.reply.includes('1000 वाट'), 'Should give 1000W appliance example')
  })

  it('calculates AC consumption in Telugu with verified hours and electrical estimates', async () => {
    const res = await chatWithAssistant({
      message: 'How much electricity does an AC consume in 8 hours?',
      forceOffline: true,
      language: 'te',
    })

    assert.ok(res.reply.includes('8 గంటలు'), 'Should acknowledge 8 hours')
    assert.ok(res.reply.includes('1.5 టన్ 3-స్టార్ ఇన్వర్టర్ AC'), 'Should mention standard BEE 3-star AC baseline')
    assert.ok(res.reply.includes('24°C'), 'Should mention 24°C energy saving thermostat recommendation')
    assert.ok(res.reply.includes('యూనిట్లు/నెల'), 'Should calculate monthly unit estimate')
    assert.ok(res.reply.includes('ఆదా'), 'Should provide energy saving advice in Telugu')
  })

  it('calculates AC consumption in Hindi with verified hours and estimates', async () => {
    const res = await chatWithAssistant({
      message: 'How much electricity does an AC consume in 6 hours?',
      forceOffline: true,
      language: 'hi',
    })

    assert.ok(res.reply.includes('6 घंटे'), 'Should acknowledge 6 hours')
    assert.ok(res.reply.includes('24°C'), 'Should mention 24°C recommendation')
    assert.ok(res.reply.includes('बचत'), 'Should mention energy savings in Hindi')
  })

  it('explains webpage structure in Telugu with accurate navigation links', async () => {
    const res = await chatWithAssistant({
      message: 'Could you explain me this webpage?',
      forceOffline: true,
      language: 'te',
    })

    assert.ok(res.reply.includes('TheftGuard AI'), 'Should name the platform')
    assert.ok(res.reply.includes('అవలోకనం (Overview)'), 'Should explain Overview section')
    assert.ok(res.reply.includes('బిల్లుల పోలిక (Bill Comparison)'), 'Should explain Bill Comparison')
    assert.ok(res.reply.includes('బిల్ అప్‌లోడ్ (Bill Upload - OCR)'), 'Should explain OCR upload')
  })

  it('provides safe, neutral, and reassuring responses in Telugu to theft inquiries', async () => {
    const res = await chatWithAssistant({
      message: 'Could my high bill be caused by electricity theft?',
      forceOffline: true,
      language: 'te',
    })

    assert.ok(res.reply.includes('సాంకేతిక పరిశీలన'), 'Must frame as technical review')
    assert.ok(!res.reply.includes('మీరు దొంగతనం చేశారు'), 'Must never accuse user of theft')
    assert.ok(res.reply.includes('క్రీప్ టెస్ట్'), 'Must explain safe switch-off creep test')
    assert.ok(res.reply.includes('TGSPDCL / TSNPDCL'), 'Must preserve verified Telangana DISCOM names')
  })

  it('provides safe, neutral, and reassuring responses in Hindi to theft inquiries', async () => {
    const res = await chatWithAssistant({
      message: 'Could my bill indicate theft or meter tampering?',
      forceOffline: true,
      language: 'hi',
    })

    assert.ok(res.reply.includes('तकनीकी समीक्षा'), 'Must frame as technical review')
    assert.ok(res.reply.includes('क्रीप टेस्ट'), 'Must explain creep test')
    assert.ok(res.reply.includes('DISCOM'), 'Must preserve official DISCOM terminology')
  })

  it('preserves 100% exact English behavior when language is English', async () => {
    const res = await chatWithAssistant({
      message: 'What does kWh mean?',
      forceOffline: true,
      language: 'en',
    })

    assert.ok(res.reply.includes('Kilowatt-hour'))
    assert.ok(res.reply.includes('1 Unit'))
    assert.ok(res.reply.includes('1,000 watts'))
  })
})
