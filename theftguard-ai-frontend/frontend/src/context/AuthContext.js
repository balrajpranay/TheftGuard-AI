/**
 * TheftGuard AI — Authentication & Session Context
 *
 * Manages Supabase Auth state, session lifecycle, token refresh, and synthetic demo mode.
 * - Protects authenticated routes while avoiding flashing during initial session loading.
 * - Enforces zero-trust: demo mode never acquires or transmits Bearer tokens to persistence endpoints.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, createElement } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

const DEMO_STORAGE_KEY = 'theftguard_demo_mode'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get('demo') === 'true') {
          sessionStorage.setItem(DEMO_STORAGE_KEY, 'true')
          return true
        }
        return sessionStorage.getItem(DEMO_STORAGE_KEY) === 'true'
      }
    } catch {
      // Storage access blocked or unavailable
    }
    return false
  })

  // Initialize session and subscribe to Supabase Auth state changes
  useEffect(() => {
    let mounted = true

    async function initAuth() {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (mounted) {
          if (!error && data?.session) {
            setSession(data.session)
            setUser(data.session.user ?? null)
            // If genuinely authenticated, clear demo mode
            setIsDemoMode(false)
            try {
              sessionStorage.removeItem(DEMO_STORAGE_KEY)
            } catch {}
          } else {
            setSession(null)
            setUser(null)
          }
        }
      } catch (err) {
        console.warn('[TheftGuard AI Auth] Error initializing session:', err)
        if (mounted) {
          setSession(null)
          setUser(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null)
        setUser(null)
      } else if (newSession) {
        setSession(newSession)
        setUser(newSession.user ?? null)
        setIsDemoMode(false)
        try {
          sessionStorage.removeItem(DEMO_STORAGE_KEY)
        } catch {}
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe()
      }
    }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase authentication is not configured in this environment. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      )
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      throw error
    }

    if (data?.session) {
      setSession(data.session)
      setUser(data.session.user ?? null)
      setIsDemoMode(false)
      try {
        sessionStorage.removeItem(DEMO_STORAGE_KEY)
      } catch {}
    }

    return data
  }, [])

  const signUp = useCallback(async ({ email, password, fullName }) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase authentication is not configured in this environment. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      )
    }

    const trimmedName = typeof fullName === 'string' ? fullName.trim() : ''

    const redirectUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/signin`
        : undefined

    // Pass email, password, and safely include full_name in user_metadata.
    // Explicitly omit any role, is_admin, or permission claims to prevent client-side privilege tampering.
    // Include emailRedirectTo so verification links route back to active host/port.
    const signUpOptions = {
      ...(trimmedName ? { data: { full_name: trimmedName } } : {}),
      ...(redirectUrl ? { emailRedirectTo: redirectUrl } : {}),
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      ...(Object.keys(signUpOptions).length > 0 ? { options: signUpOptions } : {}),
    })

    if (error) {
      throw error
    }

    if (data?.session) {
      setSession(data.session)
      setUser(data.session.user ?? null)
      setIsDemoMode(false)
      try {
        sessionStorage.removeItem(DEMO_STORAGE_KEY)
      } catch {}
    }

    return data
  }, [])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('[TheftGuard AI Auth] Error during sign-out:', err)
    } finally {
      setSession(null)
      setUser(null)
      setIsDemoMode(false)
      try {
        sessionStorage.removeItem(DEMO_STORAGE_KEY)
      } catch {}
    }
  }, [])

  const signInWithOAuth = useCallback(async ({ provider = 'google', redirectTo } = {}) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase authentication is not configured in this environment. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      )
    }

    const redirectUrl =
      redirectTo || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
      },
    })

    if (error) {
      throw error
    }

    return data
  }, [])

  // A real session strictly requires a non-empty access token and a valid user id.
  // Never infer real authentication from an arbitrary user object alone.
  const isRealSession = Boolean(
    session &&
    typeof session.access_token === 'string' &&
    session.access_token.length > 0 &&
    user &&
    typeof user.id === 'string' &&
    user.id.length > 0,
  )

  // Demo mode is active ONLY if not genuinely authenticated and explicitly enabled
  const activeDemoMode = !isRealSession && Boolean(isDemoMode)

  const enterDemoMode = useCallback(() => {
    if (isRealSession) return
    setIsDemoMode(true)
    try {
      sessionStorage.setItem(DEMO_STORAGE_KEY, 'true')
    } catch {}
  }, [isRealSession])

  const exitDemoMode = useCallback(() => {
    setIsDemoMode(false)
    try {
      sessionStorage.removeItem(DEMO_STORAGE_KEY)
    } catch {}
  }, [])

  const value = useMemo(
    () => ({
      session: isRealSession ? session : null,
      user: isRealSession ? user : null,
      loading,
      isAuthenticated: isRealSession,
      isDemoMode: activeDemoMode,
      isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      signInWithOAuth,
      enterDemoMode,
      exitDemoMode,
    }),
    [session, user, loading, isRealSession, activeDemoMode, signIn, signUp, signOut, signInWithOAuth, enterDemoMode, exitDemoMode],
  )

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const dispatcher =
    React?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.ReactCurrentDispatcher?.current ||
    React?.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?.H

  if (!dispatcher) {
    return {
      session: null,
      user: null,
      loading: false,
      isAuthenticated: false,
      isDemoMode: false,
      isSupabaseConfigured: false,
      signIn: async () => {},
      signUp: async () => {},
      signOut: async () => {},
      signInWithOAuth: async () => {},
      enterDemoMode: () => {},
      exitDemoMode: () => {},
    }
  }

  let context = null
  try {
    context = useContext(AuthContext)
  } catch {
    // Called outside React render tree (e.g. unit tests or SSR)
  }
  return (
    context || {
      session: null,
      user: null,
      loading: false,
      isAuthenticated: false,
      isDemoMode: false,
      isSupabaseConfigured: false,
      signIn: async () => {},
      signUp: async () => {},
      signOut: async () => {},
      signInWithOAuth: async () => {},
      enterDemoMode: () => {},
      exitDemoMode: () => {},
    }
  )
}
