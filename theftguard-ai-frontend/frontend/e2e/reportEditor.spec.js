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

  test('7. Renders report type selector and switches between Department and Customer Report', async ({ page }) => {
    const deptBtn = page.locator('[data-testid="report-type-department"]')
    const custBtn = page.locator('[data-testid="report-type-customer"]')

    await expect(deptBtn).toBeVisible()
    await expect(custBtn).toBeVisible()
    await expect(deptBtn).toHaveAttribute('aria-checked', 'true')

    // Initial preview is Department report
    const preview = page.locator('article[aria-label="Report preview"]')
    await expect(preview.getByRole('heading', { level: 2 })).toHaveText('Screening and consumption review')

    // Switch to Customer Report
    await custBtn.click()
    await expect(custBtn).toHaveAttribute('aria-checked', 'true')
    await expect(deptBtn).toHaveAttribute('aria-checked', 'false')

    // Customer builder panels should be visible
    await expect(page.locator('#r-cust-name')).toBeVisible()
    await expect(page.locator('#r-cust-conn')).toBeVisible()
    await expect(page.locator('#r-cust-category')).toBeVisible()
    await expect(page.locator('#r-cust-period')).toBeVisible()

    // Customer preview heading should be visible
    await expect(preview.getByRole('heading', { level: 2 })).toHaveText('Customer Electricity Report')

    // Switch back to Department Report
    await deptBtn.click()
    await expect(deptBtn).toHaveAttribute('aria-checked', 'true')
    await expect(preview.getByRole('heading', { level: 2 })).toHaveText('Screening and consumption review')
  })

  test('8. Populates Customer Electricity Report with live preview, calculated variance, and statement badges', async ({ page }) => {
    // Switch to Customer Report
    await page.locator('[data-testid="report-type-customer"]').click()
    const preview = page.locator('article[aria-label="Report preview"]')

    // Fill consumer details
    await page.locator('#r-cust-name').fill('Smt. Ananya Sen')
    await page.locator('#r-cust-conn').fill('USC-4091882 / Meter #M-9021')
    await page.locator('#r-cust-category').selectOption('Unexpected high bill')
    await page.locator('#r-cust-period').fill('September 2026')

    // Verify identification card
    await expect(preview.locator('[data-testid="preview-customer-name"]')).toHaveText('Smt. Ananya Sen')
    await expect(preview.locator('[data-testid="preview-connection-ref"]')).toHaveText('USC-4091882 / Meter #M-9021')
    await expect(preview.locator('[data-testid="preview-complaint-badge"]')).toHaveText('Unexpected high bill')

    // Fill comparative billing and meter readings
    await page.locator('#r-cust-prev-amt').fill('2000')
    await page.locator('#r-cust-curr-amt').fill('3500')
    await page.locator('#r-cust-prev-read').fill('1000')
    await page.locator('#r-cust-curr-read').fill('1200')
    await page.locator('#r-cust-billed-units').fill('280')

    // Verify comparative metrics
    await expect(preview.locator('[data-testid="preview-amount-diff"]')).toContainText('+₹1,500 (+75.0%)')
    await expect(preview.locator('[data-testid="preview-reading-units"]')).toHaveText('200 kWh')
    await expect(preview.locator('[data-testid="preview-billed-units"]')).toHaveText('280 kWh')
    await expect(preview.locator('[data-testid="preview-units-discrepancy"]')).toContainText('Billed units exceed the meter reading increment by +80 kWh')

    // Fill customer statements
    await page.locator('#r-cust-issue').fill('Unusually high bill received for September despite house being closed for 2 weeks.')
    await page.locator('#r-cust-resolution').fill('Request site inspection, meter accuracy testing, and bill recalculation.')
    await page.locator('#r-cust-evidence').fill('Attached electricity bills for July, August, and September 2026.')
    await page.locator('#r-cust-notes').fill('Consumer hereby confirms connected load remains 2 kW domestic.')

    // Verify custom statements rendered with badges
    const issueSection = preview.locator('[data-testid="section-customer-issue"]')
    await expect(issueSection).toBeVisible()
    await expect(issueSection.getByText('Customer Statement')).toBeVisible()
    await expect(issueSection).toContainText('Unusually high bill received for September')

    const resSection = preview.locator('[data-testid="section-customer-resolution"]')
    await expect(resSection).toBeVisible()
    await expect(resSection.getByText('Customer Statement')).toBeVisible()
    await expect(resSection).toContainText('Request site inspection')

    const evidSection = preview.locator('[data-testid="section-customer-evidence"]')
    await expect(evidSection).toBeVisible()
    await expect(evidSection.getByText('Customer Statement')).toBeVisible()
    await expect(evidSection).toContainText('Attached electricity bills')

    const notesSection = preview.locator('[data-testid="section-customer-notes"]')
    await expect(notesSection).toBeVisible()
    await expect(notesSection.getByText('Customer Statement')).toBeVisible()
    await expect(notesSection).toContainText('Consumer hereby confirms connected load')
  })

  test('9. Displays required neutral grievance disclaimer on Customer Electricity Report', async ({ page }) => {
    await page.locator('[data-testid="report-type-customer"]').click()
    const preview = page.locator('article[aria-label="Report preview"]')

    const disclaimer = preview.locator('[data-testid="customer-report-disclaimer"]')
    await expect(disclaimer).toBeVisible()
    await expect(disclaimer).toContainText('Official Notice & Disclaimer:')
    await expect(disclaimer).toContainText('documents a billing or meter grievance and does not establish that a billing error or electricity theft occurred')
    await expect(disclaimer).toContainText('Official verification and on-site inspection by authorized utility personnel is required')
  })
})

function assertOrder(array, first, second) {
  const i1 = array.indexOf(first)
  const i2 = array.indexOf(second)
  if (i1 === -1 || i2 === -1 || i1 >= i2) {
    throw new Error(`Expected "${first}" (index ${i1}) to appear before "${second}" (index ${i2}) in [${array.join(', ')}]`)
  }
}
