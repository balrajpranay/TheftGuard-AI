import { test, expect } from '@playwright/test'

test.describe('TheftGuard AI — Report Editor & Custom Commentary Sections', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage and navigate to Reports page in demo mode
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')
    await page.goto('/app/reports')
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
  })

  test('1. Renders Report Editor panel with all five editable fields', async ({ page }) => {
    const editor = page.locator('section').filter({ hasText: 'Report Editor' })
    await expect(editor).toBeVisible()

    await expect(page.locator('#r-dept')).toBeVisible()
    await expect(page.locator('#r-exec-summary')).toBeVisible()
    await expect(page.locator('#r-observations')).toBeVisible()
    await expect(page.locator('#r-recommendations')).toBeVisible()
    await expect(page.locator('#r-notes')).toBeVisible()

    // Title and Prepared by in Report details panel remain unchanged
    await expect(page.locator('#r-title')).toBeVisible()
    await expect(page.locator('#r-author')).toBeVisible()
    await expect(page.locator('#r-period')).toBeVisible()
  })

  test('2. Updates preview immediately as user types in each editor field', async ({ page }) => {
    const preview = page.locator('article[aria-label="Report preview"]')

    // Initially custom sections are not present (no blank sections)
    await expect(preview.locator('[data-testid="section-executive-summary"]')).toHaveCount(0)
    await expect(preview.locator('[data-testid="section-observations"]')).toHaveCount(0)
    await expect(preview.locator('[data-testid="section-recommendations"]')).toHaveCount(0)
    await expect(preview.locator('[data-testid="section-additional-notes"]')).toHaveCount(0)

    // Fill Department
    await page.locator('#r-dept').fill('Special Vigilance Squad, South Zone')
    await expect(preview.locator('[data-testid="preview-department-badge"]')).toHaveText('Special Vigilance Squad, South Zone')
    await expect(preview).toContainText('Department: Special Vigilance Squad, South Zone')

    // Fill Executive Summary
    await page.locator('#r-exec-summary').fill('Comprehensive screening of 500 industrial feeder connections.')
    const execSection = preview.locator('[data-testid="section-executive-summary"]')
    await expect(execSection).toBeVisible()
    await expect(execSection.getByText('User Commentary')).toBeVisible()
    await expect(execSection).toContainText('Comprehensive screening of 500 industrial feeder connections.')

    // Fill Observations and Findings
    await page.locator('#r-observations').fill('Physical inspection revealed 3 bypassed meters on high-tension lines.')
    const obsSection = preview.locator('[data-testid="section-observations"]')
    await expect(obsSection).toBeVisible()
    await expect(obsSection.getByText('User Commentary')).toBeVisible()
    await expect(obsSection).toContainText('Physical inspection revealed 3 bypassed meters on high-tension lines.')

    // Fill Recommendations / Action Taken
    await page.locator('#r-recommendations').fill('Issue provisional assessment notices and recalibrate CT/PT units.')
    const recSection = preview.locator('[data-testid="section-recommendations"]')
    await expect(recSection).toBeVisible()
    await expect(recSection.getByText('User Commentary')).toBeVisible()
    await expect(recSection).toContainText('Issue provisional assessment notices and recalibrate CT/PT units.')

    // Fill Additional Notes
    await page.locator('#r-notes').fill('Case ref #TG-2026-ENF-001 under Section 135 Electricity Act.')
    const notesSection = preview.locator('[data-testid="section-additional-notes"]')
    await expect(notesSection).toBeVisible()
    await expect(notesSection.getByText('User Commentary')).toBeVisible()
    await expect(notesSection).toContainText('Case ref #TG-2026-ENF-001 under Section 135 Electricity Act.')
  })

  test('3. Custom sections appear in correct order relative to model sections', async ({ page }) => {
    const preview = page.locator('article[aria-label="Report preview"]')

    await page.locator('#r-exec-summary').fill('Order Test: Executive Summary')
    await page.locator('#r-observations').fill('Order Test: Observations')
    await page.locator('#r-recommendations').fill('Order Test: Recommendations')
    await page.locator('#r-notes').fill('Order Test: Notes')

    // Get headings in order inside article preview
    const headings = await preview.locator('h3').allTextContents()

    // Expected order:
    // 1. Executive Summary (Custom)
    // 2. Summary (Automated Model)
    // 3. Observations and Findings (Custom)
    // 4. Customers recommended for review (Automated Model)
    // 5. Consumption comparison (Automated Comparison)
    // 6. Recommendations / Action Taken (Custom)
    // 7. Additional Notes (Custom)
    // 8. Method and limitations (Automated Limitations)
    assertOrder(headings, 'Executive Summary', 'Summary')
    assertOrder(headings, 'Summary', 'Observations and Findings')
    assertOrder(headings, 'Observations and Findings', 'Customers recommended for review')
    assertOrder(headings, 'Customers recommended for review', 'Consumption comparison')
    assertOrder(headings, 'Consumption comparison', 'Recommendations / Action Taken')
    assertOrder(headings, 'Recommendations / Action Taken', 'Additional Notes')
    assertOrder(headings, 'Additional Notes', 'Method and limitations')
  })

  test('4. Toggles Report Editor expand/collapse without losing entered text', async ({ page }) => {
    const editor = page.locator('section').filter({ hasText: 'Report Editor' })

    await page.locator('#r-dept').fill('Revenue Protection Cell')
    await page.locator('#r-exec-summary').fill('Preserved text across collapse.')

    // Click Collapse
    const toggleBtn = editor.getByRole('button', { name: /Collapse/i })
    await toggleBtn.click()

    // Form fields should be hidden, summary should show count
    await expect(page.locator('#r-dept')).toHaveCount(0)
    await expect(editor.getByText(/custom field\(s\) populated/i)).toBeVisible()

    // Preview still shows the content
    const preview = page.locator('article[aria-label="Report preview"]')
    await expect(preview).toContainText('Revenue Protection Cell')
    await expect(preview).toContainText('Preserved text across collapse.')

    // Click Expand
    await editor.getByRole('button', { name: 'Expand', exact: true }).click()
    await expect(page.locator('#r-dept')).toHaveValue('Revenue Protection Cell')
    await expect(page.locator('#r-exec-summary')).toHaveValue('Preserved text across collapse.')
  })

  test('5. Existing section checkboxes continue to work alongside custom content', async ({ page }) => {
    const preview = page.locator('article[aria-label="Report preview"]')

    await page.locator('#r-exec-summary').fill('Executive summary stays visible.')

    // Uncheck "Summary" checkbox in Sections panel
    const sectionsPanel = page.locator('section').filter({ hasText: 'Sections' })
    const summaryCheckbox = sectionsPanel.locator('label').filter({ hasText: 'Summary' }).locator('input[type="checkbox"]')
    await summaryCheckbox.uncheck()

    // Automated summary is hidden, but custom executive summary remains visible
    await expect(preview.locator('h3', { hasText: /^Summary$/ })).toHaveCount(0)
    await expect(preview.locator('[data-testid="section-executive-summary"]')).toBeVisible()

    // Re-check "Summary"
    await summaryCheckbox.check()
    await expect(preview.locator('h3', { hasText: /^Summary$/ })).toBeVisible()
  })

  test('6. Long multi-line text wraps properly and preserves line breaks', async ({ page }) => {
    const preview = page.locator('article[aria-label="Report preview"]')
    const multiLine = 'Line 1: Observations commenced.\nLine 2: Discrepancy logged.\nLine 3: Notice served.'

    await page.locator('#r-observations').fill(multiLine)
    const obsSection = preview.locator('[data-testid="section-observations"]')
    await expect(obsSection).toBeVisible()

    // Verify whitespace-pre-wrap class is applied for wrapping
    const contentDiv = obsSection.locator('div.whitespace-pre-wrap')
    await expect(contentDiv).toBeVisible()
    await expect(contentDiv).toHaveText(multiLine)
  })
})

function assertOrder(array, first, second) {
  const i1 = array.indexOf(first)
  const i2 = array.indexOf(second)
  if (i1 === -1 || i2 === -1 || i1 >= i2) {
    throw new Error(`Expected "${first}" (index ${i1}) to appear before "${second}" (index ${i2}) in [${array.join(', ')}]`)
  }
}
