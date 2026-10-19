// Small CSV reader for the browser. Handles quoted fields, escaped quotes, CRLF and a BOM.
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const pushRow = () => {
    row.push(field)
    field = ''
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else { field += ch }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      pushRow()
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length) pushRow()
  if (!rows.length) return { headers: [], rows: [] }
  const headers = rows[0].map((h) => h.trim())
  const body = rows.slice(1).map((r) => {
    const o = {}
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim() })
    return o
  })
  return { headers, rows: body }
}
