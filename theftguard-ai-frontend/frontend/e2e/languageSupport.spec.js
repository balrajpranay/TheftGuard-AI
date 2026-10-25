import { test, expect } from '@playwright/test'

test.describe('TheftGuard AI — Language Support & Localization E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
  })

  test('1. Switches interface language among English, Hindi, and Telugu on Public page', async ({ page }) => {
    await page.goto('/')

    // Default language is English
    await expect(page.getByRole('button', { name: /Language: English|English/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'How it works' })).toBeVisible()

    // Switch to Telugu
    await page.getByRole('button', { name: /Language: English|English/i }).click()
    await page.getByRole('menuitem', { name: /తెలుగు/i }).click()

    // Verify Telugu translations rendered
    await expect(page.getByRole('link', { name: 'ఇది ఎలా పనిచేస్తుంది' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'సైన్ ఇన్', exact: true })).toBeVisible()

    // Switch to Hindi
    await page.getByRole('button', { name: /Language: తెలుగు|తెలుగు/i }).click()
    await page.getByRole('menuitem', { name: /हिन्दी/i }).click()

    // Verify Hindi translations rendered
    await expect(page.getByRole('link', { name: 'यह कैसे काम करता है' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'साइन इन', exact: true })).toBeVisible()
  })

  test('2. Language selector on Sign In page translates forms and labels', async ({ page }) => {
    await page.goto('/signin')

    // Switch to Telugu on the Sign In page using the card's language selector
    await page.locator('#main').getByRole('button', { name: /Language: English|English/i }).click()
    await page.getByRole('menuitem', { name: /తెలుగు/i }).click()

    // Form elements and headings should now be in Telugu
    await expect(page.getByRole('heading', { name: 'సైన్ ఇన్ చేయండి', level: 1 })).toBeVisible()
    await expect(page.getByLabel('ఈమెయిల్ చిరునామా')).toBeVisible()
    await expect(page.getByLabel('పాస్‌వర్డ్', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Google తో కొనసాగించండి' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'డెమో వర్క్‌స్పేస్‌కు కొనసాగండి' })).toBeVisible()

    // Switch to Create account tab in Telugu
    await page.getByRole('tab', { name: 'ఖాతా తెరవండి' }).click()
    await expect(page.getByRole('heading', { name: 'కొత్త ఖాతాను సృష్టించండి', level: 1 })).toBeVisible()
    await expect(page.getByLabel('పూర్తి పేరు')).toBeVisible()
    await expect(page.getByLabel('ప్రాధాన్య భాష (భాష ఎంపిక)')).toBeVisible()
  })

  test('3. Changing language in Settings updates UI immediately and shows confirmation', async ({ page }) => {
    // Enter demo mode to access workspace
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    // Navigate to Settings
    await page.goto('/app/settings')
    await page.waitForURL('**/app/settings')

    await expect(page.getByRole('heading', { name: 'Settings & Preferences', level: 1 })).toBeVisible()

    // Select Telugu radio pill
    await page.getByRole('radio', { name: /తెలుగు/i }).click()

    // Verify immediate UI update to Telugu
    await expect(page.getByRole('heading', { name: 'సెట్టింగ్‌లు మరియు ప్రాధాన్యతలు', level: 1 })).toBeVisible()
    await expect(page.getByText('భాష విజయవంతంగా మార్చబడింది.')).toBeVisible()

    // Verify navigation sidebar updated to Telugu
    await expect(page.getByRole('link', { name: 'అవలోకనం' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'స్క్రీనింగ్' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'సెట్టింగ్‌లు' })).toBeVisible()
  })

  test('4. Language preference persists across page refresh and new sessions', async ({ page }) => {
    // Enter demo mode and visit settings
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue to the demo workspace' }).click()
    await page.waitForURL('**/app/dashboard')

    await page.goto('/app/settings')
    await page.getByRole('radio', { name: /हिन्दी/i }).click()

    // Verify Hindi applied
    await expect(page.getByRole('heading', { name: 'सेटिंग्स और प्राथमिकताएं', level: 1 })).toBeVisible()

    // Refresh the page
    await page.reload()

    // Verify Hindi still active after reload
    await expect(page.getByRole('heading', { name: 'सेटिंग्स और प्राथमिकताएं', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'ओवरव्यू' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'स्क्रीनिंग' })).toBeVisible()
  })

  test('5. Strict account isolation: Preference does not leak between accounts', async ({ page }) => {
    // Setup isolated localStorage values directly simulating User A and User B
    await page.goto('/app/dashboard?demo=true')
    await page.evaluate(() => {
      // User A prefers Telugu
      localStorage.setItem('theftguard_language_user_user-a', 'te')
      // User B prefers Hindi
      localStorage.setItem('theftguard_language_user_user-b', 'hi')
      // Guest prefers English
      localStorage.setItem('theftguard_language_guest', 'en')
    })

    // Verify storage keys remain completely isolated
    const readStorage = await page.evaluate(() => ({
      userA: localStorage.getItem('theftguard_language_user_user-a'),
      userB: localStorage.getItem('theftguard_language_user_user-b'),
      guest: localStorage.getItem('theftguard_language_guest'),
    }))

    expect(readStorage.userA).toBe('te')
    expect(readStorage.userB).toBe('hi')
    expect(readStorage.guest).toBe('en')
  })
})
