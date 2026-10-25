import { test, expect } from '@playwright/test'

test.describe('TheftGuard AI — Frontend Authentication & Route Protection', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to start in clean unauthenticated state
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
  })

  test('1. Unauthenticated direct visit to /app/dashboard redirects to /signin', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.waitForURL('**/signin')

    expect(page.url()).toContain('/signin')
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue to the demo workspace' })).toBeVisible()
  })

  test('2. Unauthenticated direct visit to /app/investigations redirects to /signin', async ({ page }) => {
    await page.goto('/app/investigations')
    await page.waitForURL('**/signin')

    expect(page.url()).toContain('/signin')
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
  })

  test('3. Sign in form displays client validation notice when credentials are missing', async ({ page }) => {
    await page.goto('/signin')

    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Please provide both an email address and password.')).toBeVisible()
  })

  test('4. Continue to demo workspace enters demo mode and accesses dashboard', async ({ page }) => {
    await page.goto('/signin')

    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    expect(page.url()).toContain('/app/dashboard')
    // Verify Demo Badge or demo workspace indicators
    await expect(page.getByText('Demo Workspace').first()).toBeVisible()
  })

  test('5. In demo workspace, navigation through workspace routes succeeds without auth redirect', async ({ page }) => {
    // Enter demo mode via signin button
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    // Navigate to screening
    await page.goto('/app/screening')
    await expect(page).toHaveURL(/.*\/app\/screening/)

    // Navigate to AI Chat
    await page.goto('/app/chat')
    await expect(page).toHaveURL(/.*\/app\/chat/)
    await expect(page.locator('textarea')).toBeVisible()
  })

  test('6. Switch between Sign in and Create account views with Customer full name toggle', async ({ page }) => {
    await page.goto('/signin')

    // Initial sign in tab should not display full name or confirm password
    await expect(page.getByLabel('Customer full name')).not.toBeVisible()
    await expect(page.getByLabel('Confirm password')).not.toBeVisible()

    // Switch to Create account tab
    await page.getByRole('tab', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: 'Create account', level: 1 })).toBeVisible()
    await expect(page.getByLabel('Customer full name')).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Confirm password')).toBeVisible()

    // Switch back to Sign in tab
    await page.getByRole('tab', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
    await expect(page.getByLabel('Customer full name')).not.toBeVisible()
    await expect(page.getByLabel('Confirm password')).not.toBeVisible()
  })

  test('7. Registration form validates missing or whitespace customer name', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('tab', { name: 'Create account' }).click()

    await page.getByLabel('Customer full name').fill('   ')
    await page.getByLabel('Email address').fill('operator@utility.org')
    await page.getByLabel('Password', { exact: true }).fill('StrongPass123!')
    await page.getByLabel('Confirm password').fill('StrongPass123!')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Please provide your full name.')).toBeVisible()
  })

  test('8. Registration form validates password length less than 8 characters', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('tab', { name: 'Create account' }).click()

    await page.getByLabel('Customer full name').fill('Aditi Sharma')
    await page.getByLabel('Email address').fill('test@utility.org')
    await page.getByLabel('Password', { exact: true }).fill('short')
    await page.getByLabel('Confirm password').fill('short')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Password must be at least 8 characters long.')).toBeVisible()
  })

  test('9. Registration form validates mismatched passwords', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('tab', { name: 'Create account' }).click()

    await page.getByLabel('Customer full name').fill('Aditi Sharma')
    await page.getByLabel('Email address').fill('test@utility.org')
    await page.getByLabel('Password', { exact: true }).fill('StrongPass123!')
    await page.getByLabel('Confirm password').fill('DifferentPass123!')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Passwords do not match.')).toBeVisible()
  })

  test('10. In demo workspace, dashboard displays Demo Mode badge and synthetic disclaimer', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    await expect(page.getByText('Demo Mode (Local)')).toBeVisible()
    await expect(page.getByText('These customers and scores are invented for demonstration.')).toBeVisible()
  })

  test('11. Sign in view parses and displays URL hash error description from Supabase', async ({ page }) => {
    await page.goto('/signin#error_description=Email+link+is+invalid+or+has+expired')

    await expect(page.getByText('Email link is invalid or has expired')).toBeVisible()
  })

  test('12. Continue with Google button renders in both Sign in and Create account views', async ({ page }) => {
    await page.goto('/signin')

    const googleBtn = page.getByRole('button', { name: 'Continue with Google' })
    await expect(googleBtn).toBeVisible()
    await expect(googleBtn).toBeEnabled()
    await expect(page.getByText('Or sign in with email')).toBeVisible()

    // Switch to Create account tab
    await page.getByRole('tab', { name: 'Create account' }).click()
    await expect(googleBtn).toBeVisible()
    await expect(googleBtn).toBeEnabled()
    await expect(page.getByText('Or create with email')).toBeVisible()
  })

  test('13. Unauthenticated visitor visiting / remains on the public landing page', async ({ page }) => {
    await page.goto('/')

    expect(page.url()).not.toContain('/app')
    await expect(page.getByRole('heading', { name: /Analyze consumption/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open demo workspace' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('14. Authenticated user visiting / automatically navigates to /app/dashboard', async ({ page }) => {
    // Inject a valid mock Supabase session into localStorage
    await page.goto('/')
    await page.evaluate(() => {
      const mockSession = {
        access_token: 'fake-jwt-token-header.payload.signature',
        refresh_token: 'fake-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: '00000000-1111-2222-3333-444444444444',
          email: 'operator@utility.org',
          aud: 'authenticated',
          role: 'authenticated',
        },
      }
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(mockSession))
    })

    // Now navigate to public landing root
    await page.goto('/')
    await expect(page).toHaveURL(/.*\/app\/dashboard/)
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toBeVisible()
  })

  test('15. Landing page catches OAuth error parameters and redirects to /signin with error notification', async ({ page }) => {
    await page.goto('/#error=access_denied&error_description=Google+sign-in+cancelled+by+user')
    await expect(page).toHaveURL(/.*\/signin.*/)

    await expect(page.getByText('Google sign-in cancelled by user')).toBeVisible()
  })

  test('16. Password visibility toggle on Sign In page toggles between password and text', async ({ page }) => {
    await page.goto('/signin')

    const passwordInput = page.getByLabel('Password', { exact: true })
    const toggleBtn = page.getByRole('button', { name: /Show password/i })

    // Defaults to password (hidden)
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await expect(toggleBtn).toBeVisible()
    await expect(toggleBtn).toHaveAttribute('aria-label', 'Show password')

    // Fill in a password
    await passwordInput.fill('SecureUtilityPass2026!')

    // Click toggle button to reveal password
    await toggleBtn.click()

    await expect(passwordInput).toHaveAttribute('type', 'text')
    await expect(passwordInput).toHaveValue('SecureUtilityPass2026!')
    await expect(page.getByRole('button', { name: /Hide password/i })).toBeVisible()

    // Click toggle button to hide password again
    await page.getByRole('button', { name: /Hide password/i }).click()

    await expect(passwordInput).toHaveAttribute('type', 'password')
    await expect(passwordInput).toHaveValue('SecureUtilityPass2026!')
    await expect(page.getByRole('button', { name: /Show password/i })).toBeVisible()
  })

  test('17. Registration password and confirm password fields toggle visibility independently', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('tab', { name: 'Create account' }).click()

    const passwordInput = page.getByLabel('Password', { exact: true })
    const confirmPasswordInput = page.getByLabel('Confirm password')

    // Both default to password
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await expect(confirmPasswordInput).toHaveAttribute('type', 'password')

    await passwordInput.fill('FirstSecretPass1!')
    await confirmPasswordInput.fill('SecondSecretPass2!')

    // Toggle only the first password field
    const toggles = page.locator('button[aria-label="Show password"]')
    await expect(toggles).toHaveCount(2)

    await toggles.first().click()

    // First is text, second is still password
    await expect(passwordInput).toHaveAttribute('type', 'text')
    await expect(confirmPasswordInput).toHaveAttribute('type', 'password')
    await expect(passwordInput).toHaveValue('FirstSecretPass1!')
    await expect(confirmPasswordInput).toHaveValue('SecondSecretPass2!')

    // Toggle the second password field
    await page.locator('button[aria-label="Show password"]').click()

    // Now both are text
    await expect(passwordInput).toHaveAttribute('type', 'text')
    await expect(confirmPasswordInput).toHaveAttribute('type', 'text')

    // Hide the first field again
    await page.locator('button[aria-label="Hide password"]').first().click()
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await expect(confirmPasswordInput).toHaveAttribute('type', 'text')
  })

  test('18. Replay Guide launches onboarding tour from Step 1 for returning users without signout', async ({ page }) => {
    // Inject authenticated session with completed onboarding
    await page.goto('/')
    await page.evaluate(() => {
      const userId = '00000000-1111-2222-3333-444444444444'
      const mockSession = {
        access_token: 'fake-jwt-token-header.payload.signature',
        refresh_token: 'fake-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: userId,
          email: 'operator@utility.org',
          aud: 'authenticated',
          role: 'authenticated',
        },
      }
      localStorage.setItem('sb-bwsatuxmjwxousqaofhi-auth-token', JSON.stringify(mockSession))
      localStorage.setItem(`theftguard_onboarding_user_${userId}`, JSON.stringify({
        status: 'completed',
        completedAt: new Date().toISOString(),
      }))
    })

    // Navigate to dashboard
    await page.goto('/app/dashboard')
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toBeVisible()

    // Verify first-time welcome modal does NOT automatically appear (since status is completed)
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible()

    // Click Help Guide / Replay Tour in the sidebar
    const helpGuideBtn = page.locator('[data-testid="desktop-sidebar"]').locator('button[data-tour="nav-help-guide"]')
    await expect(helpGuideBtn).toBeVisible()
    await helpGuideBtn.click()

    // Verify the guided tour overlay opens at Step 1 (Welcome step)
    const tourOverlay = page.locator('[data-testid="guided-tour-overlay"]')
    await expect(tourOverlay).toBeVisible()
    await expect(tourOverlay).toContainText('Step 1 of 8')
    await expect(tourOverlay).toContainText('Welcome to TheftGuard AI')

    // Navigate to next step
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(tourOverlay).toContainText('Step 2 of 8')
    await expect(tourOverlay).toContainText('Dashboard Overview')

    // User can exit via Skip Tour
    await page.getByRole('button', { name: 'Skip Tour' }).click()
    await expect(tourOverlay).not.toBeVisible()
  })

  test('19. Help Guide button in sidebar displays bilingual / accessible label and Tour badge', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    const helpGuideBtn = page.locator('[data-testid="desktop-sidebar"]').locator('button[data-tour="nav-help-guide"]')
    await expect(helpGuideBtn).toBeVisible()
    await expect(helpGuideBtn).toContainText('Help Guide')
    await expect(helpGuideBtn).toContainText('Replay Tour')
    await expect(helpGuideBtn).toContainText(/tour/i)
  })

  test('20. Registration with immediate session navigates to dashboard and launches onboarding', async ({ page }) => {
    // Intercept Supabase signup endpoint to return an immediate authenticated session
    await page.route('**/auth/v1/signup*', async (route) => {
      const mockUser = {
        id: '11111111-2222-3333-4444-555555555555',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'fresh.operator@utility.org',
        email_confirmed_at: new Date().toISOString(),
        identities: [
          { id: 'id-1', user_id: '11111111-2222-3333-4444-555555555555', provider: 'email' },
        ],
        user_metadata: { full_name: 'Fresh Operator', preferred_language: 'en' },
      }
      const mockSession = {
        access_token: 'mock-jwt-fresh-operator-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: mockUser,
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSession),
      })
    })

    await page.goto('/signin')
    await page.getByRole('tab', { name: 'Create account' }).click()

    await page.getByLabel('Customer full name').fill('Fresh Operator')
    await page.getByLabel('Email address').fill('fresh.operator@utility.org')
    await page.getByLabel('Password', { exact: true }).fill('StrongPass2026!')
    await page.getByLabel('Confirm password').fill('StrongPass2026!')

    await page.getByRole('button', { name: 'Create account' }).click()

    // Expect immediate redirection to /app/dashboard
    await page.waitForURL('**/app/dashboard')
    expect(page.url()).toContain('/app/dashboard')

    // First-time onboarding welcome modal MUST appear automatically
    const welcomeModal = page.locator('[data-testid="welcome-modal"]')
    await expect(welcomeModal).toBeVisible()
    await expect(welcomeModal).toContainText('Welcome to TheftGuard AI!')
    await expect(welcomeModal.getByRole('button', { name: /Start Guide|Start Tour/i })).toBeVisible()

    // Clicking Start Guide launches the interactive 8-step product tour overlay
    await welcomeModal.getByRole('button', { name: /Start Guide|Start Tour/i }).click()
    const tourOverlay = page.locator('[data-testid="guided-tour-overlay"]')
    await expect(tourOverlay).toBeVisible()
    await expect(tourOverlay).toContainText('Step 1 of 8')
  })

  test('21. Registration without immediate session shows verification-required card and does not authenticate', async ({ page }) => {
    // Intercept Supabase signup to return unconfirmed user with NO session (mailer_autoconfirm: false)
    await page.route('**/auth/v1/signup*', async (route) => {
      const mockUser = {
        id: '22222222-3333-4444-5555-666666666666',
        aud: 'authenticated',
        role: '',
        email: 'unconfirmed.operator@utility.org',
        email_confirmed_at: null,
        identities: [
          { id: 'id-2', user_id: '22222222-3333-4444-5555-666666666666', provider: 'email' },
        ],
        user_metadata: { full_name: 'Unconfirmed Operator', preferred_language: 'en' },
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      })
    })

    await page.goto('/signin')
    await page.getByRole('tab', { name: 'Create account' }).click()

    await page.getByLabel('Customer full name').fill('Unconfirmed Operator')
    await page.getByLabel('Email address').fill('unconfirmed.operator@utility.org')
    await page.getByLabel('Password', { exact: true }).fill('StrongPass2026!')
    await page.getByLabel('Confirm password').fill('StrongPass2026!')

    await page.getByRole('button', { name: 'Create account' }).click()

    // Must NOT navigate to /app/dashboard
    expect(page.url()).toContain('/signin')

    // Must display the Verification Pending Card
    const verifyCard = page.locator('[data-testid="verification-pending-card"]')
    await expect(verifyCard).toBeVisible()
    await expect(verifyCard).toContainText('Check your email to verify')
    await expect(verifyCard).toContainText('unconfirmed.operator@utility.org')

    // Click "Proceed to sign in" to switch back to Sign In tab with email pre-filled
    await verifyCard.getByRole('button', { name: /Proceed to sign in/i }).click()
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
    await expect(page.getByLabel('Email address')).toHaveValue('unconfirmed.operator@utility.org')

    // Verify user is NOT authenticated by directly checking /app/dashboard redirect
    await page.goto('/app/dashboard')
    await page.waitForURL('**/signin')
    expect(page.url()).toContain('/signin')
  })

  test('22. Registration failure displays actual error message from Supabase', async ({ page }) => {
    // Intercept Supabase signup with an explicit API error
    await page.route('**/auth/v1/signup*', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'user_already_registered',
          error_description: 'An account with this email already exists.',
          msg: 'User already registered',
        }),
      })
    })

    await page.goto('/signin')
    await page.getByRole('tab', { name: 'Create account' }).click()

    await page.getByLabel('Customer full name').fill('Existing Operator')
    await page.getByLabel('Email address').fill('already.exists@utility.org')
    await page.getByLabel('Password', { exact: true }).fill('StrongPass2026!')
    await page.getByLabel('Confirm password').fill('StrongPass2026!')

    await page.getByRole('button', { name: 'Create account' }).click()

    // Verify error notification is displayed
    await expect(page.getByText('An account with this email address already exists. Please sign in instead.')).toBeVisible()
  })
})
