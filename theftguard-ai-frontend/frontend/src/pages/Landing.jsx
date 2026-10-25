import { useMemo } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import Icon from '../components/Icon'
import { Badge, Button, CategoryBadge, DemoBadge, ScoreScale, Spinner } from '../components/ui'
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

  const PIPELINE_STEPS = [
    { num: '01', title: t('landing.step1Title'), desc: t('landing.step1Desc') },
    { num: '02', title: t('landing.step2Title'), desc: t('landing.step2Desc') },
    { num: '03', title: t('landing.step3Title'), desc: t('landing.step3Desc') },
    { num: '04', title: t('landing.step4Title'), desc: t('landing.step4Desc') },
    { num: '05', title: t('landing.step5Title'), desc: t('landing.step5Desc') },
  ]

  const WORKFLOWS = [
    {
      icon: 'upload',
      title: t('landing.job2Title'),
      body: t('landing.job2Body'),
      tag: 'Machine Learning',
      link: '/app/screening',
    },
    {
      icon: 'compare',
      title: t('landing.job3Title'),
      body: t('landing.job3Body'),
      tag: 'Time-Series kWh',
      link: '/app/comparison',
    },
    {
      icon: 'bill',
      title: t('landing.job1Title'),
      body: t('landing.job1Body'),
      tag: 'Browser-Side OCR',
      link: '/app/bill-upload',
    },
  ]

  const FEATURES = [
    { icon: 'chat', title: t('landing.featChatTitle'), desc: t('landing.featChatDesc'), to: '/app/chat' },
    { icon: 'overview', title: t('landing.featOverviewTitle'), desc: t('landing.featOverviewDesc'), to: '/app/dashboard' },
    { icon: 'upload', title: t('landing.featScreeningTitle'), desc: t('landing.featScreeningDesc'), to: '/app/screening' },
    { icon: 'table', title: t('landing.featResultsTitle'), desc: t('landing.featResultsDesc'), to: '/app/results' },
    { icon: 'compare', title: t('landing.featComparisonTitle'), desc: t('landing.featComparisonDesc'), to: '/app/comparison' },
    { icon: 'bill', title: t('landing.featBillUploadTitle'), desc: t('landing.featBillUploadDesc'), to: '/app/bill-upload' },
    { icon: 'calculator', title: t('landing.featBillCompTitle'), desc: t('landing.featBillCompDesc'), to: '/app/bill-comparison' },
    { icon: 'clipboard', title: t('landing.featInvestTitle'), desc: t('landing.featInvestDesc'), to: '/app/investigations' },
    { icon: 'report', title: t('landing.featReportsTitle'), desc: t('landing.featReportsDesc'), to: '/app/reports' },
    { icon: 'model', title: t('landing.featModelTitle'), desc: t('landing.featModelDesc'), to: '/app/model' },
  ]

  const METRICS_TABLE = [
    [t('landing.precisionLabel'), m.precision.toFixed(3)],
    [t('landing.recallLabel'), m.recall.toFixed(3)],
    [t('landing.f1Label'), m.f1.toFixed(3)],
    [t('landing.rocLabel'), m.roc.toFixed(3)],
    [t('landing.prLabel'), m.pr.toFixed(3)],
  ]

  const RULES = [
    { title: 'Vote Fraction, Not Probability', text: t('landing.rule1') },
    { title: 'Screening Recommendation, Not Proof', text: t('landing.rule2') },
    { title: 'Configurable Tariff Estimates', text: t('landing.rule3') },
    { title: 'Local Grid Calibration Required', text: t('landing.rule4') },
  ]

  return (
    <>
      {/* 1. Hero Section */}
      <section className="border-b border-line bg-pale">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-12 lg:py-14">
          <div>
            <p className="text-xs sm:text-sm font-semibold tracking-wide uppercase text-gold-deep">
              {t('landing.tagline')}
            </p>
            <h1 className="mt-2.5 text-2xl sm:text-3xl lg:text-4xl xl:text-[2.5rem] font-bold tracking-tight leading-tight sm:leading-tight lg:leading-[1.18] text-ink break-words">
              {(t('landing.headline') || '').split('\n').map((line, idx) => (
                <span key={idx} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-4 max-w-xl text-sm sm:text-base lg:text-[1.0625rem] text-ink/80 leading-relaxed">
              {t('landing.description')}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row flex-wrap gap-3">
              <Button to="/app/dashboard" variant="primary" icon="arrowRight" className="w-full sm:w-auto text-center">
                {t('landing.openDemo')}
              </Button>
              <Button to="/app/model" variant="secondary" className="w-full sm:w-auto text-center">
                {t('landing.readVerified')}
              </Button>
            </div>
          </div>

          {/* Electricity Analysis Command Center Card */}
          <div
            className="rounded border border-ink bg-white shadow-xs overflow-hidden"
            aria-label="Electricity Analysis Command Center"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5 sm:px-4 sm:py-3 bg-mist/30">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-gold/20 text-gold-deep border border-gold/40">
                  <Icon name="overview" className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="font-display font-bold text-xs sm:text-sm text-ink block leading-tight">
                    Electricity Analysis Command Center
                  </span>
                  <span className="text-[10px] text-muted">
                    Screening &amp; Verification Overview
                  </span>
                </div>
              </div>
              <Badge tone="info" className="text-[10px] uppercase font-mono tracking-wider">
                Concept Preview
              </Badge>
            </div>

            <div className="p-3 sm:p-4 space-y-3 sm:space-y-3.5">
              {/* A. Electricity Meter Visual & Consumption Analysis */}
              <div className="rounded border border-line bg-pale/25 p-2.5 sm:p-3">
                <div className="flex items-center justify-between pb-2 border-b border-line/60">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-ink text-gold shrink-0">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
                      </svg>
                    </div>
                    <span className="font-display font-semibold text-xs text-ink uppercase tracking-wider">
                      Electricity Consumption Analysis
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-muted uppercase">kWh Comparison</span>
                </div>

                {/* Comparative Meter Analysis Cards */}
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {/* Historical Consumption */}
                  <div className="rounded border border-line bg-white p-2 sm:p-2.5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] sm:text-xs font-bold text-ink truncate">Historical Consumption</span>
                        <span className="text-[9px] font-mono text-muted uppercase shrink-0">Baseline</span>
                      </div>
                      {/* Pattern visual bars showing normal consistent profile */}
                      <div className="mt-2 flex items-end gap-0.5 sm:gap-1 h-8 sm:h-9 px-1 py-1 bg-mist/30 rounded border border-line/40">
                        {[48, 52, 50, 54, 49, 53, 51, 55].map((val, idx) => (
                          <div
                            key={idx}
                            className="flex-1 bg-ink/70 rounded-t-xs transition-all"
                            style={{ height: `${val}%` }}
                            title={`Historical baseline cycle ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[9px] sm:text-[10px] text-muted">
                      <span>Prior cycles</span>
                      <span className="font-mono font-medium text-ink">Stable Profile</span>
                    </div>
                  </div>

                  {/* Current Consumption */}
                  <div className="rounded border border-gold/70 bg-white p-2 sm:p-2.5 shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] sm:text-xs font-bold text-ink truncate">Current Consumption</span>
                        <span className="text-[9px] font-semibold text-gold-deep bg-pale px-1 py-0.2 rounded border border-gold/50 font-mono uppercase shrink-0">
                          Active
                        </span>
                      </div>
                      {/* Pattern visual bars showing sudden anomalous drop */}
                      <div className="mt-2 flex items-end gap-0.5 sm:gap-1 h-8 sm:h-9 px-1 py-1 bg-pale/50 rounded border border-gold/40">
                        {[50, 49, 52, 22, 19, 21, 18, 20].map((val, idx) => (
                          <div
                            key={idx}
                            className={`flex-1 rounded-t-xs transition-all ${
                              idx >= 3 ? 'bg-gold-deep' : 'bg-ink/70'
                            }`}
                            style={{ height: `${val}%` }}
                            title={`Monitored cycle ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[9px] sm:text-[10px]">
                      <span className="text-gold-deep font-semibold truncate">Drop detected</span>
                      <span className="font-mono text-gold-deep font-semibold shrink-0">Flagged</span>
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-[11px] text-ink/75 leading-relaxed">
                  Compares sequential kWh readings across billing periods against historical baseline patterns to highlight anomalous drops.
                </p>
              </div>

              {/* B. Connected ML Workflow */}
              <div className="rounded border border-line bg-white p-2.5 sm:p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-ink uppercase tracking-wider">
                    Connected ML Workflow
                  </span>
                  <span className="text-[10px] text-muted font-mono">3-Stage Screening</span>
                </div>

                <div className="flex items-stretch gap-1 sm:gap-1.5">
                  {/* Stage 1 */}
                  <div className="flex-1 rounded border border-line/80 bg-mist/20 p-1.5 sm:p-2 text-center flex flex-col justify-between">
                    <div>
                      <div className="mx-auto flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-white border border-line text-ink mb-1">
                        <Icon name="upload" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-bold text-ink leading-tight">1. Consumption Data</div>
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-muted mt-1 leading-tight">Time-series meter logs</div>
                  </div>

                  <div className="text-muted/60 self-center shrink-0">
                    <Icon name="arrowRight" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </div>

                  {/* Stage 2 */}
                  <div className="flex-1 rounded border border-gold bg-pale/60 p-1.5 sm:p-2 text-center shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="mx-auto flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-gold text-ink mb-1">
                        <Icon name="model" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-bold text-ink leading-tight">2. Random Forest Screening</div>
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-gold-deep font-medium mt-1 leading-tight">Pattern scoring model</div>
                  </div>

                  <div className="text-muted/60 self-center shrink-0">
                    <Icon name="arrowRight" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </div>

                  {/* Stage 3 */}
                  <div className="flex-1 rounded border border-line/80 bg-mist/20 p-1.5 sm:p-2 text-center flex flex-col justify-between">
                    <div>
                      <div className="mx-auto flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-white border border-line text-ink mb-1">
                        <Icon name="clipboard" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-bold text-ink leading-tight">3. Results for Human Review</div>
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-muted mt-1 leading-tight">Evidence-based triage</div>
                  </div>
                </div>
              </div>

              {/* C. Electricity Bill Analysis */}
              <div className="rounded border border-line bg-white p-2.5 sm:p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Icon name="bill" className="h-3.5 w-3.5 text-ink" />
                    <span className="text-[11px] font-semibold text-ink uppercase tracking-wider">
                      Electricity Bill Analysis
                    </span>
                  </div>
                  <span className="text-[10px] text-muted font-mono">OCR Comparison</span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  <div className="rounded border border-line/70 bg-mist/15 p-1.5 sm:p-2 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-muted">
                      <Icon name="calculator" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider">Usage</span>
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-bold text-ink mt-0.5 leading-tight">Units Consumed (kWh)</div>
                    <div className="text-[9px] sm:text-[10px] text-muted mt-0.5 leading-tight">Energy volume</div>
                  </div>

                  <div className="rounded border border-line/70 bg-mist/15 p-1.5 sm:p-2 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-muted">
                      <Icon name="file" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider">Timeline</span>
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-bold text-ink mt-0.5 leading-tight">Billing Period</div>
                    <div className="text-[9px] sm:text-[10px] text-muted mt-0.5 leading-tight">Cycle dates</div>
                  </div>

                  <div className="rounded border border-line/70 bg-mist/15 p-1.5 sm:p-2 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-muted">
                      <Icon name="table" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider">Billing</span>
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-bold text-ink mt-0.5 leading-tight">Amount Payable</div>
                    <div className="text-[9px] sm:text-[10px] text-muted mt-0.5 leading-tight">Tariff charges</div>
                  </div>
                </div>
              </div>
            </div>

            {/* D. Responsible-Use Footer */}
            <div className="border-t border-line bg-mist/30 px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2 text-xs text-muted">
              <Icon name="info" className="h-3.5 w-3.5 shrink-0 text-ink/70" />
              <span className="text-[10px] sm:text-[11px] leading-tight">
                Screening identifies patterns for review; it does not prove electricity theft.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. How it works & Machine Learning Workflow */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-14 sm:px-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('landing.howItWorksTitle')}</h2>
          <p className="mt-2 max-w-2xl text-muted">
            {t('landing.howItWorksSubtitle')}
          </p>
        </div>

        {/* 2A. ML Screening Pipeline */}
        <div className="mt-10 rounded border border-line bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-ink">{t('landing.mlWorkflowTitle')}</h3>
              <p className="mt-1 text-sm text-muted">{t('landing.mlWorkflowSubtitle')}</p>
            </div>
            <Badge tone="info">Machine Learning Pipeline</Badge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE_STEPS.map((step, idx) => (
              <div key={step.num} className="relative flex flex-col justify-between rounded border border-line bg-pale/40 p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-gold-deep">{step.num}</span>
                    {idx < PIPELINE_STEPS.length - 1 ? (
                      <span className="hidden lg:inline text-muted text-xs font-bold" aria-hidden="true">→</span>
                    ) : null}
                  </div>
                  <h4 className="mt-2 font-display text-sm font-bold text-ink">{step.title}</h4>
                  <p className="mt-1.5 text-xs text-ink/75 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2B. Three Distinct Analytical Workflows (Kept Separate) */}
        <div className="mt-12">
          <h3 className="text-2xl font-bold tracking-tight text-ink">{t('landing.threeJobsTitle')}</h3>
          <p className="mt-2 max-w-2xl text-muted text-sm sm:text-base">
            {t('landing.threeJobsSubtitle')}
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {WORKFLOWS.map((w) => (
              <div key={w.title} className="flex flex-col justify-between rounded border border-line bg-white p-5 shadow-xs">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded border border-line bg-pale text-ink">
                      <Icon name={w.icon} className="h-5 w-5" />
                    </div>
                    <Badge tone="grey">{w.tag}</Badge>
                  </div>
                  <h4 className="mt-4 font-display text-base font-bold text-ink">{w.title}</h4>
                  <p className="mt-2 text-xs sm:text-sm text-ink/80 leading-relaxed">{w.body}</p>
                </div>
                <div className="mt-5 border-t border-line pt-3">
                  <Link to={w.link} className="text-xs font-medium text-ink hover:underline inline-flex items-center gap-1">
                    Open {w.tag} <Icon name="arrowRight" className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Platform Capabilities & Key Features */}
      <section id="features" className="scroll-mt-4 border-t border-line bg-mist/50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{t('landing.featuresTitle')}</h2>
              <p className="mt-2 max-w-2xl text-muted">
                {t('landing.featuresSubtitle')}
              </p>
            </div>
            <Button to="/app/dashboard" variant="secondary" size="sm" icon="arrowRight">
              {t('publicLayout.goToWorkspace')}
            </Button>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col justify-between rounded border border-line bg-white p-4 shadow-xs hover:border-ink transition-colors">
                <div>
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-line bg-mist text-ink">
                    <Icon name={f.icon} className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3 font-display text-sm font-bold text-ink">{f.title}</h3>
                  <p className="mt-1 text-xs text-ink/75 leading-relaxed">{f.desc}</p>
                </div>
                <div className="mt-3 pt-2">
                  <Link to={f.to} className="text-xs font-medium text-gold-deep hover:underline inline-flex items-center gap-1">
                    Access feature <Icon name="arrowRight" className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Upcoming Features Callout */}
          <div className="mt-8 rounded border border-dashed border-line bg-white p-5">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" className="h-4 w-4 text-gold-deep" />
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-muted">
                {t('landing.upcomingTitle')}
              </h3>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded border border-line bg-pale/30 p-3">
                <p className="font-display text-sm font-semibold text-ink">{t('landing.upcoming1Title')}</p>
                <p className="mt-1 text-xs text-muted">{t('landing.upcoming1Desc')}</p>
              </div>
              <div className="rounded border border-line bg-pale/30 p-3">
                <p className="font-display text-sm font-semibold text-ink">{t('landing.upcoming2Title')}</p>
                <p className="mt-1 text-xs text-muted">{t('landing.upcoming2Desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Model Evaluation & Verified Metrics */}
      <section id="model" className="scroll-mt-4 border-y border-line bg-mist">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{t('landing.modelTitle')}</h2>
            <p className="mt-3 text-sm sm:text-base text-ink/85 leading-relaxed">
              {t('landing.modelDesc1', {
                testRows: MODEL_FACTS.testRows.toLocaleString('en-IN'),
                flagged: flagged.toLocaleString('en-IN'),
                tp: MODEL_FACTS.confusion.TP,
                fn: MODEL_FACTS.confusion.FN,
                positives: MODEL_FACTS.testPositives,
              })}
            </p>
            <p className="mt-3 text-sm sm:text-base text-ink/85 leading-relaxed">
              {t('landing.modelDesc2')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button to="/app/model" variant="dark" icon="arrowRight">
                {t('landing.seeLimitations')}
              </Button>
            </div>
          </div>

          <div>
            <div className="rounded border border-ink bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-display text-sm font-bold text-ink">Recorded Held-Out Test Evaluation</h3>
                <Badge tone="outline">n = 8,475</Badge>
              </div>
              <table className="w-full text-left text-sm mt-1">
                <tbody>
                  {METRICS_TABLE.map(([k, v]) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <th scope="row" className="py-2.5 pr-4 font-normal text-xs sm:text-sm text-ink/85">{k}</th>
                      <td className="py-2.5 text-right font-display text-xl font-bold text-ink">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 border-t border-line pt-3 text-xs text-muted leading-relaxed">
                {t('landing.sourceNote')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Responsible Use & Governance */}
      <section id="use" className="on-dark scroll-mt-4 bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="border-b border-gold/40 pb-4">
            <h2 className="text-3xl font-bold tracking-tight">{t('landing.responsibleUseTitle')}</h2>
            <p className="mt-2 max-w-2xl text-white/70 text-sm">
              Operational guardrails and ethical standards enforced throughout the platform.
            </p>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {RULES.map((rule, idx) => (
              <div key={idx} className="border-t-2 border-gold pt-3">
                <h3 className="font-display text-sm font-bold text-gold">{rule.title}</h3>
                <p className="mt-2 text-xs sm:text-sm text-white/80 leading-relaxed">{rule.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 border-t border-white/10 pt-6">
            <Button to="/app/dashboard" variant="primary" className="w-full sm:w-auto text-center">
              {t('landing.openDemo')}
            </Button>
            <Button to="/app/model" variant="secondary" className="w-full sm:w-auto text-center border-white/20 bg-white/10 text-white hover:bg-white/20">
              {t('landing.readVerified')}
            </Button>
            <Link to="/signin" className="text-sm underline underline-offset-2 hover:text-gold py-1">
              {t('landing.signInAccount')}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
