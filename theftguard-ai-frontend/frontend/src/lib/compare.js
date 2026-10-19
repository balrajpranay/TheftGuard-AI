// Historical-versus-current consumption comparison. Plain arithmetic on kWh readings.
// It is separate from ML screening and does not use the model.
const ISO = /^\d{4}-\d{2}-\d{2}$/

export function computeComparison(rows, splitDate) {
  const by = new Map()
  let skipped = 0
  for (const r of rows) {
    const value = Number(r.kwh)
    if (!r.customer_ref || !ISO.test(r.date) || !Number.isFinite(value) || value < 0 || r.kwh === '') {
      skipped++
      continue
    }
    let e = by.get(r.customer_ref)
    if (!e) {
      e = { ref: r.customer_ref, hDays: 0, hTotal: 0, cDays: 0, cTotal: 0 }
      by.set(r.customer_ref, e)
    }
    if (r.date < splitDate) { e.hDays++; e.hTotal += value } else { e.cDays++; e.cTotal += value }
  }
  const items = []
  for (const e of by.values()) {
    const hAvg = e.hDays ? e.hTotal / e.hDays : null
    const cAvg = e.cDays ? e.cTotal / e.cDays : null
    const change = hAvg && cAvg !== null ? ((cAvg - hAvg) / hAvg) * 100 : null
    items.push({ ...e, hAvg, cAvg, change })
  }
  return { items, skipped }
}

// Estimated difference in billed energy if the historical daily average had continued.
// It ignores seasonality, occupancy, outages and billing rules.
export function estimatedImpact(item, tariff) {
  if (item.hAvg === null || item.cAvg === null || !Number.isFinite(tariff)) return null
  return Math.max(0, item.hAvg - item.cAvg) * item.cDays * tariff
}

export function dailySeries(rows, ref) {
  return rows
    .filter((r) => r.customer_ref === ref && ISO.test(r.date) && Number.isFinite(Number(r.kwh)))
    .map((r) => ({ date: r.date, kwh: Number(r.kwh) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function monthlyTotals(rows) {
  const m = new Map()
  for (const r of rows) {
    if (!ISO.test(r.date) || !Number.isFinite(Number(r.kwh))) continue
    const key = r.date.slice(0, 7)
    m.set(key, (m.get(key) || 0) + Number(r.kwh))
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, total]) => ({ month, total: Math.round(total) }))
}
