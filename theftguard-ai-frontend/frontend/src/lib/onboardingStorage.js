/**
 * TheftGuard AI — Onboarding State & Storage Contract
 *
 * Provides:
 * - Account-scoped onboarding completion and skipped status persistence.
 * - Strict zero-leakage isolation between distinct authenticated accounts.
 * - Non-authenticated / Demo mode fallback using dedicated guest storage.
 * - Cloud synchronization with Supabase user metadata when authenticated.
 * - Never stores passwords, tokens, or sensitive customer details.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js'

export const ONBOARDING_USER_PREFIX = 'theftguard_onboarding_user_'
export const ONBOARDING_GUEST_KEY = 'theftguard_onboarding_guest'

/**
 * Returns the storage key partitioned by account ID.
 */
export function getOnboardingStorageKey(userId = null) {
  if (typeof userId === 'string' && userId.trim()) {
    return `${ONBOARDING_USER_PREFIX}${userId.trim()}`
  }
  return ONBOARDING_GUEST_KEY
}

/**
 * Reads the persisted onboarding state for a given user identifier.
 * Returns an object { status: 'completed' | 'skipped', updatedAt: string } or null.
 */
export function readOnboardingState(userId = null) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = getOnboardingStorageKey(userId)
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && (parsed.status === 'completed' || parsed.status === 'skipped')) {
          return parsed
        }
      }
    }
  } catch {
    // Storage access restricted or JSON corrupted
  }
  return null
}

/**
 * Saves onboarding state (e.g. status: 'completed' | 'skipped') to account-scoped localStorage.
 */
export function saveOnboardingState(userId = null, { status = 'completed', lastStep = null } = {}) {
  const normalizedStatus = status === 'completed' || status === 'skipped' ? status : 'completed'
  const record = {
    status: normalizedStatus,
    lastStep: typeof lastStep === 'number' ? lastStep : null,
    updatedAt: new Date().toISOString(),
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = getOnboardingStorageKey(userId)
      window.localStorage.setItem(key, JSON.stringify(record))
    }
  } catch (err) {
    console.warn('[TheftGuard AI Onboarding] Failed to write localStorage:', err)
  }

  // Sync to Supabase user metadata if authenticated
  if (userId && isSupabaseConfigured && typeof supabase?.auth?.updateUser === 'function') {
    supabase.auth
      .updateUser({
        data: { onboarding_status: normalizedStatus },
      })
      .catch((err) => {
        console.warn('[TheftGuard AI Onboarding] Failed to sync onboarding status to Supabase:', err)
      })
  }

  return record
}

/**
 * Clears onboarding state for a given user (used for testing or resetting).
 */
export function clearOnboardingState(userId = null) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = getOnboardingStorageKey(userId)
      window.localStorage.removeItem(key)
    }
  } catch {}
}

/**
 * Helper to check whether a user has already completed or skipped the onboarding guide.
 */
export function hasUserCompletedOrSkipped(userId = null, userMetadata = null) {
  // 1. Check account-scoped localStorage
  const local = readOnboardingState(userId)
  if (local?.status === 'completed' || local?.status === 'skipped') {
    return true
  }

  // 2. Check user metadata from Supabase session
  if (userMetadata?.onboarding_status === 'completed' || userMetadata?.onboarding_status === 'skipped') {
    // Backfill local storage
    saveOnboardingState(userId, { status: userMetadata.onboarding_status })
    return true
  }

  return false
}
