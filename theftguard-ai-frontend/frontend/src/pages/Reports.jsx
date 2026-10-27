import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, DemoBadge, Field, inputClass, Notice, PageHeader, Panel, cx } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../context/AuthContext'
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
  CUSTOMER_COMPLAINT_CATEGORIES,
  computeCustomerBillMetrics,
  hasCustomerReportContent,
} from '../lib/reports'

const SECTIONS = [
  ['summary', 'Summary'],
  ['flagged', 'Customers recommended for review'],
  ['comparison', 'Consumption comparison'],
  ['method', 'Method and limitations'],
]

export default function Reports() {
  const auth = useAuth()
  const user = auth?.user
  const { customers, source, uploaded, hasScores, thresholds, tariff, comparison } = useAppState()

  // Report type state: 'department' | 'customer'
  const [reportType, setReportType] = useState('department')

  // Department Report state
  const [title, setTitle] = useState('Screening and consumption review')
  const [author, setAuthor] = useState('')
  const [period, setPeriod] = useState('')
  const [show, setShow] = useState({ summary: true, flagged: true, comparison: true, method: true })

  // Department Report Editor state (5 custom fields)
  const [department, setDepartment] = useState('')
  const [executiveSummary, setExecutiveSummary] = useState('')
  const [observations, setObservations] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [notes, setNotes] = useState('')
  const [editorExpanded, setEditorExpanded] = useState(true)

  // Customer Electricity Report state (12 fields)
  const [customerName, setCustomerName] = useState(() => user?.user_metadata?.full_name || '')
  const [connectionRef, setConnectionRef] = useState('')
  const [complaintCategory, setComplaintCategory] = useState(CUSTOMER_COMPLAINT_CATEGORIES[0])
  const [billingPeriod, setBillingPeriod] = useState('')
  const [prevBillAmount, setPrevBillAmount] = useState('')
  const [currBillAmount, setCurrBillAmount] = useState('')
  const [prevReading, setPrevReading] = useState('')
  const [currReading, setCurrReading] = useState('')
  const [billedUnits, setBilledUnits] = useState('')
  const [issueDescription, setIssueDescription] = useState('')
  const [requestedResolution, setRequestedResolution] = useState('')
  const [evidenceReferences, setEvidenceReferences] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  // Prefill customer name if user session loads after mount
  useEffect(() => {
    if (user?.user_metadata?.full_name && !customerName) {
      setCustomerName(user.user_metadata.full_name)
    }
  }, [user?.user_metadata?.full_name, customerName])

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

  const customerFields = useMemo(
    () => ({
      customerName,
      connectionRef,
      complaintCategory,
      billingPeriod,
      prevBillAmount,
      currBillAmount,
      prevReading,
      currReading,
      billedUnits,
      issueDescription,
      requestedResolution,
      evidenceReferences,
      customerNotes,
    }),
    [
      customerName,
      connectionRef,
      complaintCategory,
      billingPeriod,
      prevBillAmount,
      currBillAmount,
      prevReading,
      currReading,
      billedUnits,
      issueDescription,
      requestedResolution,
      evidenceReferences,
      customerNotes,
    ]
  )

  const customerMetrics = useMemo(
    () =>
      computeCustomerBillMetrics({
        prevAmount: prevBillAmount,
        currAmount: currBillAmount,
        prevReading,
        currReading,
        billedUnits,
      }),
    [prevBillAmount, currBillAmount, prevReading, currReading, billedUnits]
  )

  const hasAnyCustomerData = useMemo(
    () => hasCustomerReportContent(customerFields),
    [customerFields]
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

  const exportCustomerReport = () =>
    downloadCsv(
      `theftguard-customer-report-${(connectionRef || 'grievance').replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`,
      [
        { key: 'field', label: 'Field' },
        { key: 'value', label: 'Details' },
      ],
      [
        { field: 'Report Type', value: 'Customer Electricity Report' },
        { field: 'Consumer Name', value: customerName || 'Not specified' },
        { field: 'Service Connection / Meter Ref', value: connectionRef || 'Not specified' },
        { field: 'Grievance Category', value: complaintCategory },
        { field: 'Disputed Billing Period', value: billingPeriod || 'Not specified' },
        { field: 'Previous Bill Amount (INR)', value: prevBillAmount || '' },
        { field: 'Current Bill Amount (INR)', value: currBillAmount || '' },
        { field: 'Amount Difference (INR)', value: customerMetrics.amountDiff !== null ? String(customerMetrics.amountDiff) : '' },
        { field: 'Previous Meter Reading (kWh)', value: prevReading || '' },
        { field: 'Current Meter Reading (kWh)', value: currReading || '' },
        { field: 'Billed Units (kWh)', value: billedUnits || '' },
        { field: 'Statement of Grievance', value: issueDescription || '' },
        { field: 'Requested Relief & Action', value: requestedResolution || '' },
        { field: 'Enclosed Evidence & References', value: evidenceReferences || '' },
        { field: 'Additional Remarks', value: customerNotes || '' },
        { field: 'Date Generated', value: today() },
      ]
    )

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <>
            {reportType === 'customer' ? (
              <Button icon="download" onClick={exportCustomerReport}>
                Download grievance data (CSV)
              </Button>
            ) : (
              <Button icon="download" onClick={exportFlagged} disabled={flagged.length === 0}>
                Download review list (CSV)
              </Button>
            )}
            <Button variant="primary" icon="print" onClick={() => window.print()}>
              Print or save as PDF
            </Button>
          </>
        }
      >
        {reportType === 'customer'
          ? 'Prepare and preview an official electricity grievance report for utility escalation, then print or save as a PDF.'
          : 'Preview a report from the results and comparison currently loaded, then print it or save it as a PDF from your browser.'}
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[2fr_5fr] items-start">
        <div data-tour="reports-builder" className="space-y-5 print:hidden lg:sticky lg:top-4">
          {/* Report Type Selector */}
          <Panel title="Report type" subtitle="Choose who this report is prepared for">
            <div
              role="radiogroup"
              aria-label="Select report type"
              className="grid grid-cols-2 gap-2 p-1 bg-mist rounded border border-line"
            >
              <button
                type="button"
                role="radio"
                aria-checked={reportType === 'department'}
                data-testid="report-type-department"
                onClick={() => setReportType('department')}
                className={cx(
                  'flex items-center justify-center gap-1.5 rounded py-2 px-3 text-xs font-semibold transition-all text-center',
                  reportType === 'department'
                    ? 'bg-ink text-white shadow-sm'
                    : 'bg-transparent text-ink hover:bg-white/60'
                )}
              >
                <Icon name="report" className="h-3.5 w-3.5 shrink-0" />
                <span>Department</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={reportType === 'customer'}
                data-testid="report-type-customer"
                onClick={() => setReportType('customer')}
                className={cx(
                  'flex items-center justify-center gap-1.5 rounded py-2 px-3 text-xs font-semibold transition-all text-center',
                  reportType === 'customer'
                    ? 'bg-ink text-white shadow-sm'
                    : 'bg-transparent text-ink hover:bg-white/60'
                )}
              >
                <Icon name="bill" className="h-3.5 w-3.5 shrink-0" />
                <span>Customer Report</span>
              </button>
            </div>
          </Panel>

          {reportType === 'customer' ? (
            /* Customer Report Builder */
            <div className="space-y-5">
              <Panel
                title="Consumer Details & Grievance"
                subtitle="Identification for official grievance submission"
              >
                <div className="space-y-4">
                  <Field label="Customer / Consumer Name" htmlFor="r-cust-name" hint="Prefilled from account or enter manually">
                    <input
                      id="r-cust-name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Smt. Priya Sharma"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Service Connection / Meter Ref" htmlFor="r-cust-conn" hint="Consumer or Meter ID">
                    <input
                      id="r-cust-conn"
                      value={connectionRef}
                      onChange={(e) => setConnectionRef(e.target.value)}
                      placeholder="e.g. USC-904218 / Meter #M-7712"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Grievance Category" htmlFor="r-cust-category">
                    <select
                      id="r-cust-category"
                      value={complaintCategory}
                      onChange={(e) => setComplaintCategory(e.target.value)}
                      className={inputClass}
                    >
                      {CUSTOMER_COMPLAINT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Disputed Billing Period" htmlFor="r-cust-period" hint="e.g. Sep 2026 or Aug - Sep 2026">
                    <input
                      id="r-cust-period"
                      value={billingPeriod}
                      onChange={(e) => setBillingPeriod(e.target.value)}
                      placeholder="e.g. September 2026"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel
                title="Comparative Billing & Meter Readings"
                subtitle="Optional numerical inputs for discrepancy analysis"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Prev Bill (₹)" htmlFor="r-cust-prev-amt" hint="Optional">
                      <input
                        id="r-cust-prev-amt"
                        type="text"
                        inputMode="decimal"
                        value={prevBillAmount}
                        onChange={(e) => setPrevBillAmount(e.target.value)}
                        placeholder="e.g. 1850"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Curr Bill (₹)" htmlFor="r-cust-curr-amt" hint="Optional">
                      <input
                        id="r-cust-curr-amt"
                        type="text"
                        inputMode="decimal"
                        value={currBillAmount}
                        onChange={(e) => setCurrBillAmount(e.target.value)}
                        placeholder="e.g. 4200"
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Prev Reading (kWh)" htmlFor="r-cust-prev-read" hint="Optional">
                      <input
                        id="r-cust-prev-read"
                        type="text"
                        inputMode="decimal"
                        value={prevReading}
                        onChange={(e) => setPrevReading(e.target.value)}
                        placeholder="e.g. 12450"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Curr Reading (kWh)" htmlFor="r-cust-curr-read" hint="Optional">
                      <input
                        id="r-cust-curr-read"
                        type="text"
                        inputMode="decimal"
                        value={currReading}
                        onChange={(e) => setCurrReading(e.target.value)}
                        placeholder="e.g. 12790"
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <Field label="Billed Units (kWh)" htmlFor="r-cust-billed-units" hint="Units charged on current bill">
                    <input
                      id="r-cust-billed-units"
                      type="text"
                      inputMode="decimal"
                      value={billedUnits}
                      onChange={(e) => setBilledUnits(e.target.value)}
                      placeholder="e.g. 450"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel title="Statement of Grievance & Relief" subtitle="Formal consumer complaint details">
                <div className="space-y-4">
                  <Field label="Statement of Grievance" htmlFor="r-cust-issue" hint="Detailed explanation">
                    <textarea
                      id="r-cust-issue"
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      rows={3}
                      placeholder="Explain the unexpected spike, abnormal meter behavior, or tariff mismatch..."
                      className={cx(inputClass, 'min-h-[72px] resize-y leading-relaxed')}
                    />
                  </Field>

                  <Field label="Requested Relief & Action" htmlFor="r-cust-resolution" hint="Action sought">
                    <textarea
                      id="r-cust-resolution"
                      value={requestedResolution}
                      onChange={(e) => setRequestedResolution(e.target.value)}
                      rows={2}
                      placeholder="e.g. On-site meter testing, verification of multiplier, and revised billing..."
                      className={cx(inputClass, 'min-h-[60px] resize-y leading-relaxed')}
                    />
                  </Field>

                  <Field label="Enclosed Evidence / Bill Ref" htmlFor="r-cust-evidence" hint="Attachments">
                    <textarea
                      id="r-cust-evidence"
                      value={evidenceReferences}
                      onChange={(e) => setEvidenceReferences(e.target.value)}
                      rows={2}
                      placeholder="e.g. Attached September bill copy #B-991, meter photo taken on 28th..."
                      className={cx(inputClass, 'min-h-[60px] resize-y leading-relaxed')}
                    />
                  </Field>

                  <Field label="Additional Declarations" htmlFor="r-cust-notes" hint="Optional">
                    <textarea
                      id="r-cust-notes"
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. Consumer declares that connected load and household occupancy remained unchanged..."
                      className={cx(inputClass, 'min-h-[60px] resize-y leading-relaxed')}
                    />
                  </Field>
                </div>
              </Panel>

              <Notice tone="info" title="Consumer Grievance Submission">
                This customer electricity report is structured for official dispute escalation with the DISCOM Consumer Grievance Redressal Forum (CGRF), Electricity Ombudsman, or billing helpdesk.
              </Notice>
            </div>
          ) : (
            /* Department Investigation Report Builder */
            <>
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
            </>
          )}
        </div>

        <article aria-label="Report preview" className="print-sheet rounded border border-ink bg-white p-5 sm:p-8">
          {reportType === 'customer' ? (
            /* Customer Electricity Report Preview */
            <div data-testid="customer-report-preview">
              <div className="mb-4 rounded border border-line bg-mist px-3 py-2 text-sm text-ink flex items-center justify-between flex-wrap gap-2">
                <span>Consumer Electricity Grievance & Billing Dispute Report • Prepared for Utility Escalation</span>
                <Badge tone="warn" className="text-xs">{complaintCategory}</Badge>
              </div>

              <header className="border-b border-ink pb-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-muted">TheftGuard AI • Consumer Grievance Portal</p>
                  <span
                    data-testid="preview-complaint-badge"
                    className="text-xs font-semibold text-amber-900 uppercase tracking-wider bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded"
                  >
                    {complaintCategory}
                  </span>
                </div>
                <h2 className="mt-1 text-3xl font-bold tracking-tight text-ink">Customer Electricity Report</h2>
                <p className="mt-2 text-sm text-muted">
                  {today()}
                  {billingPeriod ? ` • Disputed Bill Period: ${billingPeriod}` : ''}
                  {connectionRef ? ` • Connection Ref: ${connectionRef}` : ''}
                  {customerName ? ` • Consumer: ${customerName}` : ''}
                </p>
              </header>

              {/* Customer Details Card */}
              <section className="mt-6" data-testid="section-customer-identification">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-xl font-semibold text-ink">Consumer & Connection Details</h3>
                  <Badge tone="grey" className="text-[11px] font-medium">Consumer Record</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded border border-line bg-mist/50 p-4 text-sm">
                  <div>
                    <span className="text-xs font-medium text-muted uppercase tracking-wider block">Consumer Name</span>
                    <span className="font-semibold text-ink mt-0.5 block" data-testid="preview-customer-name">
                      {customerName || 'Consumer (Unspecified)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted uppercase tracking-wider block">Connection / Meter Ref</span>
                    <span className="font-semibold text-ink mt-0.5 block" data-testid="preview-connection-ref">
                      {connectionRef || 'Not specified'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted uppercase tracking-wider block">Grievance Category</span>
                    <span className="font-semibold text-ink mt-0.5 block">{complaintCategory}</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted uppercase tracking-wider block">Disputed Billing Period</span>
                    <span className="font-semibold text-ink mt-0.5 block">{billingPeriod || 'Current Billing Cycle'}</span>
                  </div>
                </div>
              </section>

              {/* Comparative Billing & Meter Readings */}
              {customerMetrics.hasAnyData ? (
                <section className="mt-6" data-testid="section-customer-metrics">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xl font-semibold text-ink">Comparative Billing & Meter Readings</h3>
                    <Badge tone="grey" className="text-[11px] font-medium">Calculated Metrics</Badge>
                  </div>

                  <div className="space-y-3">
                    {customerMetrics.hasAmountComparison ? (
                      <div className="rounded border border-line bg-white p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Billed Amount Comparison</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-xs text-muted block">Previous Bill</span>
                            <span className="font-medium text-ink tabular-nums">₹{customerMetrics.prevAmount.toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted block">Current Bill</span>
                            <span className="font-bold text-ink tabular-nums">₹{customerMetrics.currAmount.toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted block">Variance</span>
                            <span
                              className={cx(
                                'font-bold tabular-nums',
                                customerMetrics.amountDiff > 0 ? 'text-amber-800' : customerMetrics.amountDiff < 0 ? 'text-ok' : 'text-ink'
                              )}
                              data-testid="preview-amount-diff"
                            >
                              {customerMetrics.amountDiff > 0 ? '+' : ''}
                              ₹{customerMetrics.amountDiff.toLocaleString('en-IN')}
                              {customerMetrics.amountPercentChange !== null
                                ? ` (${customerMetrics.amountDiff > 0 ? '+' : ''}${customerMetrics.amountPercentChange.toFixed(1)}%)`
                                : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {customerMetrics.hasAnyMeterData ? (
                      <div className="rounded border border-line bg-white p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Meter Reading & Consumption</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          {customerMetrics.prevReading !== null ? (
                            <div>
                              <span className="text-xs text-muted block">Previous Reading</span>
                              <span className="font-medium text-ink tabular-nums">{customerMetrics.prevReading.toLocaleString('en-IN')} kWh</span>
                            </div>
                          ) : null}
                          {customerMetrics.currReading !== null ? (
                            <div>
                              <span className="text-xs text-muted block">Current Reading</span>
                              <span className="font-bold text-ink tabular-nums">{customerMetrics.currReading.toLocaleString('en-IN')} kWh</span>
                            </div>
                          ) : null}
                          {customerMetrics.readingUnits !== null ? (
                            <div>
                              <span className="text-xs text-muted block">Calculated Units (Difference)</span>
                              <span className="font-bold text-ink tabular-nums" data-testid="preview-reading-units">
                                {customerMetrics.readingUnits.toLocaleString('en-IN')} kWh
                              </span>
                            </div>
                          ) : null}
                          {customerMetrics.billedUnits !== null ? (
                            <div>
                              <span className="text-xs text-muted block">Units Charged on Bill</span>
                              <span className="font-bold text-ink tabular-nums" data-testid="preview-billed-units">
                                {customerMetrics.billedUnits.toLocaleString('en-IN')} kWh
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {customerMetrics.unitsDifference !== null ? (
                          <div className="mt-3 pt-3 border-t border-line">
                            {customerMetrics.unitsDifference > 0 ? (
                              <div className="flex items-start gap-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded p-2" data-testid="preview-units-discrepancy">
                                <Icon name="alert" className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <span>
                                  Discrepancy detected: Billed units exceed the meter reading increment by +{customerMetrics.unitsDifference.toLocaleString('en-IN')} kWh.
                                </span>
                              </div>
                            ) : customerMetrics.unitsDifference === 0 ? (
                              <div className="flex items-start gap-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded p-2" data-testid="preview-units-match">
                                <Icon name="check" className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                                <span>
                                  Billed units match the meter reading increment exactly ({customerMetrics.readingUnits.toLocaleString('en-IN')} kWh).
                                </span>
                              </div>
                            ) : (
                              <div className="text-xs text-muted">
                                Billed units are {Math.abs(customerMetrics.unitsDifference).toLocaleString('en-IN')} kWh lower than the meter reading difference.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {/* Statement of Grievance */}
              {issueDescription.trim() ? (
                <section className="mt-6" data-testid="section-customer-issue">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-ink">Statement of Grievance</h3>
                    <Badge tone="grey" className="text-[11px] font-medium">Customer Statement</Badge>
                  </div>
                  <div className="mt-2 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap break-words">
                    {issueDescription}
                  </div>
                </section>
              ) : null}

              {/* Requested Relief & Action */}
              {requestedResolution.trim() ? (
                <section className="mt-6" data-testid="section-customer-resolution">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-ink">Requested Relief & Action</h3>
                    <Badge tone="grey" className="text-[11px] font-medium">Customer Statement</Badge>
                  </div>
                  <div className="mt-2 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap break-words">
                    {requestedResolution}
                  </div>
                </section>
              ) : null}

              {/* Enclosed Documents & Evidence */}
              {evidenceReferences.trim() ? (
                <section className="mt-6" data-testid="section-customer-evidence">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-ink">Enclosed Documents & References</h3>
                    <Badge tone="grey" className="text-[11px] font-medium">Customer Statement</Badge>
                  </div>
                  <div className="mt-2 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap break-words">
                    {evidenceReferences}
                  </div>
                </section>
              ) : null}

              {/* Additional Declarations */}
              {customerNotes.trim() ? (
                <section className="mt-6" data-testid="section-customer-notes">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-ink">Additional Declarations</h3>
                    <Badge tone="grey" className="text-[11px] font-medium">Customer Statement</Badge>
                  </div>
                  <div className="mt-2 text-sm leading-relaxed text-ink/90 whitespace-pre-wrap break-words">
                    {customerNotes}
                  </div>
                </section>
              ) : null}

              {!hasAnyCustomerData ? (
                <div className="mt-6 rounded border border-dashed border-line p-6 text-center text-sm text-muted">
                  Fill in the consumer details, billing comparison, and grievance statement in the builder panel on the left to populate your dispute report.
                </div>
              ) : null}

              {/* Required Neutral Grievance Disclaimer */}
              <div data-testid="customer-report-disclaimer" className="mt-8 rounded border border-line bg-mist p-4 text-xs leading-relaxed text-muted">
                <strong>Official Notice & Disclaimer:</strong> This report is generated based on consumer-submitted information and billing documentation for submission to the electricity distribution utility (DISCOM). It documents a billing or meter grievance and does not establish that a billing error or electricity theft occurred. Official verification and on-site inspection by authorized utility personnel is required.
              </div>

              <footer className="mt-6 border-t border-line pt-3 text-xs text-muted flex flex-wrap justify-between gap-2">
                <span>Generated via TheftGuard AI Consumer Grievance Portal. For official grievance escalation and discom dispute tracking.</span>
                <span>Date: {today()}</span>
              </footer>
            </div>
          ) : (
            /* Department Investigation Report Preview */
            <>
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
            </>
          )}
        </article>
      </div>
    </>
  )
}
