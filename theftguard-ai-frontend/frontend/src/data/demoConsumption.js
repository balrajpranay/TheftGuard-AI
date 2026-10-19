// DEMONSTRATION DATA. Synthetic daily kWh for 12 invented customers, 1 Oct 2025 to 30 Sep 2026.
// Four of them have a deliberate drop from 1 Apr 2026 so the comparison view has something to show.
import { seeded } from './demoCustomers'

export const DEMO_SPLIT_DATE = '2026-04-01'

export function buildDemoConsumption() {
  const r = seeded(7)
  const start = Date.UTC(2025, 9, 1)
  const days = 365
  const dropping = new Set([2, 5, 8, 10])
  const rows = []
  for (let c = 0; c < 12; c++) {
    const ref = `DEMO-C${String(c + 1).padStart(2, '0')}`
    const base = 6 + r() * 8
    const drop = dropping.has(c) ? 0.42 + r() * 0.25 : 0.96 + r() * 0.08
    for (let d = 0; d < days; d++) {
      const date = new Date(start + d * 86400000).toISOString().slice(0, 10)
      const seasonal = 1 + 0.25 * Math.sin((2 * Math.PI * (d - 120)) / 365)
      const noise = 0.85 + r() * 0.3
      const factor = d >= 182 ? drop : 1
      rows.push({ customer_ref: ref, date, kwh: String(Math.round(base * seasonal * noise * factor * 100) / 100) })
    }
  }
  return rows
}
