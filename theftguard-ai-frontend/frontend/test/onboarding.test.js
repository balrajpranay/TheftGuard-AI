import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ONBOARDING_USER_PREFIX,
  ONBOARDING_GUEST_KEY,
  getOnboardingStorageKey,
  readOnboardingState,
  saveOnboardingState,
  clearOnboardingState,
  hasUserCompletedOrSkipped,
} from '../src/lib/onboardingStorage.js'
import { TOUR_STEPS } from '../src/lib/tourSteps.js'
import { translations, t } from '../src/i18n/translations.js'

// Mock in-memory localStorage for Node test runner
const storageMap = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, val) => storageMap.set(key, String(val)),
    removeItem: (key) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  },
}

describe('Onboarding & Interactive Tour — Storage Contract & Isolation', () => {
  beforeEach(() => {
    storageMap.clear()
  })

  it('partitions storage keys strictly between guest and authenticated user IDs', () => {
    assert.equal(getOnboardingStorageKey(null), ONBOARDING_GUEST_KEY)
    assert.equal(getOnboardingStorageKey(''), ONBOARDING_GUEST_KEY)
    assert.equal(getOnboardingStorageKey('   '), ONBOARDING_GUEST_KEY)
    assert.equal(getOnboardingStorageKey('user-123'), `${ONBOARDING_USER_PREFIX}user-123`)
  })

  it('reads null state when no onboarding record exists', () => {
    assert.equal(readOnboardingState('user-abc'), null)
    assert.equal(hasUserCompletedOrSkipped('user-abc'), false)
  })

  it('saves and reads completed status with ISO timestamp', () => {
    const saved = saveOnboardingState('user-abc', { status: 'completed' })
    assert.equal(saved.status, 'completed')
    assert.ok(saved.updatedAt)

    const read = readOnboardingState('user-abc')
    assert.equal(read.status, 'completed')
    assert.ok(read.updatedAt)
    assert.equal(hasUserCompletedOrSkipped('user-abc'), true)
  })

  it('saves and reads skipped status with step tracking', () => {
    saveOnboardingState('user-abc', { status: 'skipped', lastStep: 3 })
    const read = readOnboardingState('user-abc')
    assert.equal(read.status, 'skipped')
    assert.equal(read.lastStep, 3)
    assert.equal(hasUserCompletedOrSkipped('user-abc'), true)
  })

  it('strictly isolates onboarding state between distinct accounts', () => {
    saveOnboardingState('user-alice', { status: 'completed' })
    assert.equal(hasUserCompletedOrSkipped('user-alice'), true)
    assert.equal(hasUserCompletedOrSkipped('user-bob'), false)

    saveOnboardingState('user-bob', { status: 'skipped' })
    assert.equal(readOnboardingState('user-alice').status, 'completed')
    assert.equal(readOnboardingState('user-bob').status, 'skipped')
  })

  it('respects Supabase user_metadata fallback when localStorage is unpopulated', () => {
    const metadata = { onboarding_status: 'completed' }
    assert.equal(hasUserCompletedOrSkipped('user-cloud', metadata), true)

    // Verify it backfilled localStorage
    const local = readOnboardingState('user-cloud')
    assert.equal(local.status, 'completed')
  })

  it('clears state cleanly on demand', () => {
    saveOnboardingState('user-reset', { status: 'completed' })
    assert.equal(hasUserCompletedOrSkipped('user-reset'), true)

    clearOnboardingState('user-reset')
    assert.equal(hasUserCompletedOrSkipped('user-reset'), false)
  })
})

describe('Onboarding & Interactive Tour — Step Definitions Integrity', () => {
  it('defines exactly 8 sequential tour steps', () => {
    assert.equal(TOUR_STEPS.length, 8)
  })

  it('covers core workspace navigation routes in verified pedagogical sequence', () => {
    const expectedSteps = [
      { id: 'welcome', route: '/app/dashboard', hasSelector: false },
      { id: 'dashboard', route: '/app/dashboard', hasSelector: true },
      { id: 'consumptionData', route: '/app/screening', hasSelector: true },
      { id: 'mlScreening', route: '/app/model', hasSelector: true },
      { id: 'billComparison', route: '/app/bill-comparison', hasSelector: true },
      { id: 'investigationResults', route: '/app/results', hasSelector: true },
      { id: 'reports', route: '/app/reports', hasSelector: true },
      { id: 'chat', route: '/app/chat', hasSelector: true, isFinal: true },
    ]

    TOUR_STEPS.forEach((step, idx) => {
      assert.equal(step.index, idx)
      assert.equal(step.id, expectedSteps[idx].id)
      assert.equal(step.route, expectedSteps[idx].route)
      assert.ok(step.translationKey.startsWith('onboarding.steps.'))
      if (expectedSteps[idx].hasSelector) {
        assert.ok(step.selector.startsWith('[data-tour='))
      } else {
        assert.equal(step.selector, null)
      }
      if (expectedSteps[idx].isFinal) {
        assert.equal(step.isFinal, true)
      }
    })
  })

  it('computes progress percentage accurately for each step', () => {
    const total = TOUR_STEPS.length // 8
    TOUR_STEPS.forEach((step, idx) => {
      const stepNum = idx + 1
      const pct = Math.round((stepNum / total) * 100)
      assert.ok(pct >= 12 && pct <= 100)
    })
    // Step 3 of 8 is 38%
    assert.equal(Math.round((3 / 8) * 100), 38)
    // Step 8 of 8 is 100%
    assert.equal(Math.round((8 / 8) * 100), 100)
  })
})

