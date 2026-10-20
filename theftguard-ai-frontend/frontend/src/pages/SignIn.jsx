/**
 * TheftGuard AI — Utility Operator Sign-In & Registration
 *
 * Authenticates utility personnel and handles safe new-user registration using Supabase Auth.
 * - Supports dual-mode: Sign in and Create account.
 * - Enforces zero-trust: self-registration does NOT grant privileged operator roles.
 * - Validates input client-side (format, password strength, confirmation matching).
 * - Handles email verification requirements cleanly without crashing.
 * - Preserves synthetic demo mode access for offline demonstration and evaluation.
 */

import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Field, inputClass, Notice, Spinner } from '../components/ui'
import { GoogleIcon } from '../components/Icon'
import { useAuth } from '../context/AuthContext.js'
import { supabase } from '../lib/supabaseClient.js'

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, isAuthenticated, isSupabaseConfigured, enterDemoMode, loading } = useAuth()

  const [mode, setMode] = useState('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  const redirectPath = location.state?.from || '/app/dashboard'

  // Catch email verification link errors (e.g. expired or invalid token) from URL hash or query params
  useEffect(() => {
    try {
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const search = typeof window !== 'undefined' ? window.location.search : ''
      if (hash.includes('error_description=') || search.includes('error_description=')) {
        const rawParams = hash.includes('error_description=') ? hash.replace(/^#/, '') : search.replace(/^\?/, '')
        const params = new URLSearchParams(rawParams)
        const desc = params.get('error_description')
        if (desc) {
          setErrorMessage(decodeURIComponent(desc.replace(/\+/g, ' ')))
        }
      }
    } catch {}
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist px-4">
        <div className="rounded border border-line bg-white p-6 shadow-xs text-center">
          <Spinner label="Verifying authentication..." />
        </div>
      </div>
    )
  }

  // If already authenticated, redirect to workspace
  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setErrorMessage(null)
    setSuccessMessage(null)
    setOauthLoading(false)
    setPassword('')
    setConfirmPassword('')
    if (newMode === 'signin') {
      setFullName('')
    }
  }

  const handleGoogleSignIn = async () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setOauthLoading(true)

    try {
      const redirectUrl =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : undefined

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      })

      if (error) {
        throw error
      }

      if (data?.url && typeof window !== 'undefined') {
        window.location.assign(data.url)
      }
    } catch (err) {
      let msg = err?.message || 'Failed to initiate Google sign-in. Please try again.'
      if (msg.includes('provider is not enabled') || msg.includes('Unsupported provider')) {
        msg = 'Google sign-in is not enabled in your Supabase project. Please enable Google in Supabase Dashboard -> Authentication -> Providers.'
      }
      setErrorMessage(msg)
      setOauthLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (mode === 'register') {
      if (!fullName.trim()) {
        setErrorMessage('Please provide your full name.')
        return
      }
      if (password.length < 8) {
        setErrorMessage('Password must be at least 8 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please verify your password confirmation.')
        return
      }
    }

    if (!email.trim() || !password) {
      setErrorMessage('Please provide both an email address and password.')
      return
    }

    if (!email.includes('@') || !email.includes('.')) {
      setErrorMessage('Please provide a valid email address.')
      return
    }

    setSubmitting(true)

    try {
      if (mode === 'signin') {
        await signIn({ email, password })
        navigate(redirectPath, { replace: true })
      } else {
        const result = await signUp({ email, password, fullName })
        // If email confirmation is required by Supabase project settings:
        if (result?.user && !result?.session) {
          setSuccessMessage(
            'Account created successfully! Please check your email to verify your address before signing in.',
          )
          setPassword('')
          setConfirmPassword('')
          setFullName('')
        } else {
          // If session is immediately provisioned (email confirmation disabled):
          navigate(redirectPath, { replace: true })
        }
      }
    } catch (err) {
      let msg = err?.message || 'Authentication failed. Please check your connection and try again.'
      if (msg === 'Invalid login credentials') {
        msg = 'Invalid email or password. Please verify your credentials.'
      } else if (msg.includes('Email not confirmed')) {
        msg = 'Your email address has not been verified yet. Please check your inbox and click the verification link before signing in.'
      } else if (msg.includes('User already registered') || msg.includes('already exists')) {
        msg = 'An account with this email address already exists. Please sign in instead.'
      } else if (msg.includes('Password should be at least')) {
        msg = 'Password must be at least 8 characters long.'
      }
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleContinueDemo = () => {
    enterDemoMode()
    navigate('/app/dashboard')
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      {/* Mode Switcher Tabs */}
      <div role="tablist" aria-label="Authentication mode" className="mb-6 flex rounded border border-line bg-white p-1">
        <button
          role="tab"
          aria-selected={mode === 'signin'}
          type="button"
          onClick={() => switchMode('signin')}
          className={`flex-1 rounded py-2 text-sm font-semibold transition-colors cursor-pointer ${
            mode === 'signin' ? 'bg-ink text-white shadow-xs' : 'text-muted hover:text-ink'
          }`}
        >
          Sign in
        </button>
        <button
          role="tab"
          aria-selected={mode === 'register'}
          type="button"
          onClick={() => switchMode('register')}
          className={`flex-1 rounded py-2 text-sm font-semibold transition-colors cursor-pointer ${
            mode === 'register' ? 'bg-ink text-white shadow-xs' : 'text-muted hover:text-ink'
          }`}
        >
          Create account
        </button>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === 'signin'
          ? 'TheftGuard AI utility screening and investigation workspace.'
          : 'Register for TheftGuard AI workspace access.'}
      </p>

      {!isSupabaseConfigured ? (
        <Notice tone="info" title="Demo environment" className="mt-4">
          Supabase is not configured in this environment (<code>VITE_SUPABASE_URL</code> missing). You can explore the application using the demonstration workspace below.
        </Notice>
      ) : null}

      {successMessage ? (
        <Notice tone="success" title="Account created" className="mt-4">
          {successMessage}
        </Notice>
      ) : null}

      {errorMessage ? (
        <Notice tone="danger" title={mode === 'signin' ? 'Authentication error' : 'Registration error'} className="mt-4">
          {errorMessage}
        </Notice>
      ) : null}

      <div className="mt-6">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={submitting || oauthLoading}
          aria-label="Continue with Google"
          className="flex w-full items-center justify-center gap-3 rounded border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-gold focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {oauthLoading ? (
            <Spinner label="Connecting to Google..." />
          ) : (
            <>
              <GoogleIcon className="h-5 w-5 shrink-0" />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-mist px-2 text-muted">
              {mode === 'signin' ? 'Or sign in with email' : 'Or create with email'}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-2 space-y-4" noValidate>
        {mode === 'register' ? (
          <Field label="Customer full name" htmlFor="full-name">
            <input
              id="full-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting || oauthLoading}
              className={inputClass}
              placeholder="e.g. Aditi Sharma"
            />
          </Field>
        ) : null}

        <Field label="Email address" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting || oauthLoading}
            className={inputClass}
            placeholder="operator@utility.example"
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting || oauthLoading}
            className={inputClass}
            placeholder={mode === 'register' ? 'Minimum 8 characters' : '••••••••'}
          />
        </Field>

        {mode === 'register' ? (
          <Field label="Confirm password" htmlFor="confirm-password">
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting || oauthLoading}
              className={inputClass}
              placeholder="••••••••"
            />
          </Field>
        ) : null}

        <Button
          type="submit"
          variant="dark"
          disabled={submitting || oauthLoading}
          className="w-full"
        >
          {submitting ? (
            <Spinner label={mode === 'signin' ? 'Signing in...' : 'Creating account...'} />
          ) : mode === 'signin' ? (
            'Sign in'
          ) : (
            'Create account'
          )}
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-mist px-2 text-muted">Or evaluate sample data</span>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleContinueDemo}
          disabled={submitting || oauthLoading}
          variant="primary"
          className="w-full"
        >
          Continue to the demo workspace
        </Button>
      </form>

      <div className="mt-6 text-center text-sm">
        {mode === 'signin' ? (
          <span className="text-muted">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => switchMode('register')}
              className="font-medium text-ink underline underline-offset-2 hover:text-gold cursor-pointer"
            >
              Create account
            </button>
          </span>
        ) : (
          <span className="text-muted">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="font-medium text-ink underline underline-offset-2 hover:text-gold cursor-pointer"
            >
              Sign in
            </button>
          </span>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        {mode === 'signin'
          ? 'Access is restricted to authorized electricity distribution personnel. Contact your DISCOM administrator if your account requires operator provisioning.'
          : 'New accounts are registered with standard workspace access. Access to official utility distribution records and customer PII requires administrator approval.'}
      </p>
    </div>
  )
}
