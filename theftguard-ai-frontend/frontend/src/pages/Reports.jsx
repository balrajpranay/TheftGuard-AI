import { useMemo, useState } from 'react'
import { Badge, Button, DemoBadge, Field, inputClass, Notice, PageHeader, Panel, cx } from '../components/ui'
import Icon from '../components/Icon'
import { useAppState } from '../state/AppState'
import { CATEGORIES } from '../lib/risk'
import { computeComparison, estimatedImpact } from '../lib/compare'
import { downloadCsv } from '../lib/exportCsv'
import { MODEL_FACTS } from '../data/modelFacts'
import { inr, num, pct, score as fmtScore, today } from '../lib/format'
import {
  getReportContext,
  classifyReportCustomers,
  COMPARISON_UNAVAILABLE_MESSAGE,
  getActiveCustomSections,
} from '../lib/reports'

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

  // Report Editor state (5 custom fields)
  const [department, setDepartment] = useState('')
  const [executiveSummary, setExecutiveSummary] = useState('')
  const [observations, setObservations] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [notes, setNotes] = useState('')
  const [editorExpanded, setEditorExpanded] = useState(true)

  const customFields = useMemo(
    () => ({
      department,
      executiveSummary,
      observations,
      recommendations,
      notes,
    }),
    [department, executiveSummary, observations, recommendations, notes]
  )

  const activeCustomSections = useMemo(
    () => getActiveCustomSections(customFields),
    [customFields]
  )

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

      <div className="grid gap-5 lg:grid-cols-[2fr_5fr] items-start">
        <div data-tour="reports-builder" className="space-y-5 print:hidden lg:sticky lg:top-4">
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

          <Panel
            title="Report Editor"
            subtitle="Custom commentary & findings"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditorExpanded((prev) => !prev)}
                className="text-xs h-7 min-h-0 px-2 font-medium"
                aria-expanded={editorExpanded}
                aria-controls="report-editor-fields"
              >
                <Icon name={editorExpanded ? 'chevLeft' : 'chevRight'} className="h-3.5 w-3.5 rotate-90 sm:rotate-0" />
                <span>{editorExpanded ? 'Collapse' : 'Expand'}</span>
              </Button>
            }
          >
            {editorExpanded ? (
              <div id="report-editor-fields" className="space-y-4">
                <Field label="Department / Office" htmlFor="r-dept" hint="Optional">
                  <input
                    id="r-dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Audit Cell / Special Operations"
                    className={inputClass}
                  />
                </Field>

                <Field label="Executive Summary" htmlFor="r-exec-summary" hint="Optional">
                  <textarea
                    id="r-exec-summary"
                    value={executiveSummary}
                    onChange={(e) => setExecutiveSummary(e.target.value)}
                    rows={3}
                    placeholder="High-level operational summary of screening context..."
                    className={cx(inputClass, 'min-h-[72px] resize-y leading-relaxed')}
                  />
                </Field>

                <Field label="Observations and Findings" htmlFor="r-observations" hint="Optional">
                  <textarea
                    id="r-observations"
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={3}
                    placeholder="Field inspection findings, physical checks, or meter observations..."
                    className={cx(inputClass, 'min-h-[72px] resize-y leading-relaxed')}
                  />
                </Field>

                <Field label="Recommendations / Action Taken" htmlFor="r-recommendations" hint="Optional">
                  <textarea
                    id="r-recommendations"
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    rows={3}
                    placeholder="Enforcement action, meter recalibration, or follow-up schedule..."
                    className={cx(inputClass, 'min-h-[72px] resize-y leading-relaxed')}
                  />
                </Field>

                <Field label="Additional Notes" htmlFor="r-notes" hint="Optional">
                  <textarea
                    id="r-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Reference case numbers, caveats, or secondary disclosures..."
                    className={cx(inputClass, 'min-h-[60px] resize-y leading-relaxed')}
                  />
                </Field>
              </div>
            ) : (
              <div className="py-1 text-xs text-muted flex items-center justify-between">
                <span>
                  {activeCustomSections.length > 0 || department.trim()
                    ? `${activeCustomSections.length + (department.trim() ? 1 : 0)} custom field(s) populated`
                    : 'Editor collapsed'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditorExpanded(true)}
                  className="font-medium text-ink underline hover:text-slate-600"
                >
                  Expand editor
                </button>
              </div>
            )}
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

        <article aria-label="Report preview" className="print-sheet rounded border border-ink bg-white p-5 sm:p-8">
          {reportContext.isDemo ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-gold bg-pale px-3 py-2 text-sm font-medium">
              <DemoBadge>Demonstration</DemoBadge>
              <span>{reportContext.bannerText}</span>
            </div>
          ) : (
            <div className="mb-4 rounded border border-line bg-mist px-3 py-2 text-sm text-ink">
              {reportContext.bannerText}
            </div>
          )}

          <header className="border-b border-ink pb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted">TheftGuard AI</p>
              {department.trim() ? (
                <span
                  data-testid="preview-department-badge"
                  className="text-xs font-semibold text-slate-700 uppercase tracking-wider bg-slate-100 border border-slate-200 px-2 py-0.5 rounded"
                >
                  {department.trim()}
                </span>
              ) : null}
            </div>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-ink">{title || 'Untitled report'}</h2>
            <p className="mt-2 text-sm text-muted">
              {today()}{period ? `, covering ${period}` : ''}{author ? `, prepared by ${author}` : ''}{department.trim() ? ` • Department: ${department.trim()}` : ''}
            </p>
          </header>

          {/* Custom Section 1: Executive Summary */}
          {executiveSummary.trim() ? (
            <section className="mt-6" data-testid="section-executive-summary">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold text-ink">Executive Summary</h3>
                <Badge tone="grey" className="text-[11px] font-medium">User Commentary</Badge>
              </div>
              <div className="mt-2 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap break-words">
                {executiveSummary}
              </div>
            </section>
          ) : null}

          {show.summary ? (
            <section className="mt-6">
              <h3 className="text-xl font-semibold text-ink">Summary</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/90">
                {classified.length.toLocaleString('en-IN')} customers
                {source === 'uploaded' && uploaded ? ` from ${uploaded.fileName}` : ' in the loaded results'}.{' '}
                {counts.unscored === classified.length
                  ? 'None has a Model Score (rows were previewed without scoring, or the ML service was not called).'
                  : `${counts.review} are in the Review Recommended band (Model Score ${thresholds.review.toFixed(2)} or higher), ${counts.elevated} are Elevated (${thresholds.elevated.toFixed(2)} to below ${thresholds.review.toFixed(2)}) and ${counts.none} have no flag.${counts.unscored > 0 ? ` (${counts.unscored} not scored or failed validation).` : ''}`}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink/90">A Model Score ranks records for attention. It is not a probability, and a flag is not proof of electricity theft.</p>
            </section>
          ) : null}

          {/* Custom Section 2: Observations and Findings */}
          {observations.trim() ? (
            <section className="mt-6" data-testid="section-observations">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold text-ink">Observations and Findings</h3>
                <Badge tone="grey" className="text-[11px] font-medium">User Commentary</Badge>
              </div>
              <div className="mt-2 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap break-words">
                {observations}
              </div>
            </section>
          ) : null}

          {show.flagged ? (
            <section className="mt-6">
              <h3 className="text-xl font-semibold text-ink">Customers recommended for review</h3>
              {flagged.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No customers are in the Review Recommended band for the loaded results.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="mt-2 w-full text-left text-sm min-w-[280px]">
                    <caption className="sr-only">Customers in the review band</caption>
                    <thead className="border-b border-ink">
                      <tr>
                        <th scope="col" className="w-1/3 py-2 pr-4 font-semibold text-ink">Customer</th>
                        <th scope="col" className="w-1/3 py-2 px-4 font-semibold text-ink">Model Score</th>
                        <th scope="col" className="w-1/3 py-2 pl-4 font-semibold text-ink">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flagged.slice(0, 15).map((f, idx) => (
                        <tr key={`${f.id}-${idx}`} className="border-b border-line last:border-0">
                          <th scope="row" className="py-2 pr-4 font-medium text-ink">{f.id}</th>
                          <td className="py-2 px-4 tabular-nums">{fmtScore(f.score)}</td>
                          <td className="py-2 pl-4">{CATEGORIES[f.category]?.label || f.category}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {flagged.length > 15 ? (
                <p className="mt-1 text-xs text-muted">Showing the 15 highest of {flagged.length}. The CSV download lists all of them.</p>
              ) : null}
            </section>
          ) : null}

          {show.comparison ? (
            <section className="mt-6">
              <h3 className="text-xl font-semibold text-ink">Consumption comparison</h3>
              {reportContext.showComparisonData ? (
                items.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No consumption data is loaded.</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-ink/90">
                      {reportContext.isDemo ? <span className="inline-block mr-2"><DemoBadge>Demonstration</DemoBadge></span> : null}
                      {comparison.label}. Readings before {comparison.splitDate} are historical and later readings are current.
                      {' '}{drops.length} of {items.length} customers show a decrease of {comparison.dropThreshold}% or more in average daily kWh.
                    </p>
                    {drops.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="mt-2 w-full text-left text-sm min-w-[280px]">
                          <caption className="sr-only">Customers with a large decrease</caption>
                          <thead className="border-b border-ink">
                            <tr>
                              <th scope="col" className="w-1/3 py-2 pr-4 font-semibold text-ink">Customer</th>
                              <th scope="col" className="w-1/3 py-2 px-4 text-right font-semibold text-ink">Change</th>
                              <th scope="col" className="w-1/3 py-2 pl-4 text-right font-semibold text-ink">Estimate (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drops.slice(0, 10).map((d) => (
                              <tr key={d.ref} className="border-b border-line last:border-0">
                                <th scope="row" className="py-2 pr-4 font-medium text-ink">{d.ref}</th>
                                <td className="py-2 px-4 text-right tabular-nums">{pct(d.change, 1)}</td>
                                <td className="py-2 pl-4 text-right font-medium tabular-nums">{inr(estimatedImpact(d, tariff))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    <p className="mt-2 text-sm leading-relaxed text-ink/90">
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

          {/* Custom Section 3: Recommendations / Action Taken */}
          {recommendations.trim() ? (
            <section className="mt-6" data-testid="section-recommendations">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold text-ink">Recommendations / Action Taken</h3>
                <Badge tone="grey" className="text-[11px] font-medium">User Commentary</Badge>
              </div>
              <div className="mt-2 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap break-words">
                {recommendations}
              </div>
            </section>
          ) : null}

          {/* Custom Section 4: Additional Notes */}
          {notes.trim() ? (
            <section className="mt-6" data-testid="section-additional-notes">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold text-ink">Additional Notes</h3>
                <Badge tone="grey" className="text-[11px] font-medium">User Commentary</Badge>
              </div>
              <div className="mt-2 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap break-words">
                {notes}
              </div>
            </section>
          ) : null}

          {show.method ? (
            <section className="mt-6">
              <h3 className="text-xl font-semibold text-ink">Method and limitations</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/90">
                Model screening uses a Random Forest trained on 13 customer-level summary features. On a held-out test of {MODEL_FACTS.testRows.toLocaleString('en-IN')} customers
                it reached precision {MODEL_FACTS.metrics[0].value.toFixed(2)}, recall {MODEL_FACTS.metrics[1].value.toFixed(2)} and ROC-AUC {MODEL_FACTS.metrics[3].value.toFixed(2)}.
                Consumption comparison is separate, plain arithmetic on kWh readings.
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink/90">
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
