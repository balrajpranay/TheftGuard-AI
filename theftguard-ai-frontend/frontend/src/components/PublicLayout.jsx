import { Link, Outlet } from 'react-router-dom'
import Logo from './Logo'
import { Button } from './ui'
import LanguageSelector from './LanguageSelector'
import { useAuth } from '../context/AuthContext.js'
import { useLanguage } from '../context/LanguageContext.js'

export default function PublicLayout() {
  const { isAuthenticated } = useAuth()
  const { t } = useLanguage()

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        {t('publicLayout.skipToMain')}
      </a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6">
          <Link to="/" className="shrink-0"><Logo className="text-sm sm:text-base" /></Link>
          <nav aria-label="Site" className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="/#how" className="hover:underline">{t('publicLayout.howItWorks')}</a>
            <a href="/#features" className="hover:underline">{t('publicLayout.features')}</a>
            <a href="/#model" className="hover:underline">{t('publicLayout.theModel')}</a>
            <a href="/#use" className="hover:underline">{t('publicLayout.responsibleUse')}</a>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <LanguageSelector variant="compact" />
            {isAuthenticated ? (
              <Button to="/app/dashboard" variant="primary" size="sm">{t('publicLayout.goToWorkspace')}</Button>
            ) : (
              <>
                <Button to="/signin" variant="ghost" size="sm" className="hidden sm:inline-flex">{t('publicLayout.signIn')}</Button>
                <Button to="/app/dashboard" variant="primary" size="sm">{t('publicLayout.openDemo')}</Button>
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
              {t('publicLayout.footerSummary')}
            </p>
          </div>
          <p className="max-w-md">
            {t('publicLayout.footerDisclaimer')}
          </p>
        </div>
      </footer>
    </div>
  )
}
