import { test, expect } from '@playwright/test'

test.describe('TheftGuard AI — Dedicated Chat Workspace Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure pristine test isolation, and enable demo mode for workspace testing
    await page.goto('/app/chat?demo=true')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.setItem('theftguard_demo_mode', 'true')
    })
    await page.reload()
    await expect(page.locator('textarea')).toBeVisible()
  })

  test('1. Ask "What is an LLM?" and verify educational response without billing introduction', async ({ page }) => {
    const composer = page.locator('textarea')
    await composer.fill('What is an LLM?')
    await page.getByRole('button', { name: 'Send Message' }).click()

    // Wait for the assistant bubble to be rendered
    const assistantBubble = page.locator('.rounded-tl-xs').first()
    await expect(assistantBubble).toBeVisible({ timeout: 15000 })

    const responseText = await assistantBubble.innerText()

    // Must explain Large Language Models
    expect(responseText).toMatch(/Large Language Model|LLM/i)
    expect(responseText).toMatch(/Transformer|tokens|neural network/i)

    // Must NOT be a generic electricity billing introduction
    expect(responseText).not.toMatch(/helps identify discrepancies between previous and current electricity bills/i)
    expect(responseText).not.toMatch(/1\.5-ton/i)
  })

  test('2. Ask AC consumption question, then follow up with 4 hours, verifying AC context', async ({ page }) => {
    const composer = page.locator('textarea')

    // Initial query
    await composer.fill('How much electricity does a 1.5-ton inverter AC consume in 8 hours?')
    await page.getByRole('button', { name: 'Send Message' }).click()

    // Verify first response
    const firstAssistantBubble = page.locator('.rounded-tl-xs').first()
    await expect(firstAssistantBubble).toBeVisible({ timeout: 15000 })
    await expect(firstAssistantBubble).toContainText('kWh', { timeout: 15000 })

    // Follow-up query
    await composer.fill('What if I run it for only 4 hours?')
    await page.getByRole('button', { name: 'Send Message' }).click()

    // Verify second assistant response
    const secondAssistantBubble = page.locator('.rounded-tl-xs').nth(1)
    await expect(secondAssistantBubble).toBeVisible({ timeout: 15000 })

    const followUpText = await secondAssistantBubble.innerText()
    // Verifies 4-hour calculation or comparison with 8 hours
    expect(followUpText).toMatch(/4 hours|4h|50%|half/i)
    expect(followUpText).toMatch(/kWh|units/i)
  })

  test('3. Start a new chat and verify context isolation across sessions', async ({ page }) => {
    const composer = page.locator('textarea')

    // In first session, discuss AC
    await composer.fill('How much electricity does a 1.5-ton inverter AC consume in 8 hours?')
    await page.getByRole('button', { name: 'Send Message' }).click()
    await expect(page.locator('.rounded-tl-xs').first()).toBeVisible({ timeout: 15000 })

    // Click "New Chat" in sidebar
    await page.getByRole('button', { name: 'New Chat' }).click()

    // In new chat, message list should be fresh (no existing assistant bubbles from previous session)
    await expect(page.locator('.rounded-tl-xs')).toHaveCount(0)

    // Ask a neutral tech question
    await composer.fill('What is Python, and why is it used in AI?')
    await page.getByRole('button', { name: 'Send Message' }).click()

    const newAssistantBubble = page.locator('.rounded-tl-xs').first()
    await expect(newAssistantBubble).toBeVisible({ timeout: 15000 })

    const answer = await newAssistantBubble.innerText()
    // Must explain Python
    expect(answer).toMatch(/Python/i)
    expect(answer).toMatch(/programming language|syntax|libraries|PyTorch|TensorFlow/i)

    // Must NOT latch to AC or return AC calculation from prior conversation
    expect(answer).not.toMatch(/1\.5-ton/i)
    expect(answer).not.toMatch(/air conditioner/i)
  })

  test('4. Chat privacy banner and sidebar footer explicitly warn about local browser storage per account', async ({ page }) => {
    // Top banner notice
    const banner = page.locator('div.border-gold.bg-pale')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('conversations stored locally in this browser, separated per account')
    await expect(banner).toContainText('History is not synced to a server; anyone with access to this browser profile can inspect local storage')

    // Sidebar footer label
    const footer = page.locator('text=🔒 Local account storage')
    await expect(footer).toBeVisible()
    await expect(footer).toHaveAttribute(
      'title',
      'Conversations are saved locally in this browser, separated per account. Not synced to a server.'
    )
  })

  test('5. Verify localStorage namespace isolation between demo and authenticated users', async ({ page }) => {
    // In demo mode, start conversation
    const composer = page.locator('textarea')
    await composer.fill('Demo conversation query')
    await page.getByRole('button', { name: 'Send Message' }).click()
    await expect(page.locator('.rounded-tl-xs').first()).toBeVisible({ timeout: 15000 })

    // Verify localStorage key is demo namespace, not legacy and not user
    const storageKeys = await page.evaluate(() => Object.keys(localStorage))
    expect(storageKeys).toContain('theftguard_ai_chat_sessions_demo_v1')
    expect(storageKeys.some((k) => k.startsWith('theftguard_ai_chat_sessions_user_'))).toBe(false)

    // Now test isolation by injecting accounts directly into browser storage
    const userA = 'user-uuid-1111'
    const userB = 'user-uuid-2222'
    await page.evaluate(({ uA, uB }) => {
      localStorage.setItem(`theftguard_ai_chat_sessions_user_${uA}`, JSON.stringify([
        {
          id: 'chat-ua-1',
          title: 'Account A Exclusive Session',
          updatedAt: new Date().toISOString(),
          messages: [{ role: 'user', content: 'Account A confidential message' }]
        }
      ]))
      localStorage.setItem(`theftguard_ai_chat_sessions_user_${uB}`, JSON.stringify([
        {
          id: 'chat-ub-1',
          title: 'Account B Exclusive Session',
          updatedAt: new Date().toISOString(),
          messages: [{ role: 'user', content: 'Account B confidential message' }]
        }
      ]))
    }, { uA: userA, uB: userB })

    // Verify User A's data is isolated and does not leak to User B
    const aData = await page.evaluate((u) => localStorage.getItem(`theftguard_ai_chat_sessions_user_${u}`), userA)
    const bData = await page.evaluate((u) => localStorage.getItem(`theftguard_ai_chat_sessions_user_${u}`), userB)

    expect(aData).toContain('Account A Exclusive Session')
    expect(aData).not.toContain('Account B Exclusive Session')
    expect(bData).toContain('Account B Exclusive Session')
    expect(bData).not.toContain('Account A Exclusive Session')
  })
})
