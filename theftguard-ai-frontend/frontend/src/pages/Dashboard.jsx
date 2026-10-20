import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, CategoryBadge, DemoBadge, EmptyState, PageHeader, Panel, ScoreScale } from '../components/ui'
import { useAppState } from '../state/AppState'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES, classify } from '../lib/risk'
import { monthlyTotals } from '../lib/compare'
import { MODEL_FACTS } from '../data/modelFacts'
import { num, score as fmtScore } from '../lib/format'

const GOLD = '#F4C430'
const INK = '#0F0F0F'
const GREY = '#C9CED6'
const AXIS = { fontSize: 12, fill: '#565B63' }
const STATUSES = ['New', 'Scheduled', 'In inspection', 'Evidence review', 'Closed']

function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export default function Dashboard() {
  const { customers, source, hasScores, thresholds, comparison, investigations, dbConnected, dbError } = useAppState()
  const { isDemoMode } = useAuth()
  const isDemo = isDemoMode || source === 'demo'

  const stats = useMemo(() => {
    const counts = { review: 0, elevated: 0, none: 0, unscored: 0 }
    customers.forEach((c) => { counts[classify(c.score, thresholds)] += 1 })
    const scores = customers.map((c) => c.score).filter((s) => s !== null)
    const bins = Array.from({ length: 10 }, (_, i) => ({ from: i / 10, label: `${(i / 10).toFixed(1)}`, count: 0 }))
    scores.forEach((s) => { bins[Math.min(9, Math.floor(s * 10))].count += 1 })
    return { counts, median: median(scores), bins, top: [...customers].filter((c) => c.score !== null).sort((a, b) => b.score - a.score).slice(0, 6) }
  }, [customers, thresholds])

  const riskData = Object.keys(CATEGORIES)
    .filter((k) => k !== 'unscored' || stats.counts.unscored > 0)
    .map((k) => ({ key: k, name: CATEGORIES[k].label, count: stats.counts[k] }))
  const monthly = useMemo(() => monthlyTotals(comparison.rows), [comparison.rows])
  const byStatus = STATUSES.map((s) => ({ status: s, n: investigations.filter((i) => i.status === s).length }))
  const m = Object.fromEntries(MODEL_FACTS.metrics.map((x) => [x.key, x.value]))

  return (
    <>
      <PageHeader
        title="Overview"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isDemoMode ? (
              <Badge tone="warn">Demo Mode (Local)</Badge>
            ) : dbConnected ? (
              <Badge tone="ok">Database Connected</Badge>
            ) : dbError ? (
              <Badge tone="danger">Database Offline</Badge>
            ) : (
              <Badge tone="outline">Connecting...</Badge>
            )}
            <Button to="/app/screening" variant="primary" icon="upload">Screen a file</Button>
            <Button to="/app/bill-comparison" icon="file">Compare bills</Button>
            <Button to="/app/comparison" icon="compare">Compare consumption</Button>
          </div>
        }
      >
        {isDemoMode
          ? 'A summary of the screening results and consumption comparison currently loaded in this demonstration workspace.'
          : 'A summary of the screening results and consumption comparison currently loaded in your authenticated workspace.'}
      </PageHeader>

      <section aria-label="Summary" className="grid grid-cols-2 divide-line rounded border border-line bg-white md:grid-cols-4 md:divide-x">
        {[
          ['Customers in results', customers.length.toLocaleString('en-IN')],
          ['Review Recommended', stats.counts.review.toLocaleString('en-IN')],
          ['Elevated', stats.counts.elevated.toLocaleString('en-IN')],
          ['Median Model Score', stats.median === null ? '—' : fmtScore(stats.median)],
        ].map(([k, v], i) => (
          <div key={k} className={`px-4 py-4 ${i > 1 ? 'border-t border-line md:border-t-0' : ''}`}>
            <p className="text-sm text-muted">{k}</p>
            <p className="mt-1 font-display text-3xl font-bold">{v}</p>
          </div>
        ))}
        <p className="col-span-2 border-t border-line px-4 py-2 text-xs text-muted md:col-span-4">
          {isDemo ? (
            <><DemoBadge /> These customers and scores are invented for demonstration. The scores were not produced by the model.</>
          ) : hasScores ? (
            'Rows screened with the TheftGuard AI ML service. Model Scores are uncalibrated and do not prove theft.'
          ) : customers.length > 0 ? (
            'Rows come from your selected file and have no Model Scores because they were previewed without scoring.'
          ) : (
            'Authenticated workspace: no screening records currently loaded. Screen a CSV file to evaluate model scores.'
          )}
        </p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Panel title="Review categories" subtitle={`Display bands: Elevated from ${thresholds.elevated.toFixed(2)}, Review Recommended from ${thresholds.review.toFixed(2)}`}>
          <figure aria-label="Number of customers in each review category">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#E6E8EC" />
                  <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: INK }} />
                  <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={36} />
                  <Tooltip cursor={{ fill: '#F2F3F5' }} />
                  <Bar dataKey="count" name="Customers" stroke={INK} maxBarSize={72}>
                    {riskData.map((d) => <Cell key={d.key} fill={d.key === 'review' ? GOLD : d.key === 'elevated' ? '#FFF6D5' : GREY} />)}
                    <LabelList dataKey="count" position="top" fill={INK} fontSize={13} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">
              {riskData.map((d) => `${d.name}: ${d.count}`).join('. ')}
            </figcaption>
          </figure>
        </Panel>

        <Panel title="Model Score distribution" subtitle="Customers per 0.1 score band; gold bands are in the review range">
          {stats.median === null ? (
            <EmptyState title="No Model Scores yet">
              {hasScores
                ? 'No valid scores were produced from the screened file.'
                : 'Scores appear here when a file has been screened with the ML service.'}
            </EmptyState>
          ) : (
            <figure aria-label="Distribution of Model Scores">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.bins} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2} accessibilityLayer>
                    <CartesianGrid vertical={false} stroke="#E6E8EC" />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: INK }} />
                    <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={36} />
                    <Tooltip cursor={{ fill: '#F2F3F5' }} labelFormatter={(l) => `Score from ${l}`} />
                    <Bar dataKey="count" name="Customers" stroke={INK}>
                      {stats.bins.map((b) => <Cell key={b.label} fill={b.from >= thresholds.review ? GOLD : GREY} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <figcaption className="sr-only">{stats.bins.map((b) => `${b.label} to ${(b.from + 0.1).toFixed(1)}: ${b.count}`).join('. ')}</figcaption>
            </figure>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-5"
        title="Monthly consumption"
        subtitle={`${comparison.label}. Total kWh across the customers in the loaded comparison file.`}
        actions={comparison.isDemo ? <DemoBadge /> : null}
      >
        {monthly.length === 0 ? (
          <EmptyState title="No consumption data loaded" action={<Button to="/app/comparison" variant="primary">Open comparison</Button>}>
            Load a kWh file or the demonstration data in Comparison to see monthly totals.
          </EmptyState>
        ) : (
          <figure aria-label="Monthly total consumption in kWh">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#E6E8EC" />
                  <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: INK }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => num(v, 0)} />
                  <Tooltip formatter={(v) => [`${num(v, 0)} kWh`, 'Total']} />
                  <Line type="monotone" dataKey="total" stroke={INK} strokeWidth={2.5} dot={{ r: 3, fill: GOLD, stroke: INK }} name="Total kWh" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">{monthly.map((d) => `${d.month}: ${num(d.total, 0)} kWh`).join('. ')}</figcaption>
          </figure>
        )}
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Panel title="Highest Model Scores" actions={<Link to="/app/results" className="text-sm font-medium underline underline-offset-2">All results</Link>} bodyClassName="p-0">
          {stats.top.length === 0 ? (
            <div className="p-4"><EmptyState title="No scored customers">Run screening with the ML service to see the highest scores.</EmptyState></div>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Customers with the highest Model Scores</caption>
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-2 font-medium">Model Score</th>
                  <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">Category</th>
                </tr>
              </thead>
              <tbody>
                {stats.top.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-2.5 font-medium">
                      <Link to={`/app/results?q=${encodeURIComponent(c.id)}`} className="underline-offset-2 hover:underline">{c.id}</Link>
                    </th>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-3"><span className="w-12">{fmtScore(c.score)}</span><ScoreScale score={c.score} thresholds={thresholds} /></div></td>
                    <td className="hidden px-4 py-2.5 sm:table-cell"><CategoryBadge category={classify(c.score, thresholds)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel
            title="Investigation queue"
            subtitle={
              isDemoMode
                ? 'Local demo queue'
                : dbConnected
                  ? 'Persisted in PostgreSQL database'
                  : dbError
                    ? `Persistence offline (${dbError})`
                    : 'Connecting to database...'
            }
            actions={<Link to="/app/investigations" className="text-sm font-medium underline underline-offset-2">Open</Link>}
          >
            {investigations.length === 0 ? (
              <EmptyState title="No investigations yet">Add a customer from Results or Comparison to start a list.</EmptyState>
            ) : (
              <dl className="divide-y divide-line text-sm">
                {byStatus.map((s) => (
                  <div key={s.status} className="flex justify-between py-1.5"><dt>{s.status}</dt><dd className="font-semibold">{s.n}</dd></div>
                ))}
              </dl>
            )}
          </Panel>
          <Panel title="What the model can say" actions={<Link to="/app/model" className="text-sm font-medium underline underline-offset-2">Details</Link>}>
            <dl className="divide-y divide-line text-sm">
              <div className="flex justify-between py-1.5"><dt>Precision</dt><dd className="font-semibold">{m.precision.toFixed(2)}</dd></div>
              <div className="flex justify-between py-1.5"><dt>Recall</dt><dd className="font-semibold">{m.recall.toFixed(2)}</dd></div>
              <div className="flex justify-between py-1.5"><dt>ROC-AUC</dt><dd className="font-semibold">{m.roc.toFixed(2)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted">Test results on one random split of a dataset with unconfirmed provenance. A flag recommends review and is not proof of theft.</p>
          </Panel>
        </div>
      </div>
    </>
  )
}