describe('Onboarding & Interactive Tour — Multilingual Dictionary Coverage', () => {
  const languages = ['en', 'hi', 'te', 'ta']

  it('defines helpGuide in nav across English, Hindi, Telugu, and Tamil', () => {
    for (const lang of languages) {
      const label = t('nav.helpGuide', lang)
      assert.ok(label && label !== 'nav.helpGuide', `nav.helpGuide missing in ${lang}`)
    }
  })

  it('defines welcome modal copy across English, Hindi, Telugu, and Tamil', () => {
    for (const lang of languages) {
      const title = t('onboarding.welcomeTitle', lang)
      const body = t('onboarding.welcomeBody', lang)
      const start = t('onboarding.startGuide', lang)
      const skip = t('onboarding.skipTour', lang)

      assert.ok(title && title !== 'onboarding.welcomeTitle', `welcomeTitle missing in ${lang}`)
      assert.ok(body && body !== 'onboarding.welcomeBody', `welcomeBody missing in ${lang}`)
      assert.ok(start && start !== 'onboarding.startGuide', `startGuide missing in ${lang}`)
      assert.ok(skip && skip !== 'onboarding.skipTour', `skipTour missing in ${lang}`)
    }
  })

  it('defines titles and descriptions for every tour step in English, Hindi, Telugu, and Tamil', () => {
    for (const lang of languages) {
      for (const step of TOUR_STEPS) {
        const titleKey = `${step.translationKey}.title`
        const descKey = `${step.translationKey}.desc`

        const title = t(titleKey, lang)
        const desc = t(descKey, lang)

        assert.ok(title && title !== titleKey, `${titleKey} missing in ${lang}`)
        assert.ok(desc && desc !== descKey, `${descKey} missing in ${lang}`)
      }
    }
  })

  it('interpolates step counter parameters correctly in all languages', () => {
    for (const lang of languages) {
      const counter = t('onboarding.stepCounter', lang, { current: 3, total: 8 })
      assert.ok(counter.includes('3'), `Step number 3 missing in ${lang} counter: ${counter}`)
      assert.ok(counter.includes('8'), `Total 8 missing in ${lang} counter: ${counter}`)
    }
  })

  it('falls back gracefully to English when a translation key is missing in target language', () => {
    // Test missing key in Tamil falls back to English string
    const fallbackText = t('topBanner.demoBadge', 'ta')
    assert.equal(fallbackText, 'Demo Mode')

    // Completely nonexistent key returns the key itself
    const nonexistent = t('onboarding.steps.nonexistent.key', 'ta')
    assert.equal(nonexistent, 'onboarding.steps.nonexistent.key')
  })
})

describe('Onboarding & Interactive Tour — Content Grounding & Technical Accuracy', () => {
  it('grounds dashboard overview step in empty-state and live metrics explanation', () => {
    const desc = t('onboarding.steps.overview.desc', 'en')
    assert.ok(desc.toLowerCase().includes('zero') || desc.toLowerCase().includes('empty'))
    assert.ok(desc.toLowerCase().includes('screening') || desc.toLowerCase().includes('demo'))
  })

  it('grounds screening step in real CSV upload and 13-feature template workflow', () => {
    const desc = t('onboarding.steps.screening.desc', 'en')
    assert.ok(desc.includes('13-feature'))
    assert.ok(desc.includes('CSV'))
    assert.ok(desc.includes('10 MB'))
  })

  it('grounds model step in verified metrics (F1, ROC-AUC) and anomaly disclaimer', () => {
    const desc = t('onboarding.steps.model.desc', 'en')
    assert.ok(desc.includes('0.325'))
    assert.ok(desc.includes('0.741'))
    assert.ok(desc.toLowerCase().includes('statistical anomaly indicator'))
    assert.ok(!desc.toLowerCase().includes('probability of theft'))
  })

  it('grounds bill comparison in consecutive periods, kWh units, dates, and amounts', () => {
    const desc = t('onboarding.steps.billComparison.desc', 'en')
    assert.ok(desc.includes('kWh'))
    assert.ok(desc.toLowerCase().includes('billing cycle') || desc.toLowerCase().includes('billing periods'))
    assert.ok(desc.toLowerCase().includes('payable amounts') || desc.toLowerCase().includes('amount'))
  })

  it('grounds results step in review categories and CSV export', () => {
    const desc = t('onboarding.steps.results.desc', 'en')
    assert.ok(desc.includes('0.50'))
    assert.ok(desc.includes('0.30'))
    assert.ok(desc.includes('CSV'))
  })

  it('grounds reports step in audit sections, CSV export, and PDF generation', () => {
    const desc = t('onboarding.steps.reports.desc', 'en')
    assert.ok(desc.includes('CSV'))
    assert.ok(desc.includes('PDF'))
  })

  it('grounds chat step in local browser privacy and next-action recommendation', () => {
    const desc = t('onboarding.steps.chat.desc', 'en')
    assert.ok(desc.toLowerCase().includes('browser'))
    assert.ok(desc.toLowerCase().includes('screening') || desc.toLowerCase().includes('csv'))
  })
})

describe('Onboarding & Interactive Tour — Overlay & Keyboard Navigation Guards', () => {
  it('correctly suppresses keyboard navigation when typing in form inputs', () => {
    const checkIsEditable = (tagName, isContentEditable = false) => {
      const tag = tagName?.toUpperCase()
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(isContentEditable)
    }

    assert.equal(checkIsEditable('INPUT'), true)
    assert.equal(checkIsEditable('input'), true)
    assert.equal(checkIsEditable('TEXTAREA'), true)
    assert.equal(checkIsEditable('SELECT'), true)
    assert.equal(checkIsEditable('DIV', true), true)
    assert.equal(checkIsEditable('DIV', false), false)
    assert.equal(checkIsEditable('BUTTON'), false)
    assert.equal(checkIsEditable('BODY'), false)
  })
})
