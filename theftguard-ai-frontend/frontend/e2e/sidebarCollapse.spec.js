import { test, expect } from '@playwright/test'

test.describe('TheftGuard AI — Collapsible Sidebar & ChatGPT-style Tooltips', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage and enter demo workspace
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toBeVisible()
  })

  test('1. Toggles desktop sidebar between expanded (w-64) and collapsed (w-16) via button click', async ({ page }) => {
    const sidebar = page.locator('[data-testid="desktop-sidebar"]')

    // Initially expanded
    await expect(sidebar).toHaveClass(/w-64/)
    await expect(sidebar.getByText('AI Chat')).toBeVisible()

    // Click collapse button
    const collapseBtn = sidebar.getByRole('button', { name: /Collapse sidebar/i })
    await collapseBtn.click()

    // Should now be compact
    await expect(sidebar).toHaveClass(/w-16/)
    await expect(sidebar.getByRole('button', { name: /Expand sidebar/i })).toBeVisible()

    // Click expand button
    const expandBtn = sidebar.getByRole('button', { name: /Expand sidebar/i })
    await expandBtn.click()

    // Should be expanded again
    await expect(sidebar).toHaveClass(/w-64/)
    await expect(sidebar.getByText('AI Chat')).toBeVisible()
  })

  test('2. Toggles sidebar using Ctrl+Shift+S keyboard shortcut', async ({ page }) => {
    const sidebar = page.locator('[data-testid="desktop-sidebar"]')

    await expect(sidebar).toHaveClass(/w-64/)

    // Press shortcut to collapse
    await page.keyboard.press('Control+Shift+KeyS')
    await expect(sidebar).toHaveClass(/w-16/)

    // Press shortcut to expand
    await page.keyboard.press('Control+Shift+KeyS')
    await expect(sidebar).toHaveClass(/w-64/)
  })

  test('3. Suppresses Ctrl+Shift+S keyboard shortcut when user is typing in an input or textarea', async ({ page }) => {
    const sidebar = page.locator('[data-testid="desktop-sidebar"]')
    await expect(sidebar).toHaveClass(/w-64/)

    // Navigate to AI Chat where textarea is present
    await page.goto('/app/chat')
    const chatInput = page.locator('textarea')
    await expect(chatInput).toBeVisible()

    // Focus and type in the textarea
    await chatInput.focus()
    await chatInput.fill('Checking shortcut guard')

    // Press shortcut while textarea is focused
    await page.keyboard.press('Control+Shift+KeyS')

    // Sidebar should remain expanded
    await expect(sidebar).toHaveClass(/w-64/)
    await expect(chatInput).toBeFocused()
  })

  test('4. Persists collapsed state across page navigation and refresh', async ({ page }) => {
    const sidebar = page.locator('[data-testid="desktop-sidebar"]')

    // Collapse sidebar
    await sidebar.getByRole('button', { name: /Collapse sidebar/i }).click()
    await expect(sidebar).toHaveClass(/w-16/)

    // Verify localStorage key
    const storedVal = await page.evaluate(() => localStorage.getItem('theftguard_sidebar_collapsed_v1'))
    expect(storedVal).toBe('true')

    // Reload page
    await page.reload()
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toHaveClass(/w-16/)

    // Expand sidebar and verify persistence
    await page.locator('[data-testid="desktop-sidebar"]').getByRole('button', { name: /Expand sidebar/i }).click()
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toHaveClass(/w-64/)

    const updatedVal = await page.evaluate(() => localStorage.getItem('theftguard_sidebar_collapsed_v1'))
    expect(updatedVal).toBe('false')
  })

  test('5. Displays ChatGPT-style tooltip on hover in collapsed mode and dismisses on pointer leave or Escape', async ({ page }) => {
    const sidebar = page.locator('[data-testid="desktop-sidebar"]')

    // Collapse sidebar
    await sidebar.getByRole('button', { name: /Collapse sidebar/i }).click()
    await expect(sidebar).toHaveClass(/w-16/)

    const tooltip = page.locator('[role="tooltip"]')
    await expect(tooltip).not.toBeVisible()

    // Hover over AI Chat icon
    const chatIcon = sidebar.locator('a[aria-label="AI Chat"]')
    await chatIcon.hover()

    // Tooltip should appear
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText('AI Chat')
    await expect(tooltip).toContainText('AI')

    // Move pointer away
    await page.mouse.move(0, 0)
    await expect(tooltip).not.toBeVisible()

    // Hover again and press Escape
    await chatIcon.hover()
    await expect(tooltip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tooltip).not.toBeVisible()
  })

  test('6. Does NOT display tooltips when sidebar is expanded', async ({ page }) => {
    const sidebar = page.locator('[data-testid="desktop-sidebar"]')
    await expect(sidebar).toHaveClass(/w-64/)

    const tooltip = page.locator('[role="tooltip"]')
    await expect(tooltip).not.toBeVisible()

    // Hover over AI Chat link in expanded sidebar
    const chatLink = sidebar.getByRole('link', { name: /AI Chat/i })
    await chatLink.hover()

    // Tooltip should not be displayed because label is already visible
    await expect(tooltip).not.toBeVisible()
  })

  test('7. Mobile navigation drawer opens and closes cleanly on small screen', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 })

    // Desktop sidebar should be hidden
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toBeHidden()

    // Open mobile menu
    const menuBtn = page.getByRole('button', { name: /Open navigation/i })
    await expect(menuBtn).toBeVisible()
    await menuBtn.click()

    // Mobile drawer should open
    const drawer = page.getByRole('dialog', { name: /Mobile navigation/i })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('link', { name: /AI Chat/i })).toBeVisible()

    // Close using close button
    const closeBtn = drawer.getByRole('button', { name: /Close navigation/i })
    await closeBtn.click()
    await expect(drawer).toBeHidden()

    // Reopen and close with Escape key
    await menuBtn.click()
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  })
})
