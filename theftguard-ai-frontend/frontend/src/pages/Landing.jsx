import { useMemo } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Button, CategoryBadge, DemoBadge, ScoreScale, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext.js'
import { useLanguage } from '../context/LanguageContext.js'
import { buildDemoCustomers } from '../data/demoCustomers'
import { MODEL_FACTS } from '../data/modelFacts'
import { classify, DEFAULT_THRESHOLDS } from '../lib/risk'
import { score as fmtScore } from '../lib/format'

export default function Landing() {
  const { isAuthenticated, loading } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()

  const STEPS = [
    {
      title: t('landing.job1Title'),
      body: t('landing.job1Body'),
    },
    {
      title: t('landing.job2Title'),
      body: t('landing.job2Body'),
    },
    {
      title: t('landing.job3Title'),
      body: t('landing.job3Body'),
    },
  ]

  // 1. If genuinely authenticated, automatically navigate to workspace dashboard
  if (isAuthenticated) {
    return <Navigate to="/app/dashboard" replace />
  }

  // 2. Check for OAuth callback or error parameters in the URL
  const hash = location.hash || (typeof window !== 'undefined' ? window.location.hash || '' : '')
  const search = location.search || (typeof window !== 'undefined' ? window.location.search || '' : '')

  const hasAuthError =
    hash.includes('error=') ||
    hash.includes('error_description=') ||
    search.includes('error=') ||
    search.includes('error_description=')

  if (hasAuthError) {
    return <Navigate to={`/signin${search}${hash}`} replace />
  }

  const hasOAuthParams = hash.includes('access_token=') || search.includes('code=')

  // 3. While restoring session from incoming OAuth callback, show verifying spinner
  // to avoid flashing the public landing page before Supabase finishes restoring the session
  if (loading && hasOAuthParams) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist px-4">
        <div className="rounded border border-line bg-white p-6 shadow-xs text-center">
          <Spinner label="Completing Google sign-in..." />
        </div>
      </div>
    )
  }

  const top = useMemo(() => [...buildDemoCustomers()].sort((a, b) => b.score - a.score).slice(0, 5), [])
  const m = Object.fromEntries(MODEL_FACTS.metrics.map((x) => [x.key, x.value]))
  const flagged = MODEL_FACTS.confusion.TP + MODEL_FACTS.confusion.FP

  return (
    <>
      <section className="border-b border-line bg-pale">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-medium text-gold-deep">{t('landing.tagline')}</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl break-words">
              Analyze consumption.<br />
              Detect suspicious patterns.<br />
              Support investigation.
            </h1>
            <p className="mt-5 max-w-xl text-base sm:text-lg text-ink/80">
              {t('landing.description')}
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5 sm:gap-3">
              <Button to="/app/dashboard" variant="primary" icon="arrowRight">{t('landing.openDemo')}</Button>
              <Button to="/app/model" variant="secondary">{t('landing.readVerified')}</Button>
            </div>
          </div>

          <figure className="rounded border border-ink bg-white" aria-label="Example of screening results">
            <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <span className="font-display font-semibold">{t('landing.screeningTitle')}</span>
              <DemoBadge>{t('landing.demoDataBadge')}</DemoBadge>
            </figcaption>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-4 py-2 font-medium">{t('landing.customerHeader')}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t('landing.modelScoreHeader')}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t('landing.categoryHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-3 font-medium">{c.id}</th>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-12">{fmtScore(c.score)}</span>
                          <ScoreScale score={c.score} thresholds={DEFAULT_THRESHOLDS} />
                        </div>
                      </td>
                      <td className="px-4 py-3"><CategoryBadge category={classify(c.score, DEFAULT_THRESHOLDS)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-muted">
              {t('landing.scoreNote')}
            </p>
          </figure>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-14 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">{t('landing.threeJobsTitle')}</h2>
        <p className="mt-2 max-w-2xl text-muted">
          {t('landing.threeJobsSubtitle')}
        </p>
        <dl className="mt-8 border-t border-ink">
          {STEPS.map((s) => (
            <div key={s.title} className="grid gap-2 border-b border-line py-6 md:grid-cols-[240px_1fr] md:gap-8">
              <dt className="font-display text-xl font-semibold">{s.title}</dt>
              <dd className="max-w-2xl text-ink/85">{s.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="model" className="scroll-mt-4 border-y border-line bg-mist">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{t('landing.modelTitle')}</h2>
            <p className="mt-3 text-ink/85">
              On a held-out test of {MODEL_FACTS.testRows.toLocaleString('en-IN')} customers, the model flagged{' '}
              {flagged.toLocaleString('en-IN')} (10.7%). Of those, {MODEL_FACTS.confusion.TP} carried the dataset label
              FLAG = 1, and it missed {MODEL_FACTS.confusion.FN} of the {MODEL_FACTS.testPositives} labelled customers.
            </p>
            <p className="mt-3 text-ink/85">
              The result comes from one random split of a dataset whose source and licence are not yet confirmed. It is
              not external validation, and it has not been tested on Indian consumption data.
            </p>
            <Button to="/app/model" variant="dark" className="mt-5" icon="arrowRight">{t('landing.seeLimitations')}</Button>
          </div>
          <div>
            <h3 className="sr-only">Verified test results</h3>
            <table className="w-full border-t border-ink text-left">
              <tbody>
                {[
                  [t('landing.precisionLabel'), m.precision.toFixed(2)],
                  [t('landing.recallLabel'), m.recall.toFixed(2)],
                  [t('landing.rocLabel'), m.roc.toFixed(2)],
                  [t('landing.prLabel'), m.pr.toFixed(2)],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-line">
                    <th scope="row" className="py-3 pr-4 font-normal">{k}</th>
                    <td className="py-3 text-right font-display text-2xl font-semibold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">{t('landing.sourceNote')}</p>
          </div>
        </div>
      </section>

      <section id="use" className="on-dark scroll-mt-4 bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">{t('landing.responsibleUseTitle')}</h2>
          <ul className="mt-6 grid gap-x-10 gap-y-5 text-white/85 md:grid-cols-3">
            <li className="border-t border-gold pt-3">{t('landing.rule1')}</li>
            <li className="border-t border-gold pt-3">{t('landing.rule2')}</li>
            <li className="border-t border-gold pt-3">{t('landing.rule3')}</li>
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button to="/app/dashboard" variant="primary">{t('landing.openDemo')}</Button>
            <Link to="/signin" className="text-sm underline underline-offset-2 hover:text-gold">{t('landing.signInAccount')}</Link>
          </div>
        </div>
      </section>
    </>
  )
}
