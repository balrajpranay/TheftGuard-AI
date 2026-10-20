import { test, expect } from '@playwright/test'

test.describe('TheftGuard AI — Mobile Responsiveness & Multi-Viewport Verification', () => {
  const VIEWPORTS = [
    { name: 'Ultra-compact mobile (320px)', width: 320, height: 568 },
    { name: 'Standard mobile (375px)', width: 375, height: 667 },
    { name: 'Modern mobile (390px)', width: 390, height: 844 },
    { name: 'Large mobile (430px)', width: 430, height: 932 },
  ]

  for (const vp of VIEWPORTS) {
    test(`Landing & Auth — Fits within viewport on ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/')

      // No horizontal overflow on landing page
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalScroll).toBe(false)

      // Heading and action buttons are visible
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('link', { name: /Open demo/i }).first()).toBeVisible()

      // Navigate to SignIn
      await page.goto('/signin')
      const signinScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(signinScroll).toBe(false)

      // Tabs and button accessible
      await expect(page.getByRole('tab', { name: /Sign in/i })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Create account/i })).toBeVisible()
    })

    test(`Workspace Dashboard & Mobile Nav — Adapts on ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })

      // Clear storage and enter demo mode
      await page.goto('/signin')
      await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
      await page.waitForURL('**/app/dashboard')

      // Desktop rail should be hidden on mobile
      const desktopSidebar = page.locator('[data-testid="desktop-sidebar"]')
      await expect(desktopSidebar).toBeHidden()

      // Mobile nav bar should be visible with hamburger button
      const openNavBtn = page.getByRole('button', { name: 'Open navigation' })
      await expect(openNavBtn).toBeVisible()

      // Open mobile drawer
      await openNavBtn.click()
      const mobileDrawer = page.getByRole('dialog', { name: 'Mobile navigation' })
      await expect(mobileDrawer).toBeVisible()

      // Drawer navigation links exist
      await expect(mobileDrawer.getByRole('link', { name: /Overview/i })).toBeVisible()
      await expect(mobileDrawer.getByRole('link', { name: /AI Chat/i })).toBeVisible()
      await expect(mobileDrawer.getByRole('link', { name: /Bill comparison/i })).toBeVisible()

      // Close mobile drawer
      const closeNavBtn = mobileDrawer.getByRole('button', { name: 'Close navigation' })
      await closeNavBtn.click()
      await expect(mobileDrawer).toBeHidden()

      // Verify no horizontal page blowout
      const dashboardScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(dashboardScroll).toBe(false)

      // Global AI Assistant trigger button is visible and tap-accessible
      const askAssistantBtn = page.getByRole('button', { name: /Ask.*Assistant/i })
      await expect(askAssistantBtn).toBeVisible()

      // Open AI Assistant drawer
      await askAssistantBtn.click()
      const assistantDrawer = page.getByRole('dialog', { name: /AI Bill Assistant/i })
      await expect(assistantDrawer).toBeVisible()

      // Tabs are rendered and accessible
      await expect(assistantDrawer.getByRole('button', { name: /Chat Assistant/i })).toBeVisible()
      await expect(assistantDrawer.getByRole('button', { name: /Household Usage Profile/i })).toBeVisible()

      // Close Assistant drawer
      const closeAssistantBtn = assistantDrawer.getByRole('button', { name: 'Close assistant' })
      await closeAssistantBtn.click()
      await expect(assistantDrawer).toBeHidden()
    })
  }

  test('375px — Bill Comparison & Upload mobile usability', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    // Navigate to Bill Comparison
    await page.goto('/app/bill-comparison')
    const billCompScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(billCompScroll).toBe(false)

    // Load sample Telangana bills
    const loadSampleBtn = page.getByRole('button', { name: /Load Telangana Sample Bills/i })
    await expect(loadSampleBtn).toBeVisible()
    await loadSampleBtn.click()

    // Metric cards and verified findings are rendered
    await expect(page.getByText('Billed Consumption', { exact: true })).toBeVisible()
    await expect(page.getByText('Verified Findings')).toBeVisible()

    // Navigate to Bill Upload
    await page.goto('/app/bill-upload')
    const billUploadScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(billUploadScroll).toBe(false)

    // Check file input exists and accepts phone camera/gallery
    const fileInput = page.locator('#bill-file-input')
    const acceptAttr = await fileInput.getAttribute('accept')
    expect(acceptAttr).toContain('image/*')
    expect(acceptAttr).toContain('application/pdf')
  })

  test('390px — Results, Investigations, Reports, and Settings responsiveness', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    // Results page
    await page.goto('/app/results')
    await expect(page.getByRole('heading', { level: 1, name: /Results|ఫలితాలు|परिणाम/i })).toBeVisible()
    let hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow).toBe(false)

    // Check demo indicators are present on demo records
    await expect(page.locator('table').getByText('Demo').first()).toBeVisible()

    // Investigations page
    await page.goto('/app/investigations')
    await expect(page.getByRole('heading', { level: 1, name: 'Investigations' })).toBeVisible()
    hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow).toBe(false)

    // Reports page
    await page.goto('/app/reports')
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible()
    hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow).toBe(false)

    // Settings page
    await page.goto('/app/settings')
    await expect(page.getByRole('heading', { level: 1, name: /Settings/i })).toBeVisible()
    hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow).toBe(false)

    // Switch language to Telugu on mobile
    const teluguBtn = page.getByRole('radio', { name: /తెలుగు/i })
    await expect(teluguBtn).toBeVisible()
    await teluguBtn.click()
    await expect(page.getByRole('status')).toBeVisible()

    // Revert to English
    await page.getByRole('radio', { name: /English/i }).click()
  })

  test('430px — AI Chat Workspace & Assistant Plugins on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 })
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    // Navigate to Chat Workspace
    await page.goto('/app/chat')
    const chatScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(chatScroll).toBe(false)

    // Verify floating assistant trigger button is hidden on dedicated chat route so it never obstructs the composer
    const floatingBtn = page.getByRole('button', { name: /Ask.*Assistant/i })
    await expect(floatingBtn).toBeHidden()

    // Trust badges verify grounded responses without zero-hallucination claims
    await expect(page.getByText(/Grounded Responses/i).first()).toBeVisible()
    await expect(page.getByText(/Transparent Limitations/i).first()).toBeVisible()

    // History drawer button on mobile
    const historyBtn = page.getByRole('button', { name: 'Toggle conversation history' })
    await expect(historyBtn).toBeVisible()

    // Plugin chip selector is visible
    await expect(page.getByRole('region', { name: 'Assistant Plugins' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'General Assistant' })).toBeVisible()

    // Send a message using the composer
    const textarea = page.locator('textarea')
    await textarea.fill('What is kWh?')
    const sendBtn = page.getByRole('button', { name: 'Send Message' })
    await sendBtn.click()

    // User message and assistant response bubble appear
    await expect(page.locator('p', { hasText: 'What is kWh?' })).toBeVisible()
    await expect(page.getByText(/kilowatt-hour/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('1280px Desktop — Preserves full desktop sidebar layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    // Desktop sidebar rail is visible
    const desktopSidebar = page.locator('[data-testid="desktop-sidebar"]')
    await expect(desktopSidebar).toBeVisible()
    await expect(desktopSidebar).toHaveClass(/w-64/)

    // Mobile nav bar is hidden
    const mobileHeader = page.locator('.on-dark.sticky.top-0')
    await expect(mobileHeader).toBeHidden()
  })

  test('375px — Floating AI assistant button is suppressed when drawer or mobile nav is active', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    // Floating trigger button is visible when drawer is closed
    const floatingBtn = page.getByRole('button', { name: /Ask.*Assistant/i })
    await expect(floatingBtn).toBeVisible()

    // Open mobile nav menu
    const openNavBtn = page.getByRole('button', { name: 'Open navigation' })
    await openNavBtn.click()
    await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible()

    // Floating trigger must be hidden while menu is open
    await expect(floatingBtn).toBeHidden()

    // Close mobile nav
    await page.getByRole('button', { name: 'Close navigation' }).click()
    await expect(floatingBtn).toBeVisible()

    // Open assistant drawer
    await floatingBtn.click()
    await expect(page.getByRole('dialog', { name: /AI Bill Assistant/i })).toBeVisible()

    // Floating trigger must remain hidden while drawer is open
    await expect(floatingBtn).toBeHidden()

    // Close assistant drawer
    await page.getByRole('button', { name: 'Close assistant' }).click()
    await expect(floatingBtn).toBeVisible()
  })

  const OVERFLOW_WIDTHS = [320, 375, 390, 430]
  for (const w of OVERFLOW_WIDTHS) {
    test(`Landing page — Zero horizontal overflow at ${w}px across EN, HI, TE`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 750 })
      await page.goto('/')

      for (const lang of ['en', 'hi', 'te']) {
        await page.evaluate((l) => {
          localStorage.setItem('theftguard_lang', l)
        }, lang)
        await page.reload()
        await page.waitForLoadState('domcontentloaded')

        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
        expect(hasOverflow).toBe(false)
      }
    })
  }
})
