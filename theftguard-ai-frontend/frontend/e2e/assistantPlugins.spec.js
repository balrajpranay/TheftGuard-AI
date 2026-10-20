import { test, expect } from '@playwright/test'

test.describe('TheftGuard AI — Assistant Plugins & Grounded Tools E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage and load chat workspace in demo mode
    await page.goto('/app/chat?demo=true')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.setItem('theftguard_demo_mode', 'true')
    })
    await page.reload()
    await expect(page.locator('textarea')).toBeVisible()
  })

  test('1. Renders assistant plugin selector with General Assistant active by default', async ({ page }) => {
    const pluginRegion = page.getByRole('region', { name: /assistant plugins/i })
    await expect(pluginRegion).toBeVisible()

    // General Mode badge
    await expect(pluginRegion.getByText(/general mode/i)).toBeVisible()

    // General Assistant chip is pressed/active
    const generalChip = pluginRegion.locator('button[aria-pressed]').filter({ hasText: /general assistant/i })
    await expect(generalChip).toBeVisible()
    await expect(generalChip).toHaveAttribute('aria-pressed', 'true')

    // Verify all 7 specialized plugins exist
    await expect(pluginRegion.locator('button[aria-pressed]').filter({ hasText: /bill comparison/i })).toBeVisible()
    await expect(pluginRegion.locator('button[aria-pressed]').filter({ hasText: /bill upload & ocr/i })).toBeVisible()
    await expect(pluginRegion.locator('button[aria-pressed]').filter({ hasText: /electricity theft screening/i })).toBeVisible()
    await expect(pluginRegion.locator('button[aria-pressed]').filter({ hasText: /usage analyst/i })).toBeVisible()
    await expect(pluginRegion.locator('button[aria-pressed]').filter({ hasText: /reports & history/i })).toBeVisible()
    await expect(pluginRegion.locator('button[aria-pressed]').filter({ hasText: /bill calculator/i })).toBeVisible()
    await expect(pluginRegion.locator('button[aria-pressed]').filter({ hasText: /electricity help/i })).toBeVisible()
  })

  test('2. Toggling specialized plugins updates selection and unselects General Assistant', async ({ page }) => {
    const pluginRegion = page.getByRole('region', { name: /assistant plugins/i })
    const generalChip = pluginRegion.locator('button[aria-pressed]').filter({ hasText: /general assistant/i })
    const calcChip = pluginRegion.locator('button[aria-pressed]').filter({ hasText: /bill calculator/i })
    const helpChip = pluginRegion.locator('button[aria-pressed]').filter({ hasText: /electricity help/i })

    // Click Bill Calculator
    await calcChip.click()
    await expect(calcChip).toHaveAttribute('aria-pressed', 'true')
    await expect(generalChip).toHaveAttribute('aria-pressed', 'false')
    await expect(pluginRegion.getByText(/1 active/i)).toBeVisible()

    // Multi-select Electricity Help
    await helpChip.click()
    await expect(calcChip).toHaveAttribute('aria-pressed', 'true')
    await expect(helpChip).toHaveAttribute('aria-pressed', 'true')
    await expect(pluginRegion.getByText(/2 active/i)).toBeVisible()

    // Clicking General Assistant clears both specialized selections
    await generalChip.click()
    await expect(generalChip).toHaveAttribute('aria-pressed', 'true')
    await expect(calcChip).toHaveAttribute('aria-pressed', 'false')
    await expect(helpChip).toHaveAttribute('aria-pressed', 'false')
    await expect(pluginRegion.getByText(/general mode/i)).toBeVisible()
  })

  test('3. Quick Run button executes grounded plugin tool directly in chat', async ({ page }) => {
    const pluginRegion = page.getByRole('region', { name: /assistant plugins/i })
    const runHelpBtn = pluginRegion.getByRole('button', { name: 'Run Electricity Help & Guidance tool' })

    await runHelpBtn.click()

    // Verify user prompt and assistant response appear in conversation
    await expect(page.getByText(/run tool: electricity help/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/switch-off creep test/i)).toBeVisible({ timeout: 15000 })
  })

  test('4. Tools menu dropdown displays all 8 grounded plugins with Zero-Hallucination guarantee', async ({ page }) => {
    const toolsBtn = page.getByRole('button', { name: /open tools menu/i })
    await toolsBtn.click()

    const menu = page.getByRole('menu', { name: /application tools/i })
    await expect(menu).toBeVisible()
    await expect(menu.getByText(/zero-hallucination/i)).toBeVisible()

    // Check plugin entries inside dropdown
    await expect(menu.getByRole('menuitem', { name: /bill comparison/i })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /electricity theft screening/i })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /bill calculator/i })).toBeVisible()
    await expect(menu.getByText('Tariff Slabs', { exact: true })).toBeVisible()
  })
})
