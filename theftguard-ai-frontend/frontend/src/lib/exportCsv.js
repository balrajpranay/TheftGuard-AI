// CSV export with UTF-8 BOM, RFC 4180 escaping, and spreadsheet formula injection protection.
function cell(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  let s = String(v)
  // Clean empty em dash placeholder to empty string
  if (s === '—') return ''

  // Protect against spreadsheet formula injection for text strings starting with =, +, -, @, \t, \r
  // Pure numbers (like "-5" or "12.3") are safe and not prefixed.
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) {
    s = `'${s}`
  }
  // Enclose in quotes if contains double quotes, commas, or line breaks, and escape quotes
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))
  return [head, ...body].join('\r\n')
}

export function downloadCsv(filename, columns, rows) {
  // \uFEFF is the UTF-8 Byte Order Mark (BOM) which instructs Microsoft Excel to open the CSV as UTF-8.
  const csvContent = '\uFEFF' + toCsv(columns, rows)
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
