/**
 * TheftGuard AI — Supabase Client Configuration
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from frontend environment variables.
 * - Never includes a service_role key or backend credentials in client bundle.
 * - Gracefully falls back when configuration is missing so local demo workspace remains usable.
 * - Dynamically delegates through a proxy for clean unit test mocking.
 */

import { createClient } from '@supabase/supabase-js'

function getEnvVar(name) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
      return String(import.meta.env[name]).trim()
    }
  } catch {
    // import.meta not available in some test environments
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
      return String(process.env[name]).trim()
    }
  } catch {
    // process not available in strict browser environments
  }
  return ''
}

/**
 * Normalizes and sanitizes a Supabase URL to extract the root origin.
 * Prevents accidental subpath pollution (e.g. trailing slashes, /rest/v1, /auth/v1)
 * from breaking Supabase Auth endpoint routing.
 */
export function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return ''
  try {
    const parsed = new URL(trimmed)
    return parsed.origin
  } catch {
    return ''
  }
}

const rawSupabaseUrl = getEnvVar('VITE_SUPABASE_URL')
const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl)
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY').replace(/^['"]|['"]$/g, '')

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://'))
)

// Safe fallback auth implementation for unconfigured environments
const fallbackAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  signInWithPassword: async () => ({
    data: { user: null, session: null },
    error: new Error(
      'Supabase authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your frontend environment.'
    ),
  }),
  signUp: async () => ({
    data: { user: null, session: null },
    error: new Error(
      'Supabase authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your frontend environment.'
    ),
  }),
  signOut: async () => ({ error: null }),
}

function createDefaultClient() {
  if (isSupabaseConfigured) {
    try {
      return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    } catch (err) {
      console.warn('[TheftGuard AI] Failed to initialize Supabase client:', err?.message || err)
      return { auth: fallbackAuth }
    }
  }
  return { auth: fallbackAuth }
}

let activeClient = createDefaultClient()

/**
 * Global Supabase client proxy.
 * Safely delegates all calls to the active client (or fallback).
 */
export const supabase = new Proxy({}, {
  get(target, prop) {
    return activeClient ? activeClient[prop] : undefined
  },
})

/**
 * Retrieves the current Supabase session access token for Bearer authentication.
 * Returns null if unauthenticated, expired, or unconfigured.
 */
export async function getSessionToken() {
  if (!activeClient || !activeClient.auth) return null
  try {
    const { data, error } = await activeClient.auth.getSession()
    if (error || !data?.session) return null
    return data.session.access_token || null
  } catch {
    return null
  }
}

/**
 * Overrides active client for isolated unit and integration tests.
 */
export function setSupabaseClientForTesting(client) {
  activeClient = client
}

/**
 * Resets client back to default environment configuration.
 */
export function resetSupabaseClientForTesting() {
  activeClient = createDefaultClient()
}
