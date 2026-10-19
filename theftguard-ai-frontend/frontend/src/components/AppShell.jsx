import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import Logo from './Logo'
import Icon from './Icon'
import { DemoBadge } from './ui'
import { useAppState } from '../state/AppState'

const NAV = [
  { to: '/app/dashboard', label: 'Overview', icon: 'overview' },
  { to: '/app/screening', label: 'Screening', icon: 'upload' },
  { to: '/app/results', label: 'Results', icon: 'table' },
  { to: '/app/comparison', label: 'Comparison', icon: 'compare' },
  { to: '/app/bill-upload', label: 'Bill upload', icon: 'bill' },
  { to: '/app/investigations', label: 'Investigations', icon: 'clipboard' },
  { to: '/app/reports', label: 'Reports', icon: 'report' },
  { to: '/app/model', label: 'Model and data', icon: 'model' },
]

function NavItems({ onNavigate }) {
  const { investigations } = useAppState()
  const open = investigations.filter((i) => i.status !== 'Closed').length
  return (
    <nav aria-label="Workspace" className="flex flex-col gap-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded border-l-4 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'border-gold bg-white/10 text-white' : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white'
            }`
          }
        >
          <Icon name={n.icon} className="h-5 w-5" />
          <span className="flex-1">{n.label}</span>
          {n.to.endsWith('investigations') && open > 0 ? (
            <span className="rounded bg-gold px-1.5 text-xs font-semibold text-ink" aria-label={`${open} open`}>{open}</span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppShell() {
  const [menu, setMenu] = useState(false)
  const { source, uploaded, hasScores } = useAppState()
  return (
    <div className="min-h-screen bg-mist lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Skip to main content
      </a>

      {/* Desktop rail */}
      <aside className="on-dark hidden w-64 shrink-0 flex-col bg-ink p-4 print:hidden lg:flex">
        <Link to="/" className="mb-6 px-1"><Logo tone="onDark" /></Link>
        <NavItems />
        <div className="mt-auto border-t border-white/15 pt-4 text-xs text-white/70">
          <p className="font-medium text-white">TheftGuard AI</p>
          <p className="mt-1">ML service: connects to local FastAPI (/v1). Database and auth remain in preview.</p>
          <Link to="/" className="mt-3 inline-block underline underline-offset-2 hover:text-white">Back to the site</Link>
        </div>
      </aside>

      {/* Mobile bar and drawer */}
      <div className="on-dark sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 print:hidden lg:hidden">
        <Link to="/"><Logo tone="onDark" /></Link>
        <button type="button" onClick={() => setMenu(true)} className="rounded p-2 text-white hover:bg-white/10" aria-label="Open navigation">
          <Icon name="menu" />
        </button>
      </div>
      {menu ? (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setMenu(false)} aria-hidden="true" />
          <div className="on-dark absolute inset-y-0 left-0 w-72 bg-ink p-4">
            <div className="mb-6 flex items-center justify-between">
              <Logo tone="onDark" />
              <button type="button" onClick={() => setMenu(false)} className="rounded p-2 text-white hover:bg-white/10" aria-label="Close navigation">
                <Icon name="close" />
              </button>
            </div>
            <NavItems onNavigate={() => setMenu(false)} />
          </div>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold bg-pale px-4 py-2 text-sm print:hidden sm:px-6">
          <DemoBadge>{hasScores ? 'Live ML' : 'Preview'}</DemoBadge>
          <span>
            {source === 'uploaded' && uploaded ? (
              hasScores ? (
                <>Results show rows from <strong>{uploaded.fileName}</strong> scored with the TheftGuard AI ML service. Model Scores do not prove theft.</>
              ) : (
                <>Results show rows from <strong>{uploaded.fileName}</strong>, without Model Scores (preview mode).</>
              )
            ) : (
              'Demonstration workspace with sample data. Nothing here is saved, assigned or sent.'
            )}
          </span>
        </div>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
