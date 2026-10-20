/**
 * TheftGuard AI Workspace Navigation Configuration
 */

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'theftguard_sidebar_collapsed_v1'

export const NAV = [
  { to: '/app/chat', label: 'AI Chat', labelKey: 'nav.chat', icon: 'chat', isPrimary: true },
  { to: '/app/dashboard', label: 'Overview', labelKey: 'nav.overview', icon: 'overview' },
  { to: '/app/screening', label: 'Screening', labelKey: 'nav.screening', icon: 'upload' },
  { to: '/app/results', label: 'Results', labelKey: 'nav.results', icon: 'table' },
  { to: '/app/comparison', label: 'Comparison', labelKey: 'nav.comparison', icon: 'compare' },
  { to: '/app/bill-upload', label: 'Bill upload', labelKey: 'nav.billUpload', icon: 'bill' },
  { to: '/app/bill-comparison', label: 'Bill comparison', labelKey: 'nav.billComparison', icon: 'file' },
  { to: '/app/investigations', label: 'Investigations', labelKey: 'nav.investigations', icon: 'clipboard' },
  { to: '/app/reports', label: 'Reports', labelKey: 'nav.reports', icon: 'report' },
  { to: '/app/model', label: 'Model and data', labelKey: 'nav.model', icon: 'model' },
  { to: '/app/settings', label: 'Settings', labelKey: 'nav.settings', icon: 'settings' },
]

/**
 * Computes floating viewport coordinates beside the collapsed rail icon.
 * Returns null if the sidebar is not collapsed.
 */
export function computeTooltipPosition({ collapsed, rect, label, badge = null }) {
  if (!collapsed || !rect) return null
  return {
    label,
    badge: badge || null,
    top: rect.top + rect.height / 2,
    left: rect.right + 10,
  }
}

/**
 * Validates whether a keydown event should toggle the sidebar.
 * Prevents triggering when the user is actively typing in an input, textarea, select, or contenteditable.
 */
export function shouldToggleSidebarShortcut(event, activeElement) {
  if (!event) return false
  const isShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'S' || event.key === 's')
  if (!isShortcut) return false

  const tag = activeElement?.tagName?.toUpperCase()
  const isEditable = activeElement?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  return !isEditable
}
