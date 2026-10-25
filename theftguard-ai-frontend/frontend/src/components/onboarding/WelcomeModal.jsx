/**
 * TheftGuard AI — First-Time Welcome Modal
 *
 * Rendered exclusively for first-time authenticated users entering the dashboard.
 * Provides clear value proposition and prompt to take the interactive guided tour.
 */

import { useEffect, useRef } from 'react'
import Icon from '../Icon'
import { LogoMark } from '../Logo'
import LanguageSelector from '../LanguageSelector'
import { useOnboarding } from '../../context/OnboardingContext'
import { useLanguage } from '../../context/LanguageContext'

export default function WelcomeModal() {
  const { showWelcomeModal, startTour, closeWelcomeModal } = useOnboarding()
  const { t } = useLanguage()
  const startButtonRef = useRef(null)
  const modalCardRef = useRef(null)
  const prevFocusRef = useRef(null)

  // Manage focus restoration and focus trap when modal appears
  useEffect(() => {
    if (showWelcomeModal) {
      prevFocusRef.current = document.activeElement

      const timer = setTimeout(() => {
        startButtonRef.current?.focus()
      }, 50)

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeWelcomeModal()
          return
        }

        // Trap focus inside modal
        if (e.key === 'Tab' && modalCardRef.current) {
          const focusables = modalCardRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
          if (focusables.length > 0) {
            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault()
              last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault()
              first.focus()
            }
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('keydown', handleKeyDown)
        // Restore focus on close
        if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') {
          prevFocusRef.current.focus()
        }
      }
    }
  }, [showWelcomeModal, closeWelcomeModal])

  if (!showWelcomeModal) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      aria-describedby="welcome-modal-desc"
      data-testid="welcome-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Restrained dark translucent backdrop with zero blur */}
      <div
        className="fixed inset-0 bg-ink/65 transition-opacity"
        onClick={closeWelcomeModal}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        ref={modalCardRef}
        className="relative w-full max-w-md transform overflow-hidden rounded-xl border border-gold/60 bg-ink p-6 sm:p-7 text-left text-white shadow-2xl ring-1 ring-gold/40 transition-all max-h-[calc(100vh-2rem)] overflow-y-auto"
      >
        {/* Top bar with Logo mark, compact Language Selector, and Close button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15 border border-gold/40 shadow-inner">
              <LogoMark tone="onDark" className="h-7 w-7 text-gold" />
            </div>
            <div>
              <span className="rounded bg-gold/20 border border-gold/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                {t('onboarding.tourBadge') || 'Tour'}
              </span>
              <p className="text-xs text-white/50 mt-0.5">TheftGuard AI</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSelector variant="compact" tone="dark" />
            <button
              type="button"
              onClick={closeWelcomeModal}
              className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold"
              aria-label={t('onboarding.skipTour') || 'Skip Tour'}
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mt-5 space-y-3">
          <h2 id="welcome-modal-title" className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {t('onboarding.welcomeTitle')}
          </h2>
          <div id="welcome-modal-desc" className="text-sm leading-relaxed text-white/80 whitespace-pre-line">
            {t('onboarding.welcomeBody')}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-7 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={closeWelcomeModal}
            className="w-full sm:w-auto rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer min-h-[44px] flex items-center justify-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold"
          >
            {t('onboarding.skipTour')}
          </button>
          <button
            ref={startButtonRef}
            type="button"
            onClick={() => startTour(0)}
            className="w-full sm:w-auto rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-ink shadow-md hover:bg-[#E0B220] hover:shadow-lg transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-2 border border-gold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ink"
          >
            <span>{t('onboarding.startGuide')}</span>
            <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
