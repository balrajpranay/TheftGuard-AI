import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, DemoBadge, EmptyState, Field, inputClass, Notice, PageHeader, Panel, Spinner } from '../components/ui'
import { useAppState } from '../state/AppState'
import { parseCsv } from '../lib/csv'
import { downloadCsv } from '../lib/exportCsv'
import { computeComparison, dailySeries, estimatedImpact } from '../lib/compare'
import { buildDemoConsumption, DEMO_SPLIT_DATE } from '../data/demoConsumption'
import { inr, kwh, num, pct, fileSize } from '../lib/format'

const GOLD = '#F4C430'
const INK = '#0F0F0F'
const AXIS = { fontSize: 12, fill: '#565B63' }
const MAX_BYTES = 10 * 1024 * 1024

export default function Comparison() {
  const navigate = useNavigate()
  const { comparison, setComparison, tariff, setTariff, addInvestigation } = useAppState()
  const inputRef = useRef(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedRef, setSelectedRef] = useState('')

  const { rows, splitDate, dropThreshold } = comparison
  const { items, skipped } = useMemo(() => computeComparison(rows, splitDate), [rows, splitDate])
  const sorted = useMemo(() => [...items].sort((a, b) => (a.change === null ? 1 : b.change === null ? -1 : a.change - b.change)), [items])
  const flagged = sorted.filter((i) => i.change !== null && i.change <= -dropThreshold)
  const totalImpact = flagged.reduce((s, i) => s + (estimatedImpact(i, tariff) || 0), 0)
  const chosen = selectedRef || sorted[0]?.ref || ''
  const series = useMemo(() => (chosen ? dailySeries(rows, chosen) : []), [rows, chosen])
  const barData = sorted.filter((i) => i.change !== null).slice(0, 10).map((i) => ({ ref: i.ref, change: Math.round(i.change * 10) / 10 }))
  const patch = (p) => setComparison({ ...comparison, ...p })

  async function handleFile(file) {
    if (!file) return
    setError(''); setNotice('')
    if (!/\.csv$/i.test(file.name)) { setError('This is not a .csv file. Export your readings as CSV and choose it again.'); return }
    if (file.size > MAX_BYTES) { setError(`This file is ${fileSize(file.size)}. This preview reads files up to 10 MB.`); return }
    setReading(true)
    try {
      const { headers, rows: parsed } = parseCsv(await file.text())
      const need = ['customer_ref', 'date', 'kwh']
      const missing = need.filter((h) => !headers.includes(h))
      if (missing.length) { setError(`Missing columns: ${missing.join(', ')}. The file needs customer_ref, date (YYYY-MM-DD) and kwh.`); return }
      if (!parsed.length) { setError('The file has no data rows.'); return }
      const dates = parsed.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
      const mid = dates.length ? dates[Math.floor(dates.length / 2)] : splitDate
      setComparison({ rows: parsed, label: `File: ${file.name}`, isDemo: false, splitDate: mid, dropThreshold })
      setSelectedRef('')
      setNotice(`Loaded ${parsed.length.toLocaleString('en-IN')} readings. The split date was set to the middle of your date range; change it if needed.`)
    } catch {
      setError('The file could not be read. Try exporting it again.')
    } finally {
      setReading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const loadDemo = () => { setComparison({ rows: buildDemoConsumption(), label: 'Demonstration data (synthetic)', isDemo: true, splitDate: DEMO_SPLIT_DATE, dropThreshold }); setSelectedRef(''); setError(''); setNotice('') }
  const clear = () => { setComparison({ rows: [], label: 'No data loaded', isDemo: false, splitDate, dropThreshold }); setSelectedRef(''); setNotice('') }
  const template = () => downloadCsv('theftguard-consumption-template.csv', [{ key: 'customer_ref', label: 'customer_ref' }, { key: 'date', label: 'date' }, { key: 'kwh', label: 'kwh' }], [])
  const exportRows = () => downloadCsv('theftguard-consumption-comparison.csv',
    [{ key: 'ref', label: 'customer_ref' }, { key: 'hAvg', label: 'historical_avg_kwh_per_day' }, { key: 'cAvg', label: 'current_avg_kwh_per_day' }, { key: 'change', label: 'change_percent' }, { key: 'impact', label: `estimated_difference_inr_at_${tariff}_per_kwh` }],
    sorted.map((i) => ({ ref: i.ref, hAvg: i.hAvg === null ? null : Math.round(i.hAvg * 100) / 100, cAvg: i.cAvg === null ? null : Math.round(i.cAvg * 100) / 100, change: i.change === null ? null : Math.round(i.change * 10) / 10, impact: estimatedImpact(i, tariff) === null ? null : Math.round(estimatedImpact(i, tariff)) })))

  return (
    <>
      <PageHeader title="Consumption comparison" actions={<Button icon="download" onClick={exportRows} disabled={sorted.length === 0}>Export CSV</Button>}>
        Compare each customer's average daily kWh before and after a date you choose. This is plain arithmetic. It is
        separate from model screening and does not use the model.
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        <Panel title="Data and settings" actions={comparison.isDemo ? <DemoBadge /> : null}>
          <p className="mb-3 text-sm text-muted">{comparison.label}</p>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose a kWh CSV file" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="upload" onClick={() => inputRef.current?.click()}>Choose a kWh file</Button>
            <Button onClick={loadDemo}>Load demonstration data</Button>
            <Button size="sm" variant="ghost" icon="download" onClick={template}>Template</Button>
            {rows.length ? <Button size="sm" variant="ghost" onClick={clear}>Clear</Button> : null}
          </div>
          <p className="mt-2 text-xs text-muted">Columns: customer_ref, date (YYYY-MM-DD), kwh. One row per customer per day. The file stays in your browser.</p>
          {reading ? <div className="mt-3"><Spinner label="Reading the file" /></div> : null}
          {error ? <Notice tone="danger" title="This file cannot be used" className="mt-3">{error}</Notice> : null}
          {notice ? <Notice tone="ok" className="mt-3">{notice}</Notice> : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="Historical period ends before" htmlFor="split" hint="Readings on or after this date count as current.">
              <input id="split" type="date" value={splitDate} onChange={(e) => e.target.value && patch({ splitDate: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Flag decreases of at least (%)" htmlFor="drop" hint="Shown as a consumption change, not an ML result.">
              <input id="drop" type="number" min="1" max="99" value={dropThreshold} onChange={(e) => patch({ dropThreshold: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })} className={inputClass} />
            </Field>
            <Field label="Tariff (₹ per kWh)" htmlFor="tariff" hint="Example value. Set your utility's rate." className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <input id="tariff" type="number" min="0" step="0.1" value={tariff} onChange={(e) => setTariff(Math.max(0, Number(e.target.value) || 0))} className={inputClass} />
            </Field>
          </div>
        </Panel>

        <Panel title="Summary" subtitle={`Split date ${splitDate}`}>
          {sorted.length === 0 ? (
            <EmptyState title="No consumption data loaded" action={<Button variant="primary" onClick={loadDemo}>Load demonstration data</Button>}>
              Choose a kWh file, or load the demonstration data to see how the comparison works.
            </EmptyState>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-4">
                {[
                  ['Customers', sorted.length],
                  [`Decrease ≥ ${dropThreshold}%`, flagged.length],
                  ['Estimated difference', inr(totalImpact)],
                  ['Rows skipped', skipped],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white p-3"><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-display text-2xl font-bold">{v}</dd></div>
                ))}
              </dl>
              <Notice tone="warn" title="Estimate, not a finding" className="mt-3">
                The estimated difference is (historical daily average − current daily average) × days in the current period × ₹{num(tariff, 2)} per kWh,
                counted only for decreases of at least {dropThreshold}%. It ignores season, occupancy, outages and billing rules, and it is not evidence of theft.
              </Notice>
            </>
          )}
        </Panel>
      </div>

      {sorted.length > 0 ? (
        <>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel title="Daily consumption" subtitle="Black line: kWh per day. Gold line: the split date."
              actions={
                <div className="w-44">
                  <label htmlFor="cust" className="sr-only">Customer</label>
                  <select id="cust" value={chosen} onChange={(e) => setSelectedRef(e.target.value)} className={inputClass}>
                    {sorted.map((i) => <option key={i.ref} value={i.ref}>{i.ref}</option>)}
                  </select>
                </div>
              }>
              <figure aria-label={`Daily kWh for ${chosen}`}>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
                      <CartesianGrid vertical={false} stroke="#E6E8EC" />
                      <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: INK }} minTickGap={48} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
                      <Tooltip formatter={(v) => [`${num(v, 2)} kWh`, 'Consumption']} />
                      <ReferenceLine x={splitDate} stroke={GOLD} strokeWidth={3} />
                      <Line type="monotone" dataKey="kwh" stroke={INK} strokeWidth={1.5} dot={false} name="kWh per day" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <figcaption className="sr-only">Daily consumption for {chosen} with the split date {splitDate}.</figcaption>
              </figure>
            </Panel>

            <Panel title="Largest changes" subtitle="Change in average daily kWh, current versus historical (10 largest decreases)">
              <figure aria-label="Percentage change in consumption by customer">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} accessibilityLayer>
                      <CartesianGrid horizontal={false} stroke="#E6E8EC" />
                      <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: INK }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="ref" tick={AXIS} tickLine={false} axisLine={false} width={80} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Change']} cursor={{ fill: '#F2F3F5' }} />
                      <ReferenceLine x={-dropThreshold} stroke={INK} strokeDasharray="4 3" />
                      <Bar dataKey="change" stroke={INK} name="Change">
                        {barData.map((d) => <Cell key={d.ref} fill={d.change <= -dropThreshold ? GOLD : '#C9CED6'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <figcaption className="sr-only">{barData.map((d) => `${d.ref}: ${d.change}%`).join('. ')}</figcaption>
              </figure>
            </Panel>
          </div>

          <Panel className="mt-5" title="By customer" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Historical and current average daily consumption by customer</caption>
                <thead className="border-b border-line bg-mist text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Historical (kWh/day)</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Current (kWh/day)</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Change</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Estimate (₹)</th>
                    <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((i) => {
                    const big = i.change !== null && i.change <= -dropThreshold
                    const impact = big ? estimatedImpact(i, tariff) : null
                    return (
                      <tr key={i.ref} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-2.5 font-medium">{i.ref}</th>
                        <td className="px-4 py-2.5 text-right">{kwh(i.hAvg)}</td>
                        <td className="px-4 py-2.5 text-right">{kwh(i.cAvg)}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{pct(i.change, 1)}</td>
                        <td className="px-4 py-2.5">{i.change === null ? <Badge>Not enough data</Badge> : big ? <Badge tone="gold">Large decrease</Badge> : <Badge>Within range</Badge>}</td>
                        <td className="px-4 py-2.5 text-right">{impact === null ? '—' : inr(impact)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {big ? (
                            <Button size="sm" onClick={async () => { await addInvestigation({ customerRef: i.ref, origin: 'comparison', basis: `Average daily kWh changed ${pct(i.change, 1)} after ${splitDate}` }); navigate('/app/investigations') }}>
                              Add to investigation
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}
    </>
  )
}
