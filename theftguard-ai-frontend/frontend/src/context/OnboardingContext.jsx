/**
 * TheftGuard AI — Onboarding & Interactive Tour Context
 *
 * Manages the guided product tour lifecycle:
 * - Automatic welcome modal presentation for newly registered/authenticated users.
 * - Non-disruptive skipping and persistent account-scoped status tracking.
 * - Interactive step progression across all core workspace features.
 * - Permanent tour replayability via the sidebar "Help Guide" action.
 * - Zero interference with guest or demo modes unless manually triggered.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, createElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.js'
import { TOUR_STEPS } from '../lib/tourSteps.js'
import {
  readOnboardingState,
  saveOnboardingState,
  hasUserCompletedOrSkipped,
} from '../lib/onboardingStorage.js'

const OnboardingContext = createContext(null)

export function OnboardingProvider({ children }) {
  const { user, isAuthenticated, isDemoMode, loading: authLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [isTourActive, setIsTourActive] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const checkedUserIdRef = useRef(null)

  const userId = isAuthenticated && user?.id ? user.id : null

  // Check first-time authenticated login status once auth is settled
  useEffect(() => {
    if (authLoading) return

    // Do NOT show welcome modal on public routes (/ or /signin)
    const isPublicRoute = location.pathname === '/' || location.pathname === '/signin'
    if (isPublicRoute) {
      setShowWelcomeModal(false)
      setIsTourActive(false)
      return
    }

    // Only prompt for genuine authenticated users (not unauthenticated or demo workspace)
    if (isAuthenticated && userId && !isDemoMode) {
      if (checkedUserIdRef.current !== userId) {
        checkedUserIdRef.current = userId
        const alreadyDone = hasUserCompletedOrSkipped(userId, user?.user_metadata)
        if (!alreadyDone) {
          setShowWelcomeModal(true)
        }
      }
    } else {
      // Unauthenticated or demo mode: do not automatically show welcome modal
      setShowWelcomeModal(false)
      if (!isAuthenticated) {
        checkedUserIdRef.current = null
      }
    }
  }, [authLoading, isAuthenticated, userId, isDemoMode, location.pathname, user?.user_metadata])

  // Reset state when logging out
  useEffect(() => {
    if (!isAuthenticated) {
      setShowWelcomeModal(false)
      setIsTourActive(false)
      setCurrentStepIndex(0)
      checkedUserIdRef.current = null
    }
  }, [isAuthenticated])

  const startTour = useCallback((fromStep = 0) => {
    setShowWelcomeModal(false)
    const stepIdx = Math.max(0, Math.min(fromStep, TOUR_STEPS.length - 1))
    setCurrentStepIndex(stepIdx)
    setIsTourActive(true)

    const targetRoute = TOUR_STEPS[stepIdx]?.route
    if (targetRoute && location.pathname !== targetRoute) {
      navigate(targetRoute)
    }
  }, [location.pathname, navigate])

  const nextStep = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1
      setCurrentStepIndex(nextIdx)

      const targetRoute = TOUR_STEPS[nextIdx]?.route
      if (targetRoute && location.pathname !== targetRoute) {
        navigate(targetRoute)
      }
    } else {
      // Reached the end
      finishTour()
    }
  }, [currentStepIndex, location.pathname, navigate])

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1
      setCurrentStepIndex(prevIdx)

      const targetRoute = TOUR_STEPS[prevIdx]?.route
      if (targetRoute && location.pathname !== targetRoute) {
        navigate(targetRoute)
      }
    }
  }, [currentStepIndex, location.pathname, navigate])

  const skipTour = useCallback(() => {
    setShowWelcomeModal(false)
    setIsTourActive(false)
    if (userId) {
      saveOnboardingState(userId, { status: 'skipped', lastStep: currentStepIndex })
    }
  }, [userId, currentStepIndex])

  const finishTour = useCallback(() => {
    setShowWelcomeModal(false)
    setIsTourActive(false)
    if (userId) {
      saveOnboardingState(userId, { status: 'completed', lastStep: currentStepIndex })
    }
  }, [userId, currentStepIndex])

  const closeWelcomeModal = useCallback(() => {
    setShowWelcomeModal(false)
    if (userId) {
      saveOnboardingState(userId, { status: 'skipped', lastStep: 0 })
    }
  }, [userId])

  const replayTour = useCallback(() => {
    startTour(0)
  }, [startTour])

  const currentStep = useMemo(() => TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0], [currentStepIndex])

  const value = useMemo(
    () => ({
      showWelcomeModal,
      isTourActive,
      currentStepIndex,
      currentStep,
      totalSteps: TOUR_STEPS.length,
      startTour,
      replayTour,
      nextStep,
      prevStep,
      skipTour,
      finishTour,
      closeWelcomeModal,
    }),
    [
      showWelcomeModal,
      isTourActive,
      currentStepIndex,
      currentStep,
      startTour,
      replayTour,
      nextStep,
      prevStep,
      skipTour,
      finishTour,
      closeWelcomeModal,
    ],
  )

  return createElement(OnboardingContext.Provider, { value }, children)
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) {
    return {
      showWelcomeModal: false,
      isTourActive: false,
      currentStepIndex: 0,
      currentStep: TOUR_STEPS[0],
      totalSteps: TOUR_STEPS.length,
      startTour: () => {},
      nextStep: () => {},
      prevStep: () => {},
      skipTour: () => {},
      finishTour: () => {},
      closeWelcomeModal: () => {},
    }
  }
  return context
}
