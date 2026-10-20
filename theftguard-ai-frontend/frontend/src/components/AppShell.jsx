import { useState, useEffect, useCallback } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import Logo, { LogoMark } from './Logo'
import Icon from './Icon'
import { DemoBadge } from './ui'
import AIAssistantDrawer from './AIAssistantDrawer'
import LanguageSelector from './LanguageSelector'
import { useAppState } from '../state/AppState'
import { useAuth } from '../context/AuthContext.js'
import { useLanguage } from '../context/LanguageContext.js'

import {
  NAV,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  computeTooltipPosition,
  shouldToggleSidebarShortcut,
} from '../lib/navConfig.js'
export { NAV, SIDEBAR_COLLAPSED_STORAGE_KEY }

function NavItems({ onNavigate, collapsed, onTooltip, onTooltipLeave }) {
  const { investigations } = useAppState()
  const { t } = useLanguage()
  const open = investigations.filter((i) => i.status !== 'Closed').length

  return (
    <nav aria-label="Workspace" className={`flex flex-col gap-1 ${collapsed ? 'items-center w-full' : ''}`}>
      {NAV.map((n) => {
        const isChat = n.to === '/app/chat'
        const hasOpenInvestigations = n.to.endsWith('investigations') && open > 0
        const displayLabel = n.labelKey ? t(n.labelKey) : n.label

        if (collapsed) {
          return (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => {
                onTooltipLeave?.()
                onNavigate?.()
              }}
              onMouseEnter={(e) =>
                onTooltip?.(e, {
                  label: displayLabel,
                  badge: isChat ? 'AI' : (hasOpenInvestigations ? String(open) : null),
                })
              }
              onMouseLeave={onTooltipLeave}
              onFocus={(e) =>
                onTooltip?.(e, {
                  label: displayLabel,
                  badge: isChat ? 'AI' : (hasOpenInvestigations ? String(open) : null),
                })
              }
              onBlur={onTooltipLeave}
              aria-label={displayLabel}
              className={({ isActive }) =>
                `relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-gold text-ink font-semibold shadow-xs'
                    : isChat
                    ? 'text-gold bg-gold/10 hover:bg-gold/20 hover:text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={n.icon} className={`h-5 w-5 ${isChat && !isActive ? 'text-gold' : ''}`} />
                  {isChat && !isActive ? (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
                    </span>
                  ) : null}
                  {hasOpenInvestigations && !isActive ? (
                    <span
                      className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-ink"
                      aria-label={`${open} open`}
                    >
                      {open}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          )
        }

        return (
          <NavLink
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded border-l-4 px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-gold bg-white/10 text-white font-semibold'
                  : isChat
                  ? 'border-transparent text-white bg-gold/10 hover:bg-gold/20 hover:text-white font-semibold'
                  : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon name={n.icon} className={`h-5 w-5 ${isChat ? 'text-gold' : ''}`} />
            <span className="flex-1">{displayLabel}</span>
            {isChat ? (
              <span className="rounded bg-gold/20 text-gold border border-gold/40 px-1.5 py-0.2 text-[10px] font-bold tracking-wider uppercase">
                AI
              </span>
            ) : null}
            {hasOpenInvestigations ? (
              <span className="rounded bg-gold px-1.5 text-xs font-semibold text-ink" aria-label={`${open} open`}>
                {open}
              </span>
            ) : null}
          </NavLink>
        )
      })}
    </nav>
  )
}

export default function AppShell() {
  const [menu, setMenu] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [tooltip, setTooltip] = useState(null)

  const { user, isAuthenticated, isDemoMode, signOut } = useAuth()
  const { language, t } = useLanguage()
  const {
    source,
    uploaded,
    hasScores,
    assistantOpen,
    setAssistantOpen,
    activeBillContext,
    questionnaireAnswers,
    setQuestionnaireAnswers,
  } = useAppState()
  const location = useLocation()
  const isChatRoute = location.pathname.startsWith('/app/chat')

  // Persist collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [collapsed])

  // Dismiss tooltip on location change or when sidebar expanded
  useEffect(() => {
    setTooltip(null)
  }, [location.pathname, collapsed])

  // Tooltip position calculator
  const showTooltip = useCallback((e, { label, badge }) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = computeTooltipPosition({ collapsed, rect, label, badge })
    if (pos) {
      setTooltip(pos)
    }
  }, [collapsed])

  const hideTooltip = useCallback(() => {
    setTooltip(null)
  }, [])

  // Dismiss tooltip on window scroll
  useEffect(() => {
    if (!tooltip) return
    const handleScroll = () => setTooltip(null)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [tooltip])

  // Keyboard shortcut listener: Ctrl+Shift+S or Cmd+Shift+S and Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (shouldToggleSidebarShortcut(e, document.activeElement)) {
        e.preventDefault()
        setCollapsed((prev) => !prev)
        setTooltip(null)
      } else if (e.key === 'Escape') {
        setTooltip(null)
        setMenu(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-mist lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Skip to main content
      </a>

      {/* Desktop rail */}
      <aside
        data-testid="desktop-sidebar"
        className={`on-dark hidden shrink-0 flex-col bg-ink print:hidden lg:flex transition-[width,padding] duration-200 ease-in-out ${
          collapsed ? 'w-16 p-2 items-center' : 'w-64 p-4'
        }`}
      >
        {collapsed ? (
          /* Collapsed Header */
          <div className="mb-6 flex flex-col items-center gap-2">
            <Link
              to="/"
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="TheftGuard AI Home"
              onMouseEnter={(e) => showTooltip(e, { label: 'TheftGuard AI Home' })}
              onMouseLeave={hideTooltip}
              onFocus={(e) => showTooltip(e, { label: 'TheftGuard AI Home' })}
              onBlur={hideTooltip}
            >
              <LogoMark tone="onDark" className="h-7 w-7" />
            </Link>
            <button
              type="button"
              onClick={() => {
                hideTooltip()
                setCollapsed(false)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              aria-label="Expand sidebar (Ctrl+Shift+S)"
              title="Expand sidebar (Ctrl+Shift+S)"
              onMouseEnter={(e) => showTooltip(e, { label: 'Expand sidebar (Ctrl+Shift+S)' })}
              onMouseLeave={hideTooltip}
              onFocus={(e) => showTooltip(e, { label: 'Expand sidebar (Ctrl+Shift+S)' })}
              onBlur={hideTooltip}
            >
              <Icon name="chevRight" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* Expanded Header */
          <div className="mb-6 flex items-center justify-between px-1">
            <Link to="/" className="flex items-center gap-2">
              <Logo tone="onDark" />
            </Link>
            <button
              type="button"
              onClick={() => {
                hideTooltip()
                setCollapsed(true)
              }}
              className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              aria-label="Collapse sidebar (Ctrl+Shift+S)"
              title="Collapse sidebar (Ctrl+Shift+S)"
            >
              <Icon name="panelLeft" className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <NavItems
          collapsed={collapsed}
          onTooltip={showTooltip}
          onTooltipLeave={hideTooltip}
        />

        {/* Footer */}
        {collapsed ? (
          /* Collapsed Footer */
          <div className="mt-auto flex flex-col items-center gap-2 border-t border-white/15 pt-3 w-full">
            {isAuthenticated ? (
              <>
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 text-gold font-bold text-xs ring-1 ring-gold/40 cursor-default select-none"
                  aria-label={`Signed in as ${user?.user_metadata?.full_name || user?.email || 'Operator'}`}
                  onMouseEnter={(e) =>
                    showTooltip(e, {
                      label: user?.user_metadata?.full_name || user?.email || 'Utility Operator',
                      badge: 'Auth',
                    })
                  }
                  onMouseLeave={hideTooltip}
                  onFocus={(e) =>
                    showTooltip(e, {
                      label: user?.user_metadata?.full_name || user?.email || 'Utility Operator',
                      badge: 'Auth',
                    })
                  }
                  onBlur={hideTooltip}
                  tabIndex={0}
                >
                  {((user?.user_metadata?.full_name || user?.email || 'U')[0]).toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    hideTooltip()
                    signOut()
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-gold transition-colors cursor-pointer"
                  aria-label="Sign out"
                  onMouseEnter={(e) => showTooltip(e, { label: 'Sign out' })}
                  onMouseLeave={hideTooltip}
                  onFocus={(e) => showTooltip(e, { label: 'Sign out' })}
                  onBlur={hideTooltip}
                >
                  <Icon name="logout" className="h-4 w-4" />
                </button>
              </>
            ) : (
              <Link
                to="/signin"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 font-bold text-xs ring-1 ring-amber-400/40 hover:bg-amber-400/30 transition-colors cursor-pointer"
                aria-label="Demo Mode — Sign in"
                onMouseEnter={(e) => showTooltip(e, { label: 'Demo Mode (Sign in)' })}
                onMouseLeave={hideTooltip}
                onFocus={(e) => showTooltip(e, { label: 'Demo Mode (Sign in)' })}
                onBlur={hideTooltip}
              >
                D
              </Link>
            )}
            <Link
              to="/"
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              aria-label="Back to site"
              onMouseEnter={(e) => showTooltip(e, { label: 'Back to site' })}
              onMouseLeave={hideTooltip}
              onFocus={(e) => showTooltip(e, { label: 'Back to site' })}
              onBlur={hideTooltip}
            >
              <Icon name="external" className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          /* Expanded Footer */
          <div className="mt-auto border-t border-white/15 pt-4 text-xs text-white/70">
            {isAuthenticated ? (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-white/50">{t('footer.signedInAs')}</p>
                {user?.user_metadata?.full_name ? (
                  <>
                    <p className="font-semibold text-white truncate" title={user.user_metadata.full_name}>
                      {user.user_metadata.full_name}
                    </p>
                    <p className="text-[11px] text-white/60 truncate" title={user?.email || ''}>
                      {user?.email}
                    </p>
                  </>
                ) : (
                  <p className="font-semibold text-white truncate" title={user?.email || ''}>
                    {user?.email || 'Utility Operator'}
                  </p>
                )}
                <button
                  type="button"
                  onClick={signOut}
                  className="mt-2 inline-flex items-center gap-1 text-gold hover:underline underline-offset-2 cursor-pointer"
                >
                  {t('common.signOut')}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center rounded bg-amber-400/20 px-1.5 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-400/30">
                    {t('footer.demoWorkspace')}
                  </span>
                  <Link to="/signin" className="text-xs text-gold hover:underline">
                    {t('common.signIn')}
                  </Link>
                </div>
                <p className="mt-1 text-[11px] text-white/60">{t('footer.syntheticNotice')}</p>
              </div>
            )}
            <div className="mt-3 border-t border-white/10 pt-2 flex items-center justify-between">
              <Link to="/" className="inline-block text-white/60 underline underline-offset-2 hover:text-white">{t('common.backToSite')}</Link>
              <LanguageSelector variant="compact" />
            </div>
          </div>
        )}
      </aside>

      {/* Floating ChatGPT-style Tooltip (rendered only when collapsed) */}
      {collapsed && tooltip ? (
        <div
          role="tooltip"
          id="sidebar-rail-tooltip"
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-slate-900/95 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-xs whitespace-nowrap"
          style={{
            top: tooltip.top,
            left: tooltip.left,
            transform: 'translateY(-50%)',
          }}
        >
          {/* Arrow pointing left */}
          <div
            className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 border-b border-l border-slate-700/80 bg-slate-900/95"
            aria-hidden="true"
          />
          <span className="relative z-10">{tooltip.label}</span>
          {tooltip.badge ? (
            <span className="relative z-10 rounded bg-gold/20 border border-gold/40 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider text-gold">
              {tooltip.badge}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Mobile bar and drawer */}
      <div className="on-dark sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 print:hidden lg:hidden">
        <Link to="/"><Logo tone="onDark" /></Link>
        <button
          type="button"
          onClick={() => setMenu(true)}
          className="rounded p-2 text-white hover:bg-white/10 cursor-pointer"
          aria-label="Open navigation"
        >
          <Icon name="menu" />
        </button>
      </div>
      {menu ? (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <div className="absolute inset-0 bg-ink/60 backdrop-blur-xs" onClick={() => setMenu(false)} aria-hidden="true" />
          <div className="on-dark absolute inset-y-0 left-0 flex w-72 flex-col bg-ink p-4 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <Logo tone="onDark" />
              <button
                type="button"
                onClick={() => setMenu(false)}
                className="rounded p-2 text-white hover:bg-white/10 cursor-pointer"
                aria-label="Close navigation"
              >
                <Icon name="close" />
              </button>
            </div>
            <NavItems onNavigate={() => setMenu(false)} />
            <div className="mt-auto border-t border-white/15 pt-4 text-xs text-white/70">
              {isAuthenticated ? (
                <div>
                  {user?.user_metadata?.full_name ? (
                    <>
                      <p className="font-semibold text-white truncate">{user.user_metadata.full_name}</p>
                      <p className="text-[11px] text-white/60 truncate">{user?.email}</p>
                    </>
                  ) : (
                    <p className="font-semibold text-white truncate">{user?.email || 'Utility Operator'}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false)
                      signOut()
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-gold hover:underline cursor-pointer"
                  >
                    {t('common.signOut')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-amber-300 text-xs">{t('common.demoMode')}</span>
                  <Link to="/signin" onClick={() => setMenu(false)} className="text-gold underline">
                    {t('common.signIn')}
                  </Link>
                </div>
              )}
              <div className="mt-3 border-t border-white/10 pt-2 flex items-center justify-between">
                <span className="text-white/60">{t('common.language')}</span>
                <LanguageSelector variant="compact" />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold bg-pale px-4 py-2 text-sm print:hidden sm:px-6">
          <DemoBadge>
            {isChatRoute
              ? t('topBanner.localStorageBadge')
              : hasScores
                ? t('topBanner.liveMlBadge')
                : isDemoMode
                  ? t('topBanner.demoBadge')
                  : t('topBanner.authBadge')}
          </DemoBadge>
          <span>
            {isChatRoute ? (
              t('topBanner.chatText')
            ) : source === 'uploaded' && uploaded ? (
              hasScores ? (
                t('topBanner.uploadedScored', { fileName: uploaded.fileName })
              ) : (
                t('topBanner.uploadedPreview', { fileName: uploaded.fileName })
              )
            ) : isDemoMode ? (
              t('topBanner.demoText')
            ) : (
              t('topBanner.authText', { name: user?.user_metadata?.full_name || user?.email || 'Operator' })
            )}
          </span>
        </div>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>

      {/* Floating Global AI Assistant Trigger */}
      <div className="fixed bottom-6 right-6 z-40 print:hidden flex items-center gap-2">
        <Link
          to="/app/chat"
          className="hidden sm:flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-white shadow-lg hover:bg-ink/90 border border-slate-700 transition-all cursor-pointer"
          title="Open Dedicated Full-Page AI Chat Workspace"
        >
          <Icon name="chat" className="h-3.5 w-3.5 text-gold" />
          <span>{t('assistantDrawer.fullChat')}</span>
        </Link>
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          className="flex items-center gap-2 rounded-full bg-gold px-4 py-2.5 text-xs font-bold text-ink shadow-lg hover:bg-[#E0B220] hover:shadow-xl transition-all border border-gold focus:outline-hidden focus:ring-2 focus:ring-gold cursor-pointer"
          aria-label={t('assistantDrawer.askAssistant')}
        >
          <span className="text-base leading-none">⚡</span>
          <span>{t('assistantDrawer.askAssistant')}</span>
        </button>
      </div>

      {/* Global AI Assistant Drawer */}
      <AIAssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        billContext={activeBillContext}
        initialQuestionnaireAnswers={questionnaireAnswers}
        onQuestionnaireChange={setQuestionnaireAnswers}
      />
    </div>
  )
}
