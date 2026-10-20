/**
 * TheftGuard AI Workspace Navigation Configuration
 */

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'theftguard_sidebar_collapsed_v1'

export const NAV = [
  { to: '/app/chat', label: 'AI Chat', icon: 'chat', isPrimary: true },
  { to: '/app/dashboard', label: 'Overview', icon: 'overview' },
  { to: '/app/screening', label: 'Screening', icon: 'upload' },
  { to: '/app/results', label: 'Results', icon: 'table' },
  { to: '/app/comparison', label: 'Comparison', icon: 'compare' },
  { to: '/app/bill-upload', label: 'Bill upload', icon: 'bill' },
  { to: '/app/bill-comparison', label: 'Bill comparison', icon: 'file' },
  { to: '/app/investigations', label: 'Investigations', icon: 'clipboard' },
  { to: '/app/reports', label: 'Reports', icon: 'report' },
  { to: '/app/model', label: 'Model and data', icon: 'model' },
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
