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
    await expect(page.getByLabel('Password')).toBeVisible()
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
})
