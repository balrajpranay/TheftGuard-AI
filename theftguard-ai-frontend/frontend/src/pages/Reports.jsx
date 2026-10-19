import { useMemo, useState } from 'react'
import { Button, DemoBadge, Field, inputClass, Notice, PageHeader, Panel } from '../components/ui'
import { useAppState } from '../state/AppState'
import { CATEGORIES } from '../lib/risk'
import { computeComparison, estimatedImpact } from '../lib/compare'
import { downloadCsv } from '../lib/exportCsv'
import { MODEL_FACTS } from '../data/modelFacts'
import { inr, num, pct, score as fmtScore, today } from '../lib/format'
import { getReportContext, classifyReportCustomers, COMPARISON_UNAVAILABLE_MESSAGE } from '../lib/reports'

const SECTIONS = [
  ['summary', 'Summary'],
  ['flagged', 'Customers recommended for review'],
  ['comparison', 'Consumption comparison'],
  ['method', 'Method and limitations'],
]

export default function Reports() {
  const { customers, source, uploaded, hasScores, thresholds, tariff, comparison } = useAppState()
  const [title, setTitle] = useState('Screening and consumption review')
  const [author, setAuthor] = useState('')
  const [period, setPeriod] = useState('')
  const [show, setShow] = useState({ summary: true, flagged: true, comparison: true, method: true })

  const reportContext = useMemo(
    () => getReportContext({ source, hasScores, uploaded, comparison }),
    [source, hasScores, uploaded, comparison]
  )

  const { classified, counts, flagged } = useMemo(
    () => classifyReportCustomers(customers, thresholds),
    [customers, thresholds]
  )

  const { items } = useMemo(() => {
    if (!reportContext.showComparisonData || !comparison?.rows) return { items: [] }
    return computeComparison(comparison.rows, comparison.splitDate)
  }, [reportContext.showComparisonData, comparison?.rows, comparison?.splitDate])

  const drops = useMemo(() => {
    if (!reportContext.showComparisonData) return []
    return items
      .filter((i) => i.change !== null && i.change <= -comparison.dropThreshold)
      .sort((a, b) => a.change - b.change)
  }, [reportContext.showComparisonData, items, comparison?.dropThreshold])

  const impact = useMemo(() => {
    if (!reportContext.showComparisonData) return 0
    return drops.reduce((s, i) => s + (estimatedImpact(i, tariff) || 0), 0)
  }, [reportContext.showComparisonData, drops, tariff])

  const exportFlagged = () =>
    downloadCsv(
      'theftguard-review-recommended.csv',
      [
        { key: 'customer_ref', label: 'customer_ref' },
        { key: 'score', label: 'model_score' },
        { key: 'category', label: 'review_category' },
      ],
      flagged.map((f) => ({
        customer_ref: f.id,
        score: typeof f.score === 'number' ? Number(f.score.toFixed(4)) : f.score,
        category: CATEGORIES[f.category]?.label || f.category,
      }))
    )

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <>
            <Button icon="download" onClick={exportFlagged} disabled={flagged.length === 0}>
              Download review list (CSV)
            </Button>
            <Button variant="primary" icon="print" onClick={() => window.print()}>
              Print or save as PDF
            </Button>
          </>
        }
      >
        Preview a report from the results and comparison currently loaded, then print it or save it as a PDF from your browser.
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[2fr_5fr]">
        <div className="space-y-5 print:hidden">
          <Panel title="Report details">
            <div className="space-y-4">
              <Field label="Title" htmlFor="r-title">
                <input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Prepared by" htmlFor="r-author" hint="Optional">
                <input id="r-author" value={author} onChange={(e) => setAuthor(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Period covered" htmlFor="r-period" hint="Optional, for example Apr to Sep 2026">
                <input id="r-period" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </Panel>
          <Panel title="Sections">
            <ul className="space-y-1.5">
              {SECTIONS.map(([k, label]) => (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={show[k]}
                      onChange={() => setShow({ ...show, [k]: !show[k] })}
                      className="h-4 w-4 accent-ink"
                    />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          </Panel>
          {reportContext.sidebarText ? (
            <Notice
              tone={reportContext.isScoredUpload ? 'ok' : reportContext.isUnscoredUpload ? 'warn' : 'info'}
              title={reportContext.sidebarTitle}
            >
              {reportContext.sidebarText}
            </Notice>
          ) : null}
        </div>

        <article aria-label="Report preview" className="print-sheet rounded border border-ink bg-white p-6 sm:p-8">
          {reportContext.isDemo ? (
            <p className="mb-4 rounded border border-gold bg-pale px-3 py-2 text-sm font-medium">
              <DemoBadge>Demonstration</DemoBadge> {reportContext.bannerText}
            </p>
          ) : (
            <p className="mb-4 rounded border border-line bg-surface px-3 py-2 text-sm text-ink">
              {reportContext.bannerText}
            </p>
          )}

          <header className="border-b border-ink pb-4">
            <p className="text-sm text-muted">TheftGuard AI</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight">{title || 'Untitled report'}</h2>
            <p className="mt-2 text-sm text-muted">
              {today()}{period ? `, covering ${period}` : ''}{author ? `, prepared by ${author}` : ''}
            </p>
          </header>

          {show.summary ? (
            <section className="mt-6">
              <h3 className="text-xl font-semibold">Summary</h3>
              <p className="mt-2 text-sm">
                {classified.length.toLocaleString('en-IN')} customers
                {source === 'uploaded' && uploaded ? ` from ${uploaded.fileName}` : ' in the loaded results'}.{' '}
                {counts.unscored === classified.length
                  ? 'None has a Model Score (rows were previewed without scoring, or the ML service was not called).'
                  : `${counts.review} are in the Review Recommended band (Model Score ${thresholds.review.toFixed(2)} or higher), ${counts.elevated} are Elevated (${thresholds.elevated.toFixed(2)} to below ${thresholds.review.toFixed(2)}) and ${counts.none} have no flag.${counts.unscored > 0 ? ` (${counts.unscored} not scored or failed validation).` : ''}`}
              </p>
              <p className="mt-2 text-sm">A Model Score ranks records for attention. It is not a probability, and a flag is not proof of electricity theft.</p>
            </section>
          ) : null}

          {show.flagged ? (
            <section className="mt-6">
              <h3 className="text-xl font-semibold">Customers recommended for review</h3>
              {flagged.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No customers are in the Review Recommended band for the loaded results.</p>
              ) : (
                <table className="mt-2 w-full text-left text-sm">
                  <caption className="sr-only">Customers in the review band</caption>
                  <thead className="border-b border-ink">
                    <tr>
                      <th scope="col" className="py-1.5 font-medium">Customer</th>
                      <th scope="col" className="py-1.5 font-medium">Model Score</th>
                      <th scope="col" className="py-1.5 font-medium">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagged.slice(0, 15).map((f, idx) => (
                      <tr key={`${f.id}-${idx}`} className="border-b border-line">
                        <th scope="row" className="py-1.5 font-medium">{f.id}</th>
                        <td className="py-1.5">{fmtScore(f.score)}</td>
                        <td className="py-1.5">{CATEGORIES[f.category]?.label || f.category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {flagged.length > 15 ? (
                <p className="mt-1 text-xs text-muted">Showing the 15 highest of {flagged.length}. The CSV download lists all of them.</p>
              ) : null}
            </section>
          ) : null}

          {show.comparison ? (
            <section className="mt-6">
              <h3 className="text-xl font-semibold">Consumption comparison</h3>
              {reportContext.showComparisonData ? (
                items.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No consumption data is loaded.</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm">
                      {reportContext.isDemo ? <span className="inline-block mr-2"><DemoBadge>Demonstration</DemoBadge></span> : null}
                      {comparison.label}. Readings before {comparison.splitDate} are historical and later readings are current.
                      {' '}{drops.length} of {items.length} customers show a decrease of {comparison.dropThreshold}% or more in average daily kWh.
                    </p>
                    {drops.length > 0 ? (
                      <table className="mt-2 w-full text-left text-sm">
                        <caption className="sr-only">Customers with a large decrease</caption>
                        <thead className="border-b border-ink">
                          <tr>
                            <th scope="col" className="py-1.5 font-medium">Customer</th>
                            <th scope="col" className="py-1.5 text-right font-medium">Change</th>
                            <th scope="col" className="py-1.5 text-right font-medium">Estimate (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drops.slice(0, 10).map((d) => (
                            <tr key={d.ref} className="border-b border-line">
                              <th scope="row" className="py-1.5 font-medium">{d.ref}</th>
                              <td className="py-1.5 text-right">{pct(d.change, 1)}</td>
                              <td className="py-1.5 text-right">{inr(estimatedImpact(d, tariff))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                    <p className="mt-2 text-sm">
                      <strong>Estimated difference: {inr(impact)}.</strong> This is an estimate at ₹{num(tariff, 2)} per kWh. It assumes each customer's
                      historical daily average would have continued, and ignores season, occupancy, outages and billing rules. It is not evidence of theft.
                    </p>
                  </>
                )
              ) : (
                <p className="mt-2 text-sm text-muted">
                  {COMPARISON_UNAVAILABLE_MESSAGE}
                </p>
              )}
            </section>
          ) : null}

          {show.method ? (
            <section className="mt-6">
              <h3 className="text-xl font-semibold">Method and limitations</h3>
              <p className="mt-2 text-sm">
                Model screening uses a Random Forest trained on 13 customer-level summary features. On a held-out test of {MODEL_FACTS.testRows.toLocaleString('en-IN')} customers
                it reached precision {MODEL_FACTS.metrics[0].value.toFixed(2)}, recall {MODEL_FACTS.metrics[1].value.toFixed(2)} and ROC-AUC {MODEL_FACTS.metrics[3].value.toFixed(2)}.
                Consumption comparison is separate, plain arithmetic on kWh readings.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {MODEL_FACTS.limitations.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </section>
          ) : null}

          <footer className="mt-8 border-t border-line pt-3 text-xs text-muted">
            Screening aid for human review. A qualified investigation, with verified local data, is required before any conclusion is drawn.
          </footer>
        </article>
      </div>
    </>
  )
}
