import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  NAV,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  computeTooltipPosition,
  shouldToggleSidebarShortcut,
} from '../src/lib/navConfig.js'

describe('Sidebar Navigation — Configuration & Storage Contract', () => {
  it('exports standard localStorage key for collapsed state', () => {
    assert.equal(SIDEBAR_COLLAPSED_STORAGE_KEY, 'theftguard_sidebar_collapsed_v1')
  })

  it('contains complete set of workspace routes with icons and labels', () => {
    assert.ok(Array.isArray(NAV))
    assert.ok(NAV.length >= 7)

    const chatNav = NAV.find((n) => n.to === '/app/chat')
    assert.ok(chatNav, 'AI Chat must be in navigation')
    assert.equal(chatNav.icon, 'chat')
    assert.equal(chatNav.label, 'AI Chat')

    const investigationsNav = NAV.find((n) => n.to.endsWith('investigations'))
    assert.ok(investigationsNav, 'Investigations must be in navigation')

    for (const item of NAV) {
      assert.ok(item.to.startsWith('/app'), `Path ${item.to} must start with /app`)
      assert.ok(item.label.length > 0, 'Navigation label must not be empty')
      assert.ok(item.icon.length > 0, 'Icon name must not be empty')
    }
  })
})

describe('Sidebar Navigation — Keyboard Shortcut & Input Suppression Guard', () => {
  it('triggers toggle on Ctrl+Shift+S when focus is not in an editable input', () => {
    const event = { ctrlKey: true, shiftKey: true, key: 'S' }
    const activeElement = { tagName: 'BUTTON', isContentEditable: false }
    assert.equal(shouldToggleSidebarShortcut(event, activeElement), true)
  })

  it('triggers toggle on Cmd+Shift+S (Mac) when focus is not in an editable input', () => {
    const event = { metaKey: true, shiftKey: true, key: 's' }
    const activeElement = { tagName: 'DIV', isContentEditable: false }
    assert.equal(shouldToggleSidebarShortcut(event, activeElement), true)
  })

  it('suppresses toggle when typing in an INPUT element', () => {
    const event = { ctrlKey: true, shiftKey: true, key: 'S' }
    const activeElement = { tagName: 'INPUT', isContentEditable: false }
    assert.equal(shouldToggleSidebarShortcut(event, activeElement), false)
  })

  it('suppresses toggle when typing in a lowercase input element', () => {
    const event = { ctrlKey: true, shiftKey: true, key: 'S' }
    const activeElement = { tagName: 'input', isContentEditable: false }
    assert.equal(shouldToggleSidebarShortcut(event, activeElement), false)
  })

  it('suppresses toggle when typing in a TEXTAREA element', () => {
    const event = { ctrlKey: true, shiftKey: true, key: 'S' }
    const activeElement = { tagName: 'TEXTAREA', isContentEditable: false }
    assert.equal(shouldToggleSidebarShortcut(event, activeElement), false)
  })

  it('suppresses toggle when in a SELECT dropdown', () => {
    const event = { ctrlKey: true, shiftKey: true, key: 'S' }
    const activeElement = { tagName: 'SELECT', isContentEditable: false }
    assert.equal(shouldToggleSidebarShortcut(event, activeElement), false)
  })

  it('suppresses toggle when inside a contenteditable container', () => {
    const event = { ctrlKey: true, shiftKey: true, key: 'S' }
    const activeElement = { tagName: 'DIV', isContentEditable: true }
    assert.equal(shouldToggleSidebarShortcut(event, activeElement), false)
  })

  it('does not trigger on unrelated shortcuts like Ctrl+S without Shift', () => {
    const event = { ctrlKey: true, shiftKey: false, key: 's' }
    const activeElement = { tagName: 'BODY', isContentEditable: false }
    assert.equal(shouldToggleSidebarShortcut(event, activeElement), false)
  })

  it('safely handles null event or null activeElement without errors', () => {
    assert.equal(shouldToggleSidebarShortcut(null, null), false)
    const event = { ctrlKey: true, shiftKey: true, key: 'S' }
    assert.equal(shouldToggleSidebarShortcut(event, null), true)
  })
})

describe('Sidebar Tooltips — Gating & Viewport Placement Logic', () => {
  it('suppresses tooltips when the sidebar is expanded (collapsed: false)', () => {
    const tooltip = computeTooltipPosition({
      collapsed: false,
      rect: { top: 100, height: 40, right: 256 },
      label: 'AI Chat',
      badge: 'AI',
    })
    assert.equal(tooltip, null)
  })

  it('returns null if rect is missing', () => {
    const tooltip = computeTooltipPosition({
      collapsed: true,
      rect: null,
      label: 'AI Chat',
    })
    assert.equal(tooltip, null)
  })

  it('computes correct floating coordinates beside the rail when collapsed', () => {
    const tooltip = computeTooltipPosition({
      collapsed: true,
      rect: { top: 120, height: 40, right: 64 },
      label: 'AI Chat',
      badge: 'AI',
    })
    assert.deepEqual(tooltip, {
      label: 'AI Chat',
      badge: 'AI',
      top: 140, // 120 + 40/2
      left: 74,  // 64 + 10
    })
  })

  it('handles tooltips without badges', () => {
    const tooltip = computeTooltipPosition({
      collapsed: true,
      rect: { top: 50, height: 32, right: 64 },
      label: 'Overview',
    })
    assert.deepEqual(tooltip, {
      label: 'Overview',
      badge: null,
      top: 66,
      left: 74,
    })
  })
})
