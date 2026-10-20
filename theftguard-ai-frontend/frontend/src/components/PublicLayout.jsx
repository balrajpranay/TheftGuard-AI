import { Link, Outlet } from 'react-router-dom'
import Logo from './Logo'
import { Button } from './ui'
import { useAuth } from '../context/AuthContext.js'

export default function PublicLayout() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Skip to main content
      </a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/"><Logo /></Link>
          <nav aria-label="Site" className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="/#how" className="hover:underline">How it works</a>
            <a href="/#model" className="hover:underline">The model</a>
            <a href="/#use" className="hover:underline">Responsible use</a>
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button to="/app/dashboard" variant="primary" size="sm">Go to workspace</Button>
            ) : (
              <>
                <Button to="/signin" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</Button>
                <Button to="/app/dashboard" variant="primary" size="sm">Open demo workspace</Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1"><Outlet /></main>
      <footer className="on-dark bg-ink text-sm text-white/75">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1.2fr_1fr]">
          <div>
            <Logo tone="onDark" />
            <p className="mt-3 max-w-md">
              Electricity Theft Detection Using Machine Learning. An academic project. Results are screening
              aids that recommend review; they are not findings of theft.
            </p>
          </div>
          <p className="max-w-md">
            Dataset source, licence, label meaning and consumption units are unconfirmed. This site is a frontend
            preview with demonstration data and no connected backend.
          </p>
        </div>
      </footer>
    </div>
  )
}
