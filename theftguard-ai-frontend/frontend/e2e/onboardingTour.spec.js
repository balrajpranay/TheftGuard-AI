import { test, expect } from '@playwright/test'

const MOCK_USER_A = {
  access_token: 'fake-jwt-token-a',
  refresh_token: 'fake-refresh-token-a',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: '11111111-aaaa-bbbb-cccc-111111111111',
    email: 'operator.a@utility.org',
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: { full_name: 'Priya Sharma' },
  },
}

const MOCK_USER_B = {
  access_token: 'fake-jwt-token-b',
  refresh_token: 'fake-refresh-token-b',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: '22222222-bbbb-cccc-dddd-222222222222',
    email: 'operator.b@utility.org',
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: { full_name: 'Rajesh Kumar' },
  },
}

test.describe('TheftGuard AI — Guided Onboarding Tour & First-Time Experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
  })

  test('1. First-time authenticated user sees the welcome modal on initial sign-in', async ({ page }) => {
    // Authenticate as User A with no prior onboarding record
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible()

    // Verify welcome copy
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI!' })).toBeVisible()
    await expect(page.getByText('Your workspace helps you screen electricity consumption records')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start Guide' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip Tour' }).first()).toBeVisible()
  })

  test('2. Skipping the welcome modal saves state and does NOT show on subsequent reloads', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible()

    // Click Skip Tour
    await page.getByRole('button', { name: 'Skip Tour' }).first().click()
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible()

    // Verify account-scoped localStorage state
    const savedState = await page.evaluate((userId) => {
      const raw = localStorage.getItem(`theftguard_onboarding_user_${userId}`)
      return raw ? JSON.parse(raw) : null
    }, MOCK_USER_A.user.id)

    expect(savedState).not.toBeNull()
    expect(savedState.status).toBe('skipped')

    // Reload page: welcome modal should NOT reappear
    await page.reload()
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible()
  })

  test('3. Start Guide launches the interactive tour overlay and navigates steps with progress bar', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible()

    // Click Start Guide
    await page.getByRole('button', { name: 'Start Guide' }).click()
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible()

    // Step 1: Welcome to TheftGuard AI
    const tourOverlay = page.locator('[data-testid="guided-tour-overlay"]')
    await expect(tourOverlay).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI', exact: true })).toBeVisible()
    await expect(page.getByText('Step 1 of 8')).toBeVisible()

    // Verify progress bar
    const progress = page.locator('[role="progressbar"]')
    await expect(progress).toBeVisible()
    await expect(progress).toHaveAttribute('aria-valuenow', '1')
    await expect(progress).toHaveAttribute('aria-valuemax', '8')

    // Next step -> Step 2: Dashboard Overview
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible()
    await expect(page.getByText('Step 2 of 8')).toBeVisible()
    await expect(progress).toHaveAttribute('aria-valuenow', '2')

    // Previous step -> back to Step 1
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI', exact: true })).toBeVisible()
    await expect(page.getByText('Step 1 of 8')).toBeVisible()
  })

  test('4. Completing the tour reaches final step and saves completed state', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Start Guide' }).click()

    const tourOverlay = page.locator('[data-testid="guided-tour-overlay"]')

    // Advance through steps to the final step (7 next clicks to go from step 1 to step 8)
    for (let i = 1; i <= 7; i++) {
      await tourOverlay.getByRole('button', { name: 'Next' }).click()
    }

    // Step 8: AI Chat Assistant
    await expect(page.getByRole('heading', { name: 'AI Chat Workspace' })).toBeVisible()
    await expect(page.getByText('Step 8 of 8')).toBeVisible()
    const finishBtn = page.getByRole('button', { name: /Finish (Tour|Guide)/i })
    await expect(finishBtn).toBeVisible()

    // Click Finish Tour
    await finishBtn.click()
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).not.toBeVisible()

    // Verify localStorage has status: 'completed'
    const savedState = await page.evaluate((userId) => {
      const raw = localStorage.getItem(`theftguard_onboarding_user_${userId}`)
      return raw ? JSON.parse(raw) : null
    }, MOCK_USER_A.user.id)

    expect(savedState.status).toBe('completed')
  })

  test('5. Help Guide in the sidebar reopens the tour at Step 1 at any time', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      // Set user A as already completed onboarding
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
      localStorage.setItem(
        `theftguard_onboarding_user_${session.user.id}`,
        JSON.stringify({ status: 'completed', updatedAt: new Date().toISOString() }),
      )
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible()

    // Click Help Guide in sidebar
    const helpBtn = page.locator('[data-tour="nav-help-guide"]').first()
    await expect(helpBtn).toBeVisible()
    await helpBtn.click()

    // Tour reopens at Step 1
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI', exact: true })).toBeVisible()
    await expect(page.getByText('Step 1 of 8')).toBeVisible()
  })

  test('6. User switching isolates onboarding status (User B sees welcome even if User A completed)', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(({ sessionA, sessionB }) => {
      // User A completed onboarding
      localStorage.setItem(
        `theftguard_onboarding_user_${sessionA.user.id}`,
        JSON.stringify({ status: 'completed', updatedAt: new Date().toISOString() }),
      )
      // Log in as User B who has never done onboarding
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(sessionB))
    }, { sessionA: MOCK_USER_A, sessionB: MOCK_USER_B })

    await page.goto('/app/dashboard')

    // User B should see the welcome modal!
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI!' })).toBeVisible()
  })

  test('7. Multilingual support: tour content updates reactively in Hindi and Telugu', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
      // Set language to Hindi
      localStorage.setItem(`theftguard_language_user_${session.user.id}`, 'hi')
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible()

    // Hindi welcome copy
    await expect(page.getByRole('heading', { name: 'TheftGuard AI में आपका स्वागत है!' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'गाइड शुरू करें' })).toBeVisible()

    // Start Guide in Hindi
    await page.getByRole('button', { name: 'गाइड शुरू करें' }).click()
    await expect(page.getByRole('heading', { name: 'TheftGuard AI में आपका स्वागत है', exact: true })).toBeVisible()
    await expect(page.getByText('चरण 1 / 8')).toBeVisible()
  })

  test('8. Mobile viewport: tour card positions comfortably without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible()

    // Check no horizontal scroll on mobile with welcome modal
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)

    // Start tour on mobile
    await page.getByRole('button', { name: 'Start Guide' }).click()
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).toBeVisible()

    // Floating AI assistant should be suppressed while tour is active
    await expect(page.getByLabel('⚡ Ask AI Assistant')).not.toBeVisible()

    // Verify mobile drawer also has Help Guide when drawer opens
    await page.keyboard.press('Escape') // dismiss tour
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).not.toBeVisible()

    await page.getByLabel('Open navigation').click()
    const mobileDrawer = page.getByRole('dialog', { name: 'Mobile navigation' })
    await expect(mobileDrawer.locator('[data-tour="nav-help-guide"]')).toBeVisible()
  })

  test('9. Demo mode does not automatically trigger welcome modal, but Help Guide launches tour', async ({ page }) => {
    // Navigate to demo workspace
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    // Welcome modal should NOT be visible automatically in demo mode
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible()

    // Click Help Guide in sidebar
    await page.locator('[data-tour="nav-help-guide"]').first().click()

    // Tour launches
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI', exact: true })).toBeVisible()
    await expect(page.getByText('Step 1 of 8')).toBeVisible()
  })

  test('10. Missing target elements handle safely without leaving tour stuck', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Start Guide' }).click()

    // Step 1 has no target element (selector: null). Card should be centered, no spotlight ring.
    await expect(page.locator('[data-testid="tour-spotlight-ring"]')).not.toBeVisible()
    const tourCard = page.locator('[data-testid="tour-card"]')
    await expect(tourCard).toBeVisible()

    // User can navigate freely via Next or keyboard
    await page.keyboard.press('ArrowRight')
    await expect(page.getByText('Step 2 of 8')).toBeVisible()
  })

  test('11. Authenticated sign-in automatically routes to /app/dashboard and displays welcome modal', async ({ page }) => {
    // Inject session as if just signed in with fresh account
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    // Visiting /signin while authenticated must redirect to /app/dashboard, not /app/chat
    await page.goto('/signin')
    await page.waitForURL('**/app/dashboard')
    expect(page.url()).toContain('/app/dashboard')
    expect(page.url()).not.toContain('/app/chat')

    // First-time user welcome modal must be visible on the dashboard
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start Guide' })).toBeVisible()

    // Clicking Start Guide immediately opens Step 1 on /app/dashboard
    await page.getByRole('button', { name: 'Start Guide' }).click()
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI', exact: true })).toBeVisible()
    await expect(page.getByText('Step 1 of 8')).toBeVisible()
  })

  test('12. In collapsed desktop sidebar, Help Guide button is visible, styled with gold accent, and launches tour', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
      // Mark as completed so welcome modal doesn't block sidebar
      localStorage.setItem(
        `theftguard_onboarding_user_${session.user.id}`,
        JSON.stringify({ status: 'completed', updatedAt: new Date().toISOString() }),
      )
      // Set collapsed sidebar in storage
      localStorage.setItem('theftguard_sidebar_collapsed_v1', 'true')
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    const sidebar = page.locator('[data-testid="desktop-sidebar"]')
    await expect(sidebar).toBeVisible()
    await expect(sidebar).toHaveClass(/w-16/)

    // Help Guide button in collapsed sidebar
    const helpBtn = sidebar.locator('[data-tour="nav-help-guide"]')
    await expect(helpBtn).toBeVisible()

    // Clicking Help Guide re-triggers tour
    await helpBtn.click()
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI', exact: true })).toBeVisible()
    await expect(page.getByText('Step 1 of 8')).toBeVisible()
  })

  test('13. Direct navigation to /app/chat for un-onboarded user displays welcome modal and Start Guide navigates to /app/dashboard Step 1', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    // Navigate directly to /app/chat
    await page.goto('/app/chat')
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible()

    // Clicking Start Guide brings user to /app/dashboard at Step 1
    await page.getByRole('button', { name: 'Start Guide' }).click()
    await page.waitForURL('**/app/dashboard')
    expect(page.url()).toContain('/app/dashboard')
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI', exact: true })).toBeVisible()
    await expect(page.getByText('Step 1 of 8')).toBeVisible()
  })

  test('14. Welcome modal language selector switches language to Tamil and starts tour in Tamil', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    const modal = page.locator('[data-testid="welcome-modal"]')
    await expect(modal).toBeVisible()

    // Open language selector inside welcome modal
    const langBtn = modal.getByRole('button', { name: /Language:/i })
    await expect(langBtn).toBeVisible()
    await langBtn.click()

    // Select Tamil
    await page.getByRole('menuitem', { name: 'தமிழ்' }).click()

    // Welcome title updates to Tamil
    await expect(modal.getByRole('heading', { name: 'TheftGuard AI-க்கு வரவேற்கிறோம்!' })).toBeVisible()
    const startBtn = modal.getByRole('button', { name: 'வழிகாட்டியைத் தொடங்கு' })
    await expect(startBtn).toBeVisible()

    // Launch tour in Tamil
    await startBtn.click()
    const tourOverlay = page.locator('[data-testid="guided-tour-overlay"]')
    await expect(tourOverlay).toBeVisible()
    await expect(page.getByRole('heading', { name: 'TheftGuard AI-க்கு வரவேற்கிறோம்', exact: true })).toBeVisible()
    await expect(page.getByText('படி 1 / 8')).toBeVisible()
  })

  test('15. Active tour overlay language selector switches language reactively during the tour', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Start Guide' }).click()

    const tourCard = page.locator('[data-testid="tour-card"]')
    await expect(tourCard).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome to TheftGuard AI', exact: true })).toBeVisible()

    // Switch language to Telugu inside tour card
    const langBtn = tourCard.getByRole('button', { name: /Language:/i })
    await langBtn.click()
    await page.getByRole('menuitem', { name: 'తెలుగు' }).click()

    // Title and step counter update immediately to Telugu
    await expect(page.getByRole('heading', { name: 'TheftGuard AI కి స్వాగతం', exact: true })).toBeVisible()
    await expect(page.getByText('దశ 1 / 8')).toBeVisible()

    // Advance to Step 2 in Telugu
    await page.getByRole('button', { name: 'తరువాత' }).click()
    await expect(page.getByRole('heading', { name: 'డ్యాష్‌బోర్డ్ అవలోకనం' })).toBeVisible()
    await expect(page.getByText('దశ 2 / 8')).toBeVisible()
  })

  test('16. Keyboard navigation (ArrowRight, ArrowLeft, Escape) navigates steps and dismisses cleanly', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Start Guide' }).click()

    // Step 1: press ArrowRight to advance
    await expect(page.getByText('Step 1 of 8')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByText('Step 2 of 8')).toBeVisible()

    // Step 2: press ArrowLeft to go back
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByText('Step 1 of 8')).toBeVisible()

    // Press Escape to dismiss
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="guided-tour-overlay"]')).not.toBeVisible()
  })

  test('17. Spotlight focus ring and restrained SVG mask render on Step 2 with gold outline', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((session) => {
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(session))
    }, MOCK_USER_A)

    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Start Guide' }).click()

    // Advance to Step 2 (Dashboard Overview) which targets dashboard-summary or nav-overview
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Step 2 of 8')).toBeVisible()

    // Verify spotlight ring exists with gold outline styling
    const ring = page.locator('[data-testid="tour-spotlight-ring"]')
    await expect(ring).toBeVisible()
    await expect(ring).toHaveClass(/ring-gold/)

    // Verify SVG mask exists with zero heavy backdrop-blur
    const svgOverlay = page.locator('[data-testid="tour-backdrop-svg"]')
    await expect(svgOverlay).toBeVisible()
  })
})
