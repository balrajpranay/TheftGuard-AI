/**
 * TheftGuard AI — Language & Localization Context
 *
 * Provides:
 * - Reactive interface language switching across English ('en'), Hindi ('hi'), and Telugu ('te')
 * - Account-isolated persistence adhering to the zero-leakage storage contract:
 *   - Authenticated users: stored under `theftguard_language_user_<userId>`
 *   - Guests / Demo mode: stored under `theftguard_language_guest`
 * - Cross-device sync via Supabase user metadata when authenticated
 * - Bound translation helper `t(key, params)`
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, createElement } from 'react'
import { SUPPORTED_LANGUAGES, t as translate } from '../i18n/translations.js'
import { useAuth } from './AuthContext.js'

const LanguageContext = createContext(null)

export const GUEST_LANG_STORAGE_KEY = 'theftguard_language_guest'
export const USER_LANG_PREFIX = 'theftguard_language_user_'

export function getLanguageStorageKey(userId = null) {
  if (typeof userId === 'string' && userId.trim()) {
    return `${USER_LANG_PREFIX}${userId.trim()}`
  }
  return GUEST_LANG_STORAGE_KEY
}

export function readPersistedLanguage(userId = null) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = getLanguageStorageKey(userId)
      const val = window.localStorage.getItem(key)
      if (val === 'en' || val === 'hi' || val === 'te' || val === 'ta') {
        return val
      }
    }
  } catch {}
  return null
}

export function persistLanguage(userId = null, lang = 'en') {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = getLanguageStorageKey(userId)
      window.localStorage.setItem(key, lang)
    }
  } catch {}
}

export function LanguageProvider({ children }) {
  const { user, isAuthenticated, updateUserLanguage } = useAuth()
  const userId = isAuthenticated && user?.id ? user.id : null

  // Initialize language from account-scoped storage, user metadata, or guest storage
  const [language, setLanguageState] = useState(() => {
    const fromStorage = readPersistedLanguage(userId)
    if (fromStorage) return fromStorage

    const fromMetadata = user?.user_metadata?.preferred_language
    if (fromMetadata && ['en', 'hi', 'te', 'ta'].includes(fromMetadata)) {
      persistLanguage(userId, fromMetadata)
      return fromMetadata
    }

    return 'en'
  })

  // Synchronize language when authenticated user changes or logs in/out
  useEffect(() => {
    if (userId) {
      const stored = readPersistedLanguage(userId)
      if (stored) {
        setLanguageState(stored)
      } else if (user?.user_metadata?.preferred_language && ['en', 'hi', 'te', 'ta'].includes(user.user_metadata.preferred_language)) {
        const metaLang = user.user_metadata.preferred_language
        persistLanguage(userId, metaLang)
        setLanguageState(metaLang)
      } else {
        // Default for new account is English
        persistLanguage(userId, 'en')
        setLanguageState('en')
      }
    } else {
      // Unauthenticated or demo mode
      const guestStored = readPersistedLanguage(null)
      setLanguageState(guestStored || 'en')
    }
  }, [userId, user?.user_metadata?.preferred_language])

  const setLanguage = useCallback((newLang) => {
    const targetLang = ['en', 'hi', 'te', 'ta'].includes(newLang) ? newLang : 'en'
    setLanguageState(targetLang)
    persistLanguage(userId, targetLang)

    if (userId && typeof updateUserLanguage === 'function') {
      updateUserLanguage(targetLang)
    }
  }, [userId, updateUserLanguage])

  const t = useCallback((key, params = {}) => {
    return translate(key, language, params)
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    supportedLanguages: SUPPORTED_LANGUAGES,
    isEnglish: language === 'en',
    isHindi: language === 'hi',
    isTelugu: language === 'te',
    isTamil: language === 'ta',
  }), [language, setLanguage, t])

  return createElement(LanguageContext.Provider, { value }, children)
}

export function useLanguage() {
  const dispatcher =
    React?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.ReactCurrentDispatcher?.current ||
    React?.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?.H

  if (!dispatcher) {
    return {
      language: 'en',
      setLanguage: () => {},
      t: (key, params) => translate(key, 'en', params),
      supportedLanguages: SUPPORTED_LANGUAGES,
      isEnglish: true,
      isHindi: false,
      isTelugu: false,
      isTamil: false,
    }
  }

  let context = null
  try {
    context = useContext(LanguageContext)
  } catch {}

  return (
    context || {
      language: 'en',
      setLanguage: () => {},
      t: (key, params) => translate(key, 'en', params),
      supportedLanguages: SUPPORTED_LANGUAGES,
      isEnglish: true,
      isHindi: false,
      isTelugu: false,
      isTamil: false,
    }
  )
}
