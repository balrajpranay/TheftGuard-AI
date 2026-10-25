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
import Icon, { GoogleIcon } from '../components/Icon'
import LanguageSelector from '../components/LanguageSelector'
import { useAuth } from '../context/AuthContext.js'
import { useLanguage } from '../context/LanguageContext.js'
import { supabase } from '../lib/supabaseClient.js'

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, isAuthenticated, isSupabaseConfigured, enterDemoMode, loading } = useAuth()
  const { language, setLanguage, t } = useLanguage()

  const [mode, setMode] = useState('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Default to /app/dashboard. If redirected from a protected route, preserve it EXCEPT if it was /app/chat or public routes,
  // guaranteeing that the user lands on the primary workspace dashboard to receive onboarding guidance.
  const rawFrom = location.state?.from
  const redirectPath =
    rawFrom &&
    rawFrom !== '/app/chat' &&
    rawFrom !== '/' &&
    rawFrom !== '/signin'
      ? rawFrom
      : '/app/dashboard'

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
    setVerificationEmail(null)
    setOauthLoading(false)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
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
        setErrorMessage(t('auth.errProvideName'))
        return
      }
      if (password.length < 8) {
        setErrorMessage(t('auth.errPasswordLength'))
        return
      }
      if (password !== confirmPassword) {
        setErrorMessage(t('auth.errPasswordMismatch'))
        return
      }
    }

    if (!email.trim() || !password) {
      setErrorMessage(t('auth.errProvideEmailPassword'))
      return
    }

    if (!email.includes('@') || !email.includes('.')) {
      setErrorMessage(t('auth.errValidEmail'))
      return
    }

    setSubmitting(true)

    try {
      if (mode === 'signin') {
        await signIn({ email, password })
        navigate(redirectPath, { replace: true })
      } else {
        const result = await signUp({ email, password, fullName, preferredLanguage: language })

        // Check if user already exists:
        // Supabase with email enumeration protection returns user with identities: [] and session: null
        const isExistingUser =
          result?.user &&
          Array.isArray(result.user.identities) &&
          result.user.identities.length === 0

        if (isExistingUser) {
          setErrorMessage(t('auth.errUserAlreadyExists') || 'An account with this email address already exists. Please sign in instead.')
          setVerificationEmail(null)
          return
        }

        // If email confirmation is required by Supabase project settings:
        if (result?.user && !result?.session) {
          setVerificationEmail(email.trim())
          setPassword('')
          setConfirmPassword('')
          setFullName('')
          setShowPassword(false)
          setShowConfirmPassword(false)
          setErrorMessage(null)
          setSuccessMessage(null)
          return
        }

        // If session is immediately provisioned (email confirmation disabled/auto-confirmed):
        if (result?.session) {
          navigate(redirectPath, { replace: true })
          return
        }

        setSuccessMessage(t('auth.accountCreatedSuccess'))
      }
    } catch (err) {
      let msg = err?.message || 'Authentication failed. Please check your connection and try again.'
      if (msg === 'Invalid login credentials') {
        msg = t('auth.errInvalidCreds')
      } else if (msg.includes('Email not confirmed')) {
        msg = 'Your email address has not been verified yet. Please check your inbox and click the verification link before signing in.'
      } else if (msg.includes('User already registered') || msg.includes('already exists')) {
        msg = t('auth.errUserAlreadyExists') || 'An account with this email address already exists. Please sign in instead.'
      } else if (msg.includes('Password should be at least')) {
        msg = t('auth.errPasswordLength')
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
      {/* Top Header & Language Selector */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          TheftGuard AI
        </span>
        <LanguageSelector variant="compact" />
      </div>

      {/* Mode Switcher Tabs */}
      <div role="tablist" aria-label="Authentication mode" className="mb-6 flex rounded border border-line bg-white p-1">
        <button
          role="tab"
          aria-selected={mode === 'signin'}
          type="button"
          onClick={() => switchMode('signin')}
          className={`flex-1 rounded py-2.5 text-sm font-semibold transition-colors cursor-pointer min-h-[44px] flex items-center justify-center ${
            mode === 'signin' ? 'bg-ink text-white shadow-xs' : 'text-muted hover:text-ink'
          }`}
        >
          {t('auth.signInTab')}
        </button>
        <button
          role="tab"
          aria-selected={mode === 'register'}
          type="button"
          onClick={() => switchMode('register')}
          className={`flex-1 rounded py-2.5 text-sm font-semibold transition-colors cursor-pointer min-h-[44px] flex items-center justify-center ${
            mode === 'register' ? 'bg-ink text-white shadow-xs' : 'text-muted hover:text-ink'
          }`}
        >
          {t('auth.createAccountTab')}
        </button>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
        {mode === 'signin' ? t('auth.signInTitle') : t('auth.createAccountTitle')}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === 'signin'
          ? t('auth.signInSubtitle')
          : t('auth.createAccountSubtitle')}
      </p>

      {!isSupabaseConfigured ? (
        <Notice tone="info" title={t('auth.demoNoticeTitle')} className="mt-4">
          {t('auth.demoNoticeText')}
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

      {verificationEmail ? (
        <div
          data-testid="verification-pending-card"
          className="mt-6 rounded border border-line bg-white p-6 shadow-xs text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold/20 text-gold mb-4">
            <Icon name="check" className="h-6 w-6 text-gold" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-ink">
            {t('auth.checkEmailTitle') || 'Check your email to verify'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {t('auth.checkEmailInstructions', { email: verificationEmail }) ||
              `We sent a verification link to ${verificationEmail}. Click the link in your email to activate your account, then return here to sign in.`}
          </p>
          <div className="my-4 rounded bg-mist px-3 py-2 text-sm font-mono font-medium text-ink border border-line break-all">
            {verificationEmail}
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              variant="dark"
              onClick={() => {
                const mail = verificationEmail
                setVerificationEmail(null)
                switchMode('signin')
                setEmail(mail)
              }}
              className="w-full"
            >
              {t('auth.proceedToSignIn') || 'Proceed to sign in'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setVerificationEmail(null)
                switchMode('register')
              }}
              className="mt-2 text-xs text-muted hover:text-ink underline cursor-pointer"
            >
              {t('auth.useDifferentEmail') || 'Use a different email'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting || oauthLoading}
              aria-label={t('auth.continueGoogle')}
              className="flex w-full items-center justify-center gap-3 rounded border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-gold focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {oauthLoading ? (
                <Spinner label={t('auth.connectingGoogle')} />
              ) : (
                <>
                  <GoogleIcon className="h-5 w-5 shrink-0" />
                  <span>{t('auth.continueGoogle')}</span>
                </>
              )}
            </button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-mist px-2 text-muted">
                  {mode === 'signin' ? t('auth.orEmailSignIn') : t('auth.orEmailCreate')}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-2 space-y-4" noValidate>
            {mode === 'register' ? (
              <Field label={t('auth.fullNameLabel')} htmlFor="full-name">
                <input
                  id="full-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={submitting || oauthLoading}
                  className={inputClass}
                  placeholder={t('auth.fullNamePlaceholder')}
                />
              </Field>
            ) : null}

            <Field label={t('auth.emailLabel')} htmlFor="email">
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting || oauthLoading}
                className={inputClass}
                placeholder={t('auth.emailPlaceholder')}
              />
            </Field>

            <Field label={t('auth.passwordLabel')} htmlFor="password">
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting || oauthLoading}
                  className={`${inputClass} pr-10`}
                  placeholder={mode === 'register' ? t('auth.passwordRegisterPlaceholder') : t('auth.passwordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={submitting || oauthLoading}
                  aria-label={showPassword ? t('auth.hidePassword') || 'Hide password' : t('auth.showPassword') || 'Show password'}
                  title={showPassword ? t('auth.hidePassword') || 'Hide password' : t('auth.showPassword') || 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-hidden focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-gold rounded cursor-pointer disabled:opacity-50"
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                </button>
              </div>
            </Field>

            {mode === 'register' ? (
              <Field label={t('auth.confirmPasswordLabel')} htmlFor="confirm-password">
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={submitting || oauthLoading}
                    className={`${inputClass} pr-10`}
                    placeholder={t('auth.passwordPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    disabled={submitting || oauthLoading}
                    aria-label={showConfirmPassword ? t('auth.hidePassword') || 'Hide password' : t('auth.showPassword') || 'Show password'}
                    title={showConfirmPassword ? t('auth.hidePassword') || 'Hide password' : t('auth.showPassword') || 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-hidden focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-gold rounded cursor-pointer disabled:opacity-50"
                  >
                    <Icon name={showConfirmPassword ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                  </button>
                </div>
              </Field>
            ) : null}

            {mode === 'register' ? (
              <Field label={t('auth.preferredLanguageLabel')} htmlFor="preferred-language">
                <LanguageSelector id="preferred-language" variant="dropdown" ariaLabel={t('auth.preferredLanguageLabel')} />
              </Field>
            ) : null}

            <Button
              type="submit"
              variant="dark"
              disabled={submitting || oauthLoading}
              className="w-full"
            >
              {submitting ? (
                <Spinner label={mode === 'signin' ? t('auth.signingIn') : t('auth.creatingAccount')} />
              ) : mode === 'signin' ? (
                t('auth.signInTab')
              ) : (
                t('auth.createAccountTab')
              )}
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-mist px-2 text-muted">{t('auth.orEvaluateSample')}</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleContinueDemo}
              disabled={submitting || oauthLoading}
              variant="primary"
              className="w-full"
            >
              {t('auth.continueDemo')}
            </Button>
          </form>
        </>
      )}

      {!verificationEmail ? (
        <div className="mt-6 text-center text-sm">
          {mode === 'signin' ? (
            <span className="text-muted">
              {t('auth.noAccountPrompt')}{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-medium text-ink underline underline-offset-2 hover:text-gold cursor-pointer"
              >
                {t('auth.createAccountTab')}
              </button>
            </span>
          ) : (
            <span className="text-muted">
              {t('auth.haveAccountPrompt')}{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-medium text-ink underline underline-offset-2 hover:text-gold cursor-pointer"
              >
                {t('auth.signInTab')}
              </button>
            </span>
          )}
        </div>
      ) : null}

      <p className="mt-4 text-center text-xs text-muted">
        {mode === 'signin'
          ? t('auth.accessNoticeSignIn')
          : t('auth.accessNoticeRegister')}
      </p>
    </div>
  )
}
