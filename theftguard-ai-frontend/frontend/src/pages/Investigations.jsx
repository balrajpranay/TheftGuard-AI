import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Field, inputClass, Notice, PageHeader, Panel } from '../components/ui'
import { useAppState } from '../state/AppState'
import { useAuth } from '../context/AuthContext'
import { fileSize } from '../lib/format'
import { findInvestigationMatch } from '../lib/investigationMutations'

const STATUSES = ['New', 'Scheduled', 'In inspection', 'Evidence review', 'Closed']
const PRIORITIES = ['Low', 'Normal', 'High']
const OUTCOMES = [
  'Irregularity verified on site',
  'No irregularity found',
  'Inconclusive, more information needed',
]

export default function Investigations() {
  const {
    investigations,
    updateInvestigation,
    toggleChecklist,
    removeInvestigation,
    dbConnected,
    dbError,
    dbStatus,
    dbLoading,
    mutationError,
    clearMutationError,
    refreshInvestigations,
  } = useAppState()
  const { isDemoMode } = useAuth()
  const [filter, setFilter] = useState('All')
  const [openId, setOpenId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [searchParams] = useSearchParams()
  const location = useLocation()

  const targetId = searchParams.get('id') || location.state?.investigationId || location.state?.id || null
  const targetTicket =
    searchParams.get('ticket') || searchParams.get('ticketCode') || location.state?.ticketCode || null
  const targetCustomer =
    searchParams.get('customer') || searchParams.get('customerRef') || location.state?.customerRef || null

  const targetMatch = useMemo(() => {
    return findInvestigationMatch(investigations, {
      id: targetId,
      ticketCode: targetTicket,
      customerRef: targetCustomer,
    })
  }, [targetId, targetTicket, targetCustomer, investigations])

  useEffect(() => {
    if (targetMatch) {
      setOpenId(targetMatch.id)
      if (filter !== 'All' && targetMatch.status !== filter) {
        setFilter('All')
      }
    }
  }, [targetMatch, filter])

  const list = useMemo(
    () => investigations.filter((i) => filter === 'All' || i.status === filter),
    [investigations, filter],
  )
  const current = (openId ? investigations.find((i) => i.id === openId) : null) || targetMatch || list[0] || null
  const done = current ? current.checklist.filter((c) => c.done).length : 0

  function addEvidence(files) {
    if (!current || !files) return
    const added = Array.from(files).map((f) => ({ name: f.name, size: f.size }))
    updateInvestigation(current.id, { evidence: [...current.evidence, ...added] })
  }

  async function handleRefresh() {
    setRefreshing(true)
    await refreshInvestigations()
    setRefreshing(false)
  }

  return (
    <>
      <PageHeader
        title="Investigations"
        actions={
          <div className="flex items-center gap-2">
            {dbConnected ? (
              <Badge tone="ok">Database Connected</Badge>
            ) : (
              <Badge tone="warn">Demo Mode (Local)</Badge>
            )}
            <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        }
      >
        Track follow-up on customers you have chosen to review, and work through an inspection checklist.
      </PageHeader>

      {mutationError ? (
        <Notice tone="danger" title="Investigation Action Failed" className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{mutationError}</span>
            <Button size="sm" variant="ghost" onClick={clearMutationError}>
              Dismiss
            </Button>
          </div>
        </Notice>
      ) : null}

      {dbError ? (
        <Notice
          tone={dbStatus === 'unavailable' || dbStatus === 'auth_error' ? 'warn' : 'danger'}
          title={
            dbStatus === 'auth_error'
              ? 'Authentication Session Required'
              : dbStatus === 'unavailable'
                ? 'Backend Service Temporarily Unavailable'
                : 'Persistence Service Offline'
          }
          className="mb-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{dbError}</span>
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => refreshInvestigations({ force: true })}
              disabled={dbLoading}
              className="!min-h-[30px] !px-2.5 !py-1 text-xs"
            >
              {dbLoading ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        </Notice>
      ) : null}

      {dbConnected ? (
        <Notice tone="ok" title="Database Connected" className="mb-5">
          Investigation audit tickets are persisted in the PostgreSQL database. Status changes, checklist updates,
          notes, and outcomes are saved across sessions.
        </Notice>
      ) : isDemoMode ? (
        <Notice tone="warn" title="Operating in Demo Mode" className="mb-5">
          Database persistence service is offline. Investigation tickets are preserved in local browser session only.
        </Notice>
      ) : (
        <Notice
          tone="warn"
          title={dbStatus === 'connecting' ? 'Connecting to Database...' : 'Persistence Service Unavailable'}
          className="mb-5"
        >
          {dbStatus === 'connecting'
            ? 'Establishing connection to backend persistence service...'
            : 'Unable to connect to PostgreSQL persistence service. Investigation tickets cannot be synchronized.'}
        </Notice>
      )}

      {investigations.length === 0 ? (
        <EmptyState
          title="No investigations yet"
          action={
            <div className="flex gap-2">
              <Button to="/app/results" variant="primary">
                Go to results
              </Button>
              <Button to="/app/comparison">Go to comparison</Button>
            </div>
          }
        >
          Investigation tickets track physical meter audits, seal verification, and field inspection notes. To start an investigation, open any customer record in Results or Comparison and choose &quot;Add to investigation&quot;.
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
          <Panel title="Queue" bodyClassName="p-0">
            <div className="flex flex-wrap gap-1.5 border-b border-line p-3" role="group" aria-label="Filter by status">
              {['All', ...STATUSES].map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filter === s}
                  onClick={() => setFilter(s)}
                  className={`rounded border px-2.5 py-1 text-xs font-medium ${
                    filter === s ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:bg-mist'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <div className="p-4">
                <EmptyState title={`Nothing is ${filter.toLowerCase()}`}>
                  Choose another status to see other entries.
                </EmptyState>
              </div>
            ) : (
              <ul>
                {list.map((i) => (
                  <li key={i.id} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      onClick={() => setOpenId(i.id)}
                      aria-current={current?.id === i.id}
                      className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-mist ${
                        current?.id === i.id ? 'bg-pale' : ''
                      }`}
                    >
                      <span>
                        <span className="block font-medium">{i.customerRef}</span>
                        <span className="block text-xs text-muted">
                          {i.ticketCode} • {i.origin}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <Badge tone={i.status === 'Closed' ? 'grey' : 'gold'}>{i.status}</Badge>
                        <span className="text-xs text-muted">
                          {i.isPersisted ? 'Persisted' : 'Local'} • {i.priority} priority
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {current ? (
            <Panel
              title={`${current.customerRef} (${current.ticketCode})`}
              subtitle={`${current.origin}: ${current.basis}`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {current.isPersisted ? (
                    <Badge tone="ok">Persisted</Badge>
                  ) : (
                    <Badge tone="grey">Local Session</Badge>
                  )}
                  {current.screeningRecordId ? <Badge tone="grey">Screening record linked</Badge> : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      removeInvestigation(current.id)
                      setOpenId(null)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Status" htmlFor="status">
                  <select
                    id="status"
                    value={current.status}
                    onChange={(e) => updateInvestigation(current.id, { status: e.target.value })}
                    className={inputClass}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority" htmlFor="priority">
                  <select
                    id="priority"
                    value={current.priority}
                    onChange={(e) => updateInvestigation(current.id, { priority: e.target.value })}
                    className={inputClass}
                  >
                    {PRIORITIES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Assigned to" htmlFor="assignee" hint="Name or team responsible">
                  <input
                    id="assignee"
                    value={current.assignee}
                    onChange={(e) => updateInvestigation(current.id, { assignee: e.target.value })}
                    className={inputClass}
                    placeholder="Name or team"
                  />
                </Field>
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm font-semibold">
                  Inspection checklist{' '}
                  <span className="font-normal text-muted">
                    ({done} of {current.checklist.length} done)
                  </span>
                </legend>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-mist" aria-hidden="true">
                  <div
                    className="h-full bg-gold"
                    style={{ width: `${(done / current.checklist.length) * 100}%` }}
                  />
                </div>
                <ul className="mt-3 space-y-1">
                  {current.checklist.map((c, n) => (
                    <li key={c.label}>
                      <label className="flex cursor-pointer items-start gap-3 rounded px-1 py-1.5 text-sm hover:bg-mist">
                        <input
                          type="checkbox"
                          checked={c.done}
                          onChange={() => toggleChecklist(current.id, n)}
                          className="mt-0.5 h-4 w-4 accent-ink"
                        />
                        <span className={c.done ? 'text-muted line-through' : ''}>{c.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>

              <Field label="Field notes" htmlFor="notes" className="mt-5">
                <textarea
                  id="notes"
                  rows={4}
                  value={current.notes}
                  onChange={(e) => updateInvestigation(current.id, { notes: e.target.value })}
                  className={inputClass}
                  placeholder="What was observed, measured or reported on site"
                />
              </Field>

              <div className="mt-5">
                <p className="text-sm font-semibold">Evidence attachments</p>
                <p className="text-xs text-muted">
                  Attachment filenames and sizes are recorded. Image binaries are not uploaded to preserve bandwidth.
                </p>
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded border border-ink px-3 py-2 text-sm font-medium hover:bg-mist focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
                  Attach files
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addEvidence(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
                {current.evidence.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No files attached.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line rounded border border-line text-sm">
                    {current.evidence.map((f, n) => (
                      <li key={`${f.name}-${n}`} className="flex justify-between px-3 py-1.5">
                        <span>{f.name}</span>
                        <span className="text-muted">{fileSize(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {current.status === 'Closed' ? (
                <Field label="Outcome" htmlFor="outcome" hint="Final investigation determination" className="mt-5">
                  <select
                    id="outcome"
                    value={current.outcome}
                    onChange={(e) => updateInvestigation(current.id, { outcome: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Choose an outcome</option>
                    {OUTCOMES.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <p className="mt-5 border-t border-line pt-3 text-xs text-muted">
                A model flag or a drop in consumption recommends a closer look. Only a qualified on-site investigation
                can establish what happened.
              </p>
            </Panel>
          ) : null}
        </div>
      )}
    </>
  )
}
