/**
 * TheftGuard AI — Interactive Guided Product Tour Overlay
 *
 * Highlights the target workspace component or navigation item, dims the backdrop,
 * and renders an accessible, responsive tooltip card with step guidance.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '../Icon'
import LanguageSelector from '../LanguageSelector'
import { useOnboarding } from '../../context/OnboardingContext'
import { useLanguage } from '../../context/LanguageContext'

export default function TourOverlay() {
  const {
    isTourActive,
    currentStepIndex,
    currentStep,
    totalSteps,
    nextStep,
    prevStep,
    skipTour,
    finishTour,
  } = useOnboarding()
  const { t } = useLanguage()

  const [targetRect, setTargetRect] = useState(null)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false))
  const cardRef = useRef(null)
  const prevFocusRef = useRef(null)

  // Track initial focus element for restoration upon completion or dismissal
  useEffect(() => {
    if (isTourActive) {
      if (!prevFocusRef.current) {
        prevFocusRef.current = document.activeElement
      }
    } else {
      if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') {
        prevFocusRef.current.focus()
        prevFocusRef.current = null
      }
    }
  }, [isTourActive])

  // Track window resizing and mobile state
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 1024)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Update target element coordinates when step changes or route settles
  const updateTargetRect = useCallback(() => {
    if (!isTourActive || !currentStep) {
      setTargetRect(null)
      return
    }

    // Step 0 has no selector; final step or missing selector centers modal
    if (currentStep.isFinal || !currentStep.selector) {
      setTargetRect(null)
      return
    }

    let el = document.querySelector(currentStep.selector)
    if (!el && currentStep.pageSelector) {
      el = document.querySelector(currentStep.pageSelector)
    }

    if (el) {
      const rect = el.getBoundingClientRect()
      // Only set if visible on screen
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        })

        // Scroll into view if outside viewport or in scrollable container
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        return
      }
    }

    setTargetRect(null)
  }, [isTourActive, currentStep])

  useEffect(() => {
    if (!isTourActive) return

    // Small delay to allow route navigation and layout rendering to stabilize
    updateTargetRect()
    const timer = setTimeout(updateTargetRect, 80)
    const secondTimer = setTimeout(updateTargetRect, 250)

    window.addEventListener('scroll', updateTargetRect, { passive: true })
    window.addEventListener('resize', updateTargetRect)

    return () => {
      clearTimeout(timer)
      clearTimeout(secondTimer)
      window.removeEventListener('scroll', updateTargetRect)
      window.removeEventListener('resize', updateTargetRect)
    }
  }, [isTourActive, currentStepIndex, updateTargetRect])

  // Keyboard navigation & focus management
  // Escape: skip | ArrowRight / Enter: advance/finish | ArrowLeft: previous | Tab: trap focus
  // Suppressed when user is typing in text inputs or interactive form elements
  useEffect(() => {
    if (!isTourActive) return

    function handleKeyDown(e) {
      const target = e.target
      const tag = target?.tagName?.toUpperCase()
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
      if (isEditable) return

      if (e.key === 'Escape') {
        e.preventDefault()
        skipTour()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        if (currentStep?.isFinal) {
          finishTour()
        } else {
          nextStep()
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentStepIndex > 0) {
          prevStep()
        }
      } else if (e.key === 'Tab' && cardRef.current) {
        const focusables = cardRef.current.querySelectorAll(
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
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTourActive, currentStepIndex, currentStep, nextStep, prevStep, skipTour, finishTour])

  if (!isTourActive || !currentStep) return null

  const isFinalStep = Boolean(currentStep.isFinal)
  const title = t(`${currentStep.translationKey}.title`)
  const desc = t(`${currentStep.translationKey}.desc`)
  const stepCounterText = t('onboarding.stepCounter', {
    current: currentStepIndex + 1,
    total: totalSteps,
  })

  // Desktop positioning logic:
  // If target is in the sidebar (left side of viewport), dock tooltip to the right of the target.
  // Otherwise, center or float intelligently.
  let desktopStyle = {}
  let arrowPlacement = 'left' // 'left' | 'top' | 'none'

  if (!isMobile && targetRect) {
    const margin = 16
    const tooltipWidth = 380
    const isTargetOnLeft = targetRect.left < window.innerWidth / 2

    if (isTargetOnLeft) {
      // Place to the right of the target
      const leftPos = Math.min(window.innerWidth - tooltipWidth - margin, targetRect.right + margin)
      const topPos = Math.max(margin, Math.min(targetRect.top - 20, window.innerHeight - 340))
      desktopStyle = {
        position: 'fixed',
        left: `${leftPos}px`,
        top: `${topPos}px`,
        width: `${tooltipWidth}px`,
      }
      arrowPlacement = 'left'
    } else {
      // Place to the left or below
      const leftPos = Math.max(margin, targetRect.left - tooltipWidth - margin)
      const topPos = Math.max(margin, Math.min(targetRect.top, window.innerHeight - 340))
      desktopStyle = {
        position: 'fixed',
        left: `${leftPos}px`,
        top: `${topPos}px`,
        width: `${tooltipWidth}px`,
      }
      arrowPlacement = 'right'
    }
  } else if (!isMobile) {
    // No target or completion step: center on desktop
    desktopStyle = {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: '440px',
    }
    arrowPlacement = 'none'
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
      aria-describedby="tour-step-desc"
      data-testid="guided-tour-overlay"
      className="fixed inset-0 z-50 pointer-events-auto"
    >
      {/* Restrained dark translucent overlay with SVG cutout mask (zero heavy backdrop blur) */}
      <svg
        data-testid="tour-backdrop-svg"
        className="fixed inset-0 h-full w-full pointer-events-none z-40 transition-opacity duration-200"
        aria-hidden="true"
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={Math.max(0, targetRect.left - 4)}
                y={Math.max(0, targetRect.top - 4)}
                width={targetRect.width + 8}
                height={targetRect.height + 8}
                rx="8"
                ry="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(11, 15, 25, 0.65)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Transparent backdrop click-catcher to dismiss */}
      <div
        className="fixed inset-0 z-40"
        onClick={skipTour}
        aria-hidden="true"
      />

      {/* Spotlight cutout / focus ring for highlighted element */}
      {targetRect && (
        <div
          data-testid="tour-spotlight-ring"
          className="pointer-events-none fixed z-50 rounded-lg ring-2 ring-gold/90 shadow-[0_0_24px_rgba(234,179,8,0.5)] transition-all duration-200 ease-out"
          style={{
            top: `${Math.max(0, targetRect.top - 4)}px`,
            left: `${Math.max(0, targetRect.left - 4)}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
          }}
        />
      )}

      {/* Tour Card Tooltip */}
      <div
        ref={cardRef}
        data-testid="tour-card"
        style={!isMobile ? desktopStyle : {}}
        className={`z-50 bg-ink border border-gold/70 text-white rounded-xl shadow-2xl p-5 ring-1 ring-gold/40 transition-all max-h-[calc(100vh-2rem)] overflow-y-auto ${
          isMobile
            ? 'fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-3 right-3 max-w-lg mx-auto'
            : ''
        }`}
      >
        {/* Tooltip arrow for desktop when pointing to target */}
        {!isMobile && arrowPlacement === 'left' && targetRect && (
          <div
            className="absolute -left-2 top-8 h-4 w-4 rotate-45 border-b border-l border-gold/70 bg-ink"
            aria-hidden="true"
          />
        )}

        {/* Card Header: Step counter, compact Language Selector, and Skip button */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-gold/20 border border-gold/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              {t('onboarding.tourBadge') || 'Tour'}
            </span>
            <span className="text-xs font-semibold text-white/70">
              {stepCounterText}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSelector variant="compact" tone="dark" />
            <button
              type="button"
              onClick={skipTour}
              className="rounded p-1 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer min-h-[32px] px-2 flex items-center gap-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold"
              aria-label={t('onboarding.skipTour') || 'Skip Tour'}
            >
              <span>{t('onboarding.skipTour')}</span>
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={currentStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label="Tour progress"
          className="w-full bg-white/10 rounded-full h-1 mt-2.5 overflow-hidden"
        >
          <div
            className="bg-gold h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.round(((currentStepIndex + 1) / totalSteps) * 100)}%` }}
          />
        </div>

        {/* Card Content */}
        <div className="mt-3.5 space-y-2">
          <div className="flex items-center gap-2">
            {currentStep.icon && (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15 text-gold border border-gold/30">
                <Icon name={currentStep.icon} className="h-4 w-4" />
              </span>
            )}
            <h3 id="tour-step-title" className="text-base font-bold text-white tracking-tight">
              {title}
            </h3>
          </div>
          <p id="tour-step-desc" className="text-xs sm:text-sm leading-relaxed text-white/80 whitespace-pre-line">
            {desc}
          </p>
        </div>

        {/* Card Navigation Footer */}
        <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/10">
          <div>
            {currentStepIndex > 0 ? (
              <button
                type="button"
                onClick={prevStep}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer min-h-[38px] flex items-center gap-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold"
              >
                <Icon name="chevLeft" className="h-3.5 w-3.5" />
                <span>{t('onboarding.previous')}</span>
              </button>
            ) : (
              <span className="text-[11px] text-white/40">
                1 / {totalSteps}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isFinalStep ? (
              <button
                type="button"
                onClick={finishTour}
                className="rounded-lg bg-gold px-4 py-2 text-xs font-bold text-ink shadow-md hover:bg-[#E0B220] transition-all cursor-pointer min-h-[38px] flex items-center gap-1.5 border border-gold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ink"
              >
                <Icon name="check" className="h-3.5 w-3.5" />
                <span>{t('onboarding.finishTour') || t('onboarding.finishGuide') || 'Finish Tour'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={nextStep}
                className="rounded-lg bg-gold px-4 py-2 text-xs font-bold text-ink shadow-md hover:bg-[#E0B220] transition-all cursor-pointer min-h-[38px] flex items-center gap-1.5 border border-gold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ink"
              >
                <span>{t('onboarding.next')}</span>
                <Icon name="chevRight" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
