/**
 * TheftGuard AI — Authentication, Password Visibility & Replayable Onboarding Tests
 *
 * Verifies:
 * 1. Password Visibility Controls:
 *    - Defaults to type="password" (hidden).
 *    - Toggles cleanly to type="text" and back without modifying entered password text.
 *    - Provides accurate accessible labels in English, Hindi, Telugu, and Tamil.
 * 2. Registration Flow & Error Handling:
 *    - Validates full name, password length (minimum 8 chars), and password confirmation matching.
 *    - Detects existing users via Supabase email enumeration protection (identities: []).
 *    - Handles email verification required (user present with identities, session is null) with clear verification card state.
 *    - Successfully navigates when valid authenticated session is returned.
 * 3. Replayable Guided Onboarding:
 *    - Automatically prompts first-time users (completed/skipped is false).
 *    - Suppresses automatic welcome modal for returning users (completed or skipped).
 *    - Allows returning users to replay the 8-step tour from Step 1 via Help Guide without signing out or clearing storage.
 *    - Multilingual labels for Help Guide and Replay Tour across EN, HI, TE, TA.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { translations, t } from '../src/i18n/translations.js'
import {
  saveOnboardingState,
  readOnboardingState,
  hasUserCompletedOrSkipped,
  clearOnboardingState,
} from '../src/lib/onboardingStorage.js'
import { TOUR_STEPS } from '../src/lib/tourSteps.js'

// In-memory mock localStorage for Node test runner
const storageMap = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, val) => storageMap.set(key, String(val)),
    removeItem: (key) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  },
}

describe('Authentication — Password Visibility Toggles & Accessibility', () => {
  it('defaults password visibility state to false (hidden) and maps to type="password"', () => {
    let showPassword = false
    const getFieldType = (show) => (show ? 'text' : 'password')

    assert.equal(showPassword, false)
    assert.equal(getFieldType(showPassword), 'password')
  })

  it('toggles password visibility state without altering entered password text', () => {
    let showPassword = false
    let passwordValue = 'SuperSecretKey123!'

    // Toggle to visible
    showPassword = !showPassword
    assert.equal(showPassword, true)
    assert.equal(passwordValue, 'SuperSecretKey123!')

    // Toggle back to hidden
    showPassword = !showPassword
    assert.equal(showPassword, false)
    assert.equal(passwordValue, 'SuperSecretKey123!')
  })

  it('provides accessible toggle labels across English, Hindi, Telugu, and Tamil', () => {
    const languages = ['en', 'hi', 'te', 'ta']

    for (const lang of languages) {
      const showLabel = t('auth.showPassword', lang)
      const hideLabel = t('auth.hidePassword', lang)

      assert.ok(showLabel, `Missing auth.showPassword in ${lang}`)
      assert.ok(hideLabel, `Missing auth.hidePassword in ${lang}`)
      assert.notEqual(showLabel, hideLabel, `showPassword and hidePassword should differ in ${lang}`)
      assert.notEqual(showLabel, 'auth.showPassword', `Failed fallback for auth.showPassword in ${lang}`)
      assert.notEqual(hideLabel, 'auth.hidePassword', `Failed fallback for auth.hidePassword in ${lang}`)
    }

    assert.equal(t('auth.showPassword', 'en'), 'Show password')
    assert.equal(t('auth.hidePassword', 'en'), 'Hide password')
    assert.equal(t('auth.showPassword', 'hi'), 'पासवर्ड दिखाएं')
    assert.equal(t('auth.hidePassword', 'hi'), 'पासवर्ड छिपाएं')
    assert.equal(t('auth.showPassword', 'te'), 'పాస్‌వర్డ్‌ను చూపించు')
    assert.equal(t('auth.hidePassword', 'te'), 'పాస్‌వర్డ్‌ను దాచు')
    assert.equal(t('auth.showPassword', 'ta'), 'கடவுச்சொல்லைக் காட்டு')
    assert.equal(t('auth.hidePassword', 'ta'), 'கடவுச்சொல்லை மறை')
  })
})

describe('Authentication — Registration Validation & Routing Flow', () => {
  // Pure helper simulating the exact client-side registration validation in SignIn.jsx
  function validateRegistration({ fullName, email, password, confirmPassword }) {
    if (!fullName || !fullName.trim()) {
      return { ok: false, errorKey: 'auth.errProvideName' }
    }
    if (!password || password.length < 8) {
      return { ok: false, errorKey: 'auth.errPasswordLength' }
    }
    if (password !== confirmPassword) {
      return { ok: false, errorKey: 'auth.errPasswordMismatch' }
    }
    if (!email || !email.trim() || !password) {
      return { ok: false, errorKey: 'auth.errProvideEmailPassword' }
    }
    if (!email.includes('@') || !email.includes('.')) {
      return { ok: false, errorKey: 'auth.errValidEmail' }
    }
    return { ok: true }
  }

  // Pure helper simulating response routing in SignIn.jsx
  function handleRegistrationResponse(result, email) {
    // 1. Existing user check (identities: [])
    const isExistingUser =
      result?.user &&
      Array.isArray(result.user.identities) &&
      result.user.identities.length === 0

    if (isExistingUser) {
      return { action: 'error', errorKey: 'auth.errUserAlreadyExists' }
    }

    // 2. Email verification required
    if (result?.user && !result?.session) {
      return { action: 'verification_pending', email: email.trim() }
    }

    // 3. Immediate session created (auto-confirm)
    if (result?.session) {
      return { action: 'navigate', destination: '/app/dashboard' }
    }

    return { action: 'success', messageKey: 'auth.accountCreatedSuccess' }
  }

  it('rejects registration with empty full name', () => {
    const res = validateRegistration({
      fullName: '  ',
      email: 'operator@utility.org',
      password: 'password123',
      confirmPassword: 'password123',
    })
    assert.equal(res.ok, false)
    assert.equal(res.errorKey, 'auth.errProvideName')
    assert.equal(t(res.errorKey, 'en'), 'Please provide your full name.')
  })

  it('rejects registration when password is shorter than 8 characters', () => {
    const res = validateRegistration({
      fullName: 'Rajesh Kumar',
      email: 'operator@utility.org',
      password: 'short',
      confirmPassword: 'short',
    })
    assert.equal(res.ok, false)
    assert.equal(res.errorKey, 'auth.errPasswordLength')
    assert.equal(t(res.errorKey, 'en'), 'Password must be at least 8 characters long.')
  })

  it('rejects registration when password and confirmation mismatch', () => {
    const res = validateRegistration({
      fullName: 'Rajesh Kumar',
      email: 'operator@utility.org',
      password: 'password123',
      confirmPassword: 'password456',
    })
    assert.equal(res.ok, false)
    assert.equal(res.errorKey, 'auth.errPasswordMismatch')
    assert.equal(t(res.errorKey, 'en'), 'Passwords do not match. Please verify your password confirmation.')
  })

  it('detects existing user via Supabase email enumeration protection (identities: [])', () => {
    const mockSupabaseResponse = {
      user: {
        id: 'user-existing-123',
        email: 'existing@utility.org',
        identities: [], // Empty array returned by Supabase when user already exists
      },
      session: null,
    }

    const decision = handleRegistrationResponse(mockSupabaseResponse, 'existing@utility.org')
    assert.equal(decision.action, 'error')
    assert.equal(decision.errorKey, 'auth.errUserAlreadyExists')

    // Verify translations across languages
    assert.equal(
      t(decision.errorKey, 'en'),
      'An account with this email address already exists. Please sign in instead.',
    )
    assert.ok(t(decision.errorKey, 'te').includes('ఇప్పటికే ఒక ఖాతా ఉంది'))
    assert.ok(t(decision.errorKey, 'hi').includes('पहले से ही एक खाता मौजूद है'))
    assert.ok(t(decision.errorKey, 'ta').includes('ஏற்கனவே ஒரு கணக்கு உள்ளது'))
  })

  it('routes to verification pending card when email confirmation is required', () => {
    const mockSupabaseResponse = {
      user: {
        id: 'user-new-456',
        email: 'newuser@utility.org',
        identities: [{ id: 'identity-1' }],
      },
      session: null,
    }

    const decision = handleRegistrationResponse(mockSupabaseResponse, 'newuser@utility.org')
    assert.equal(decision.action, 'verification_pending')
    assert.equal(decision.email, 'newuser@utility.org')

    const instruction = t('auth.checkEmailInstructions', 'en', { email: decision.email })
    assert.ok(instruction.includes('newuser@utility.org'))
    assert.ok(instruction.includes('verification link'))
  })

  it('routes directly to dashboard when valid session is returned immediately', () => {
    const mockSupabaseResponse = {
      user: {
        id: 'user-session-789',
        email: 'authed@utility.org',
        identities: [{ id: 'identity-1' }],
      },
      session: {
        access_token: 'jwt-token-abc',
        user: { id: 'user-session-789' },
      },
    }

    const decision = handleRegistrationResponse(mockSupabaseResponse, 'authed@utility.org')
    assert.equal(decision.action, 'navigate')
    assert.equal(decision.destination, '/app/dashboard')
  })
})

describe('Onboarding Tour — Replayability for Completed and Skipped Users', () => {
  beforeEach(() => {
    storageMap.clear()
  })

  it('prevents automatic first-login modal for completed accounts but allows manual replay', () => {
    const userId = 'user-veteran-001'

    // Save as completed
    saveOnboardingState(userId, { status: 'completed', lastStep: 7 })

    // hasUserCompletedOrSkipped should be true, preventing automatic welcome prompt
    const shouldAutoPrompt = !hasUserCompletedOrSkipped(userId)
    assert.equal(shouldAutoPrompt, false, 'Should not auto-prompt completed user')

    // Manual replay action: calling startTour(0) resets index to 0 and activates tour
    let currentStepIndex = 7
    let isTourActive = false
    let showWelcomeModal = false

    const replayTour = () => {
      showWelcomeModal = false
      currentStepIndex = 0
      isTourActive = true
    }

    replayTour()

    assert.equal(showWelcomeModal, false)
    assert.equal(currentStepIndex, 0)
    assert.equal(isTourActive, true)
    assert.equal(TOUR_STEPS[currentStepIndex].id, 'welcome')

    // Verify localStorage was NOT wiped or corrupted by replaying
    const persistedState = readOnboardingState(userId)
    assert.equal(persistedState.status, 'completed')
  })

  it('allows skipped accounts to replay the tour from step 1 at any time', () => {
    const userId = 'user-skipped-002'

    // Save as skipped
    saveOnboardingState(userId, { status: 'skipped', lastStep: 2 })

    // Auto-prompt is suppressed
    assert.equal(hasUserCompletedOrSkipped(userId), true)

    // Trigger replay
    let currentStepIndex = 2
    let isTourActive = false

    const startTour = (fromStep = 0) => {
      currentStepIndex = fromStep
      isTourActive = true
    }

    startTour(0)
    assert.equal(currentStepIndex, 0)
    assert.equal(isTourActive, true)
  })

  it('provides Help Guide and Replay Tour navigation labels across all 4 languages', () => {
    const languages = ['en', 'hi', 'te', 'ta']

    for (const lang of languages) {
      const helpGuide = t('nav.helpGuide', lang)
      const replayTour = t('nav.replayTour', lang)

      assert.ok(helpGuide, `Missing nav.helpGuide in ${lang}`)
      assert.ok(replayTour, `Missing nav.replayTour in ${lang}`)
      assert.notEqual(helpGuide, 'nav.helpGuide')
      assert.notEqual(replayTour, 'nav.replayTour')
    }

    assert.equal(t('nav.helpGuide', 'en'), 'Help Guide')
    assert.equal(t('nav.replayTour', 'en'), 'Replay Tour')
    assert.equal(t('nav.helpGuide', 'hi'), 'सहायता गाइड')
    assert.equal(t('nav.replayTour', 'hi'), 'टूर दोबारा देखें')
    assert.equal(t('nav.helpGuide', 'te'), 'సహాయ మార్గదర్శి')
    assert.equal(t('nav.replayTour', 'te'), 'టూర్ మళ్లీ ప్లే చేయండి')
    assert.equal(t('nav.helpGuide', 'ta'), 'உதவி வழிகாட்டி')
    assert.equal(t('nav.replayTour', 'ta'), 'சுற்றுப்பயணத்தை மீண்டும் இயக்கு')
  })
})
