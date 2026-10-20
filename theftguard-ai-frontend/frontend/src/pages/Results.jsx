import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, CategoryBadge, DemoBadge, EmptyState, Field, inputClass, Notice, PageHeader, Panel, ScoreScale } from '../components/ui'
import Drawer from '../components/Drawer'
import Icon from '../components/Icon'
import { useAppState } from '../state/AppState'
import { useLanguage } from '../context/LanguageContext'
import { CATEGORIES, classify, DEFAULT_THRESHOLDS, MODEL_DEFAULT_THRESHOLD } from '../lib/risk'
import { downloadCsv } from '../lib/exportCsv'
import { FEATURE_NAMES } from '../data/features'
import { num, score as fmtScore } from '../lib/format'

const SORTS = {
  'score-desc': 'Model Score, high to low',
  'score-asc': 'Model Score, low to high',
  id: 'Customer',
}

export default function Results() {
  const { customers, source, uploaded, hasScores, thresholds, setThresholds, addInvestigation } = useAppState()
  const { language, t } = useLanguage()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState('score-desc')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [added, setAdded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [invError, setInvError] = useState('')
  const [invTicket, setInvTicket] = useState('')
  const [bandError, setBandError] = useState('')

  useEffect(() => { setPage(1) }, [q, cat, sort, pageSize, customers])
  useEffect(() => {
    setAdded(false)
    setAdding(false)
    setInvError('')
    setInvTicket('')
  }, [selected])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = customers
      .map((c) => ({ ...c, category: classify(c.score, thresholds) }))
      .filter((c) => (cat === 'all' || c.category === cat) && (!term || c.id.toLowerCase().includes(term)))
    const byScore = (a, b) => (a.score === null ? 1 : b.score === null ? -1 : 0)
    list.sort((a, b) => {
      if (sort === 'id') return a.id.localeCompare(b.id)
      const nulls = byScore(a, b)
      if (nulls !== 0) return nulls
      return sort === 'score-desc' ? b.score - a.score : a.score - b.score
    })
    return list
  }, [customers, q, cat, sort, thresholds])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages)
  const slice = rows.slice((current - 1) * pageSize, current * pageSize)
  const first = rows.length === 0 ? 0 : (current - 1) * pageSize + 1
  const last = Math.min(rows.length, current * pageSize)
  const allUnscored = customers.length > 0 && customers.every((c) => c.score === null)

  function changeBand(key, raw) {
    const v = Number(raw)
    if (!Number.isFinite(v) || v < 0 || v > 1) { setBandError('Enter a value between 0 and 1.'); return }
    const next = { ...thresholds, [key]: v }
    if (next.elevated >= next.review) { setBandError('The Elevated band must start below the Review Recommended band.'); return }
    setBandError('')
    setThresholds(next)
  }

  function exportCsv() {
    const cols = [
      { key: 'customer_ref', label: 'customer_ref' },
      { key: 'group', label: 'group' },
      { key: 'model_score', label: 'model_score' },
      { key: 'model_label', label: 'model_label' },
      { key: 'review_category', label: 'review_category' },
      { key: 'status', label: 'status' },
      { key: 'warnings_count', label: 'warnings_count' },
      ...FEATURE_NAMES.map((n) => ({ key: n, label: n })),
    ]
    const data = rows.map((r) => {
      const rowObj = {
        customer_ref: r.id,
        group: r.group && r.group !== '—' ? r.group : '',
        model_score:
          r.score !== null && r.score !== undefined
            ? typeof r.score === 'number'
              ? Number(r.score.toFixed(4))
              : r.score
            : '',
        model_label:
          r.label_name && r.label_name !== '—'
            ? r.label_name
            : r.score !== null
              ? r.score >= thresholds.review
                ? 'Potentially Suspicious'
                : 'No Suspicious Pattern Flagged'
              : '',
        review_category:
          CATEGORIES[r.category]?.label ||
          (r.score !== null ? CATEGORIES[classify(r.score, thresholds)]?.label : 'Not scored'),
        status: r.status || (r.score !== null ? 'scored' : 'unscored'),
        warnings_count: r.warnings ? r.warnings.length : 0,
      }
      FEATURE_NAMES.forEach((name) => {
        const val = r.features ? r.features[name] : undefined
        rowObj[name] = val !== undefined && val !== null ? val : ''
      })
      return rowObj
    })
    downloadCsv('theftguard-results.csv', cols, data)
  }

  async function addSelected() {
    if (!selected) return
    setAdding(true)
    setInvError('')
    const basis =
      selected.score === null
        ? selected.status === 'rejected'
          ? `Row failed ML validation: ${selected.errors?.[0]?.message || 'validation error'}`
          : 'Row from a selected file, not scored'
        : `Model Score ${selected.score.toFixed(3)} (${selected.label_name || 'Scored'})${selected.isDemo ? ' (demonstration value)' : ''}`

    const res = await addInvestigation({
      customerRef: selected.id,
      origin: 'screening',
      basis,
      screeningRecordId: selected.screeningRecordId || selected.screening_record_id || null,
      batchId: selected.batchId || selected.batch_id || null,
    })

    setAdding(false)
    if (res.ok) {
      setAdded(true)
      setInvTicket(res.ticketCode || '')
    } else {
      setInvError(res.message || 'Could not add to investigation queue.')
    }
  }

  const batchId = uploaded?.metadata?.batchId

  return (
    <>
      <PageHeader
        title={t('results.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {batchId ? <Badge tone="ok">Database Batch: {batchId.slice(0, 8)}</Badge> : null}
            <Button icon="download" onClick={exportCsv} disabled={rows.length === 0}>
              {t('results.exportCsv')} ({rows.length})
            </Button>
          </div>
        }
      >
        {source === 'demo'
          ? t('results.subtitleDemo')
          : uploaded?.fileName
            ? t('results.subtitleFile', { fileName: uploaded.fileName })
            : t('results.subtitleAuth')}{' '}
        Search, filter and open a customer for detail.
      </PageHeader>

      {source === 'demo' ? (
        <Notice tone="info" title={t('results.demoNoticeTitle')} className="mb-4">
          <DemoBadge /> {t('results.demoNoticeText')}
        </Notice>
      ) : customers.length === 0 ? null : allUnscored ? (
        <Notice tone="warn" title={t('results.unscoredNoticeTitle')} className="mb-4">
          {t('results.unscoredNoticeText')}{' '}
          <Link to="/app/screening" className="underline underline-offset-2">Back to screening</Link> to run ML scoring.
        </Notice>
      ) : (
        <Notice tone="info" title={t('results.mlNoticeTitle')} className="mb-4">
          {t('results.mlNoticeText')}
        </Notice>
      )}

      <Panel bodyClassName="p-0">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
          <Field label={t('results.searchLabel')} htmlFor="search">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input id="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('results.searchPlaceholder')} className={`${inputClass} pl-9`} />
            </div>
          </Field>
          <Field label={t('results.categoryLabel')} htmlFor="cat">
            <select id="cat" value={cat} onChange={(e) => setCat(e.target.value)} className={inputClass}>
              <option value="all">All categories</option>
              {Object.values(CATEGORIES).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          <Field label={t('results.sortByLabel')} htmlFor="sort">
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className={inputClass}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label={t('results.rowsLabel')} htmlFor="size">
            <select id="size" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={inputClass}>
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>

        {customers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={t('results.emptyTitle')}
              action={<Button to="/app/screening" variant="primary">{t('results.screenFileAction')}</Button>}
            >
              {t('results.emptyDesc')}
            </EmptyState>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No customers match" action={<Button onClick={() => { setQ(''); setCat('all') }}>Clear search and filters</Button>}>
              Try a different reference, or choose All categories.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Customers with Model Score and review category</caption>
              <thead className="border-b border-line bg-mist text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Group</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Model Score</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Score scale</span></th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-right">Missing readings</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-pale/50">
                    <th scope="row" className="px-4 py-2.5 font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onClick={() => setSelected(c)} className="underline-offset-2 hover:underline cursor-pointer">{c.id}</button>
                        {(c.isDemo || source === 'demo') && (
                          <span className="rounded bg-mist px-1.5 py-0.2 text-[10px] font-medium text-muted border border-line" data-testid="demo-record-badge">
                            Demo
                          </span>
                        )}
                      </div>
                    </th>
                    <td className="px-4 py-2.5 text-muted">{c.group}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {c.status === 'rejected' ? (
                        <span className="text-xs font-semibold text-danger">Rejected</span>
                      ) : (
                        fmtScore(c.score)
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.score !== null ? (
                        <ScoreScale score={c.score} thresholds={thresholds} />
                      ) : c.status === 'rejected' ? (
                        <span className="text-xs text-danger">Validation error</span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <CategoryBadge category={c.category} />
                        {c.warnings && c.warnings.length > 0 ? (
                          <span
                            className="rounded bg-gold/20 px-1 py-0.5 text-[10px] font-semibold text-ink"
                            title={c.warnings.map((w) => w.message).join('\n')}
                          >
                            {c.warnings.length} {c.warnings.length === 1 ? 'warning' : 'warnings'}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">{c.features.missing_percent == null ? '—' : `${num(c.features.missing_percent, 1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
          <p aria-live="polite">Showing {first} to {last} of {rows.length.toLocaleString('en-IN')}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" icon="chevLeft" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page">Previous</Button>
            <span>Page {current} of {pages}</span>
            <Button size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page">Next</Button>
          </div>
        </div>
      </Panel>

      <details className="mt-5 rounded border border-line bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Display bands for categories</summary>
        <div className="border-t border-line p-4">
          <p className="mb-3 max-w-2xl text-sm text-muted">
            The saved model's own default threshold is {MODEL_DEFAULT_THRESHOLD.toFixed(2)}. The Elevated band is a display aid that the
            model does not produce. Changing these bands changes how customers are grouped here, not the Model Scores.
          </p>
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <Field label="Elevated from" htmlFor="b-el">
              <input id="b-el" type="number" step="0.05" min="0" max="1" defaultValue={thresholds.elevated} key={`e${thresholds.elevated}`} onBlur={(e) => changeBand('elevated', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Review Recommended from" htmlFor="b-rv">
              <input id="b-rv" type="number" step="0.05" min="0" max="1" defaultValue={thresholds.review} key={`r${thresholds.review}`} onBlur={(e) => changeBand('review', e.target.value)} className={inputClass} />
            </Field>
          </div>
          {bandError ? <p role="alert" className="mt-2 text-sm text-danger">{bandError}</p> : null}
          <Button size="sm" className="mt-3" onClick={() => { setBandError(''); setThresholds(DEFAULT_THRESHOLDS) }}>Reset to defaults</Button>
        </div>
      </details>

      <Drawer open={Boolean(selected)} title={selected ? selected.id : ''} onClose={() => setSelected(null)}>
        {selected ? (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                {selected.status === 'rejected' ? (
                  <Badge tone="danger">Validation Rejected</Badge>
                ) : (
                  <>
                    <p className="font-display text-3xl font-bold">{fmtScore(selected.score)}</p>
                    <CategoryBadge category={classify(selected.score, thresholds)} />
                    {selected.label_name ? (
                      <span className="rounded border border-line bg-mist px-2 py-0.5 text-xs font-semibold text-ink">
                        {selected.label_name}
                      </span>
                    ) : null}
                    {(selected.isDemo || source === 'demo') ? <DemoBadge>Demonstration data</DemoBadge> : null}
                  </>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">Model Score</p>
              {selected.score !== null ? (
                <div className="mt-3"><ScoreScale score={selected.score} thresholds={thresholds} wide /></div>
              ) : null}
            </div>

            {selected.status === 'rejected' && selected.errors && selected.errors.length > 0 ? (
              <Notice tone="danger" title={`${selected.errors.length} Validation Error${selected.errors.length > 1 ? 's' : ''}`}>
                <ul className="list-inside list-disc space-y-1 text-xs">
                  {selected.errors.map((e, i) => (
                    <li key={i}>
                      <strong>{e.code || e.rule}{e.field ? ` (${e.field})` : ''}:</strong> {e.message}
                    </li>
                  ))}
                </ul>
              </Notice>
            ) : null}

            {selected.warnings && selected.warnings.length > 0 ? (
              <Notice tone="warn" title={`${selected.warnings.length} Validation Warning${selected.warnings.length > 1 ? 's' : ''}`}>
                <ul className="list-inside list-disc space-y-1 text-xs">
                  {selected.warnings.map((w, i) => (
                    <li key={i}>
                      <strong>{w.code || w.rule}:</strong> {w.message}
                    </li>
                  ))}
                </ul>
              </Notice>
            ) : null}

            <Notice tone="info" title="How to read this">
              The Model Score is the share of trees in the Random Forest that vote for the dataset label FLAG = 1. It is not a
              probability. A high score means the customer's summary resembles records carrying that label. It does not show that
              theft occurred.
            </Notice>

            <div>
              <h3 className="mb-2 text-base font-semibold">Model inputs</h3>
              <table className="w-full text-left text-sm">
                <caption className="sr-only">The 13 feature values for this customer</caption>
                <tbody>
                  {FEATURE_NAMES.map((n) => (
                    <tr key={n} className="border-b border-line last:border-0">
                      <th scope="row" className="py-1.5 pr-3 font-normal text-muted">{n}</th>
                      <td className="py-1.5 text-right font-medium">{selected.features[n] == null ? '—' : num(selected.features[n], 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invError ? (
              <Notice tone="warn" title="Investigation Notice" className="mt-4">
                {invError}
                <div className="mt-2">
                  <Link to="/app/investigations" className="text-xs font-medium underline underline-offset-2">
                    Open investigations queue
                  </Link>
                </div>
              </Notice>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button
                variant="primary"
                icon="plus"
                onClick={addSelected}
                disabled={added || adding}
              >
                {adding ? 'Adding...' : added ? 'Added to investigations' : 'Add to investigation'}
              </Button>
              {added ? (
                <Link to="/app/investigations" className="text-sm underline underline-offset-2">
                  Open investigations {invTicket ? `(${invTicket})` : ''}
                </Link>
              ) : null}
            </div>
            {added ? (
              <p className="text-xs text-muted">
                {invTicket
                  ? `Investigation ticket ${invTicket} opened and recorded.`
                  : 'Investigation ticket opened in queue.'}
              </p>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </>
  )
}
