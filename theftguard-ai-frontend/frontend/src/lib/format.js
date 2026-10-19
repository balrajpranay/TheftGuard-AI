const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

export const inr = (n) => (n == null || Number.isNaN(n) ? '—' : inrFmt.format(n))
export const kwh = (n) => (n == null || Number.isNaN(n) ? '—' : `${numFmt.format(n)} kWh`)
export const num = (n, digits = 1) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: digits })
export const score = (n) => (n == null ? '—' : n.toFixed(3))
export const pct = (n, digits = 0) => (n == null || Number.isNaN(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`)
export const today = () => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
export const fileSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`)
