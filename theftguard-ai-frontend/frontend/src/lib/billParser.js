/**
 * Electricity Bill Parser & Heuristics
 * Extracts key utility parameters from OCR text of Indian household electricity bills
 * (specifically optimized for Telangana TSSPDCL / TGSPDCL / TSNPDCL bills).
 */

/**
 * Normalizes text lines and cleans common OCR noise.
 */
export function cleanOcrText(text) {
  if (!text) return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[|]/g, ' ')
    .replace(/[`~]/g, '')
}

/**
 * Checks if current reading minus previous reading matches billed units.
 * Supports comma-separated thousands separators (e.g. "8,450" and "8,720").
 */
export function checkReadingDiscrepancy(prevStr, currStr, unitsStr) {
  if (prevStr === '' || currStr === '' || unitsStr === '') return null

  const prev = Number(String(prevStr).replace(/,/g, ''))
  const curr = Number(String(currStr).replace(/,/g, ''))
  const billed = Number(String(unitsStr).replace(/,/g, ''))

  if (!Number.isFinite(prev) || !Number.isFinite(curr) || !Number.isFinite(billed)) {
    return null
  }

  const calcDiff = Math.round((curr - prev) * 100) / 100
  // Allow small rounding tolerance
  if (Math.abs(calcDiff - billed) > 1) {
    return {
      hasDiscrepancy: true,
      calcUnits: calcDiff,
      billedUnits: billed,
      warning: `Reading mismatch: Present reading (${currStr}) minus Previous reading (${prevStr}) is ${calcDiff} kWh, but billed units is ${billed} kWh. The utility bill may include a meter multiplier (MF), adjustment, or estimated assessment. Billed units was preserved.`,
    }
  }

  return {
    hasDiscrepancy: false,
    calcUnits: calcDiff,
    billedUnits: billed,
    warning: null,
  }
}

/**
 * Detects utility company / DISCOM from text.
 */
function extractDiscom(text) {
  if (/TSSPDCL|TGSPDCL|SOUTHERN POWER DISTRIBUTION/i.test(text)) {
    return 'TSSPDCL (Telangana Southern Power)'
  }
  if (/TSNPDCL|TGNPDCL|NORTHERN POWER DISTRIBUTION/i.test(text)) {
    return 'TSNPDCL (Telangana Northern Power)'
  }
  if (/BESCOM|BANGALORE ELECTRICITY/i.test(text)) {
    return 'BESCOM (Karnataka)'
  }
  if (/MAHADISCOM|MSEDCL|MAHAVITARAN|MAHARASHTRA\s*STATE\s*ELECTRICITY/i.test(text)) {
    return 'MSEDCL (Maharashtra)'
  }
  if (/TANGEDCO|TNEB|TAMIL\s*NADU\s*ELECTRICITY/i.test(text)) {
    return 'TANGEDCO (Tamil Nadu)'
  }
  if (/UPPCL|PVVNL|MVVNL|DVVNL|PuVVNL|UTTAR\s*PRADESH\s*POWER/i.test(text)) {
    return 'UPPCL (Uttar Pradesh)'
  }
  if (/BSES|BRPL|BYPL|TPDDL|TATA\s*POWER\s*DELHI/i.test(text)) {
    return 'Delhi DISCOM (BSES / TPDDL)'
  }
  if (/APEPDCL|APSPDCL|APCPDCL|ANDHRA\s*PRADESH/i.test(text)) {
    return 'Andhra Pradesh DISCOM'
  }
  if (/PSPCL|PUNJAB\s*STATE\s*POWER/i.test(text)) {
    return 'PSPCL (Punjab)'
  }
  if (/DHBVN|UHBVN|HARYANA/i.test(text)) {
    return 'Haryana DISCOM (DHBVN/UHBVN)'
  }
  if (/KSEB|KERALA\s*STATE\s*ELECTRICITY/i.test(text)) {
    return 'KSEB (Kerala)'
  }
  if (/WBSEDCL|WEST\s*BENGAL|CESC\b/i.test(text)) {
    return 'West Bengal / CESC'
  }
  return ''
}

/**
 * Extracts consumer / USCNO number.
 * Specifically extracts from "Consumer No. / USCNO" or "USCNO" label,
 * and explicitly ignores "Old Consumer No." or "Old SC No."
 */
function extractConsumerNumber(text, lines, warnings) {
  // 1. Primary: specifically look for Consumer No. / USCNO, USCNO, or Unique Service No.
  // Handles OCR separators like "©", ":", "-", spaces, etc.
  const uscnoRegex = /(?:Consumer\s*No\.?\s*(?:[/()]\s*)?USCNO\)?|USCNO|U\.?S\.?C\.?\s*NO\.?|Unique\s*Service\s*(?:No|Number))[^0-9\na-zA-Z]{0,10}([0-9]{7,15})\b/i
  const uscMatch = text.match(uscnoRegex)
  if (uscMatch) {
    return uscMatch[1].trim()
  }

  // 2. Scan lines individually, strictly ignoring lines with "Old" or "Previous"
  const candidates = []
  for (const line of lines) {
    if (/Old\s*(?:Consumer|SC|Service)|Previous\s*(?:Consumer|SC|Service)/i.test(line)) {
      continue
    }

    const m = line.match(/(?:Consumer\s*(?:No|Number|ID)?|Service\s*(?:No|Number)|SC\s*NO|CANO|CA\s*Number|Account\s*(?:No|Number|ID)|K\s*No)[^0-9\na-zA-Z]{0,10}([0-9]{6,16})\b/i)
    if (m) {
      candidates.push(m[1])
    }
  }

  if (candidates.length === 1) {
    return candidates[0]
  }
  if (candidates.length > 1) {
    if (candidates.every((c) => c === candidates[0])) {
      return candidates[0]
    }
    warnings.push('Multiple consumer number candidates detected; please verify manually.')
    return ''
  }

  return ''
}

/**
 * Extracts bill issue date separately from billing period and due date.
 */
function extractBillDate(text, lines, warnings) {
  const datePattern = '([0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[0-9]{1,2}[-/.\s][A-Za-z]{3,9}[-/.\s][0-9]{2,4}|[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2})'
  const dateRegex = new RegExp(`\\b${datePattern}\\b`)

  // 1. Look for explicit Bill Issue Date / Bill Date label
  for (const line of lines) {
    // Skip due date, disconnection date, reading dates, and period ranges
    if (/Due\s*Date|Disconnection|Pay\s*By|Reading\s*Date|Prev(?:ious)?\s*Date|Pres(?:ent)?\s*Date/i.test(line)) {
      continue
    }
    if (/to\b|\s-\s/i.test(line) && /Period/i.test(line)) {
      continue
    }

    if (/Bill\s*(?:Issue\s*)?Date|Date\s*of\s*Bill|Bill\s*Dt\b|Billing\s*Date/i.test(line)) {
      const match = line.match(new RegExp(`(?:Bill\\s*(?:Issue\\s*)?Date|Date\\s*of\\s*Bill|Bill\\s*Dt\\b|Billing\\s*Date)[\\s.:=+\\-~_]*${datePattern}`, 'i'))
      if (match) {
        return match[1].trim()
      }
      const genericMatch = line.match(dateRegex)
      if (genericMatch) {
        return genericMatch[1].trim()
      }
    }
  }

  // 2. Multiline check: Label on line N, date on line N+1
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    if (/Bill\s*(?:Issue\s*)?Date|Date\s*of\s*Bill/i.test(line) && !/Due|Period|Disconnection/i.test(line)) {
      const nextLine = lines[i + 1]
      const m = nextLine.match(dateRegex)
      if (m && !/Due|Period|Disconnection/i.test(nextLine)) {
        return m[1].trim()
      }
    }
  }

  return ''
}

/**
 * Extracts billing period (e.g. "01-07-2026 to 01-08-2026" or "July 2026").
 */
function extractBillingPeriod(text, lines) {
  const periodMatch = text.match(/(?:Bill\s*Period|Billing\s*Period|Bill\s*Month)[\s.:=-]*([0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}\s*(?:to|-)\s*[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[A-Za-z]{3,9}\s*[-/]?\s*[0-9]{4})/i)
  if (periodMatch) {
    return periodMatch[1].trim()
  }

  // Fallback to "Period: July 2026"
  for (const line of lines) {
    const m = line.match(/\bPeriod[\s.:=-]*([0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}\s*(?:to|-)\s*[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[A-Za-z]{3,9}\s*[-/]?\s*[0-9]{4})/i)
    if (m) {
      return m[1].trim()
    }
  }

  return ''
}

/**
 * Extracts billing cycle days (15-90).
 */
function extractBillingDays(text, lines) {
  const daysMatch = text.match(/(?:Bill\s*Days|Billing\s*Days|No\.?\s*of\s*Days|Bill\s*Cycle)[\s.:=+\-~_]*([0-9]{1,3})\s*(?:Days)?/i)
  if (daysMatch) {
    const d = parseInt(daysMatch[1], 10)
    if (d >= 15 && d <= 90) return String(d)
  }

  // Fallback line scan for "Days: 31" or "31 Days"
  for (const line of lines) {
    const m = line.match(/\b([0-9]{1,2})\s*Days\b/i) || line.match(/\bDays[\s.:=-]*([0-9]{1,2})\b/i)
    if (m) {
      const d = parseInt(m[1], 10)
      if (d >= 15 && d <= 90) return String(d)
    }
  }

  return ''
}

/**
 * Extracts numbers with optional thousands separators (e.g. 8,450 or 14280).
 */
export function extractNumbersWithCommas(str) {
  if (!str) return []
  const regex = /\b[0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]+)?\b|\b[0-9]+(?:\.[0-9]+)?\b/g
  return str.match(regex) || []
}

/**
 * Identifies column definitions and order from table header text.
 */
function parseTableColumns(headerText) {
  const columnDefs = [
    { key: 'desc', pattern: /(?:Description|Meter\s*(?:No|Number|\.?)|Particulars|Serial\s*(?:No|Number|\.?)|Mtr\s*(?:No|Number|\.?))/i },
    { key: 'prev', pattern: /(?:Prev(?:ious)?\s*(?:Reading|Rdg|Mtr\s*Rdg)?|Old\s*(?:Reading|Rdg)|Pr\s*Rdg|Initial\s*Reading|Last\s*Reading|Prev\b)/i },
    { key: 'curr', pattern: /(?:Pres(?:ent)?\s*(?:Reading|Rdg|Mtr\s*Rdg)?|Curr(?:ent)?\s*(?:Reading|Rdg|Mtr\s*Rdg)?|New\s*(?:Reading|Rdg)|Final\s*Reading|Pres\b|Curr\b)/i },
    { key: 'diff', pattern: /(?:Diff(?:erence)?|Net\s*Reading|Difference\s*Units)/i },
    { key: 'mf', pattern: /(?:Meter\s*Multiplier|Multiplier|\bMF\b|M\.F\.)/i },
    { key: 'units', pattern: /(?:Units\s*Consumed|Consumed\s*Units|Total\s*Units|Billed\s*Units|Billed\s*Consumption|Total\s*Consumption|Net\s*Units|\bUnits\b)/i },
  ]

  const found = []
  for (const def of columnDefs) {
    const match = headerText.match(def.pattern)
    if (match) {
      found.push({ key: def.key, index: match.index })
    }
  }
  found.sort((a, b) => a.index - b.index)
  return found
}

/**
 * Extracts previous reading, present reading, and units consumed from labeled columns.
 * Specifically checks the "Meter Reading Details" table and "Units Consumed" / "Energy (kWh)" rows,
 * preserving thousands separators and avoiding subtraction-based guessing.
 */
function extractMeterReadingsAndUnits(text, lines, warnings) {
  let previousReading = ''
  let currentReading = ''
  let unitsConsumed = ''

  const mtrIdx = lines.findIndex((l) => /Meter\s*Reading\s*Details|Reading\s*Details|Meter\s*Details/i.test(l))
  const searchStart = mtrIdx !== -1 ? mtrIdx : 0
  const searchEnd = mtrIdx !== -1 ? Math.min(lines.length, mtrIdx + 16) : lines.length

  // Find data row (Energy (kWh) row or row with >= 2 numbers)
  let targetRow = null
  let targetRowIdx = -1

  for (let i = searchStart; i < searchEnd; i++) {
    const l = lines[i]
    if (/Energy\s*Charges|Fixed\s*Charges|Electricity\s*Duty/i.test(l)) continue

    const nums = extractNumbersWithCommas(l)
    if (nums.length < 2) continue

    if (/(?:(?:Active\s*)?Energy\s*[({[/]?\s*(?:k?Wh|Units?)\s*[)}\]]?|(?:Active\s*)?Energy\s*k?Wh\b|\bkWh\b|\bKWH\b|Billed\s*Units|Consumption)/i.test(l)) {
      targetRow = l
      targetRowIdx = i
      break
    }

    if (mtrIdx !== -1 && i > mtrIdx && targetRowIdx === -1) {
      if (!/Description|Previous|Present|Current|Reading|Difference|Multiplier/i.test(l)) {
        targetRow = l
        targetRowIdx = i
      }
    }
  }

  // Fallback to scan full document for Energy row with >= 2 numbers
  if (!targetRow) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (/Energy\s*Charges|Fixed\s*Charges|Electricity\s*Duty/i.test(l)) continue
      if (/(?:(?:Active\s*)?Energy\s*[({[/]?\s*(?:k?Wh|Units?)\s*[)}\]]?|(?:Active\s*)?Energy\s*k?Wh\b)/i.test(l)) {
        const nums = extractNumbersWithCommas(l)
        if (nums.length >= 2) {
          targetRow = l
          targetRowIdx = i
          break
        }
      }
    }
  }

  let headerCols = []
  if (targetRowIdx !== -1) {
    // Collect header text from lines preceding targetRow
    const headerLines = []
    const headerStart = mtrIdx !== -1 ? mtrIdx : Math.max(0, targetRowIdx - 4)
    for (let i = headerStart; i < targetRowIdx; i++) {
      headerLines.push(lines[i])
    }
    const headerText = headerLines.join(' ')
    headerCols = parseTableColumns(headerText)

    let lineToParse = targetRow
    if (/^.*?(?:Energy\s*[({[/]?\s*k?Wh\s*[)}\]]?|Energy\s*k?Wh\b)/i.test(targetRow)) {
      lineToParse = targetRow.replace(/^.*?(?:Energy\s*[({[/]?\s*k?Wh\s*[)}\]]?|Energy\s*k?Wh\b)/i, '')
    } else if (/^[A-Za-z0-9-]+\s+[0-9]/.test(targetRow)) {
      lineToParse = targetRow.replace(/^[A-Za-z0-9-]+\s+/, '')
    }

    const nums = extractNumbersWithCommas(lineToParse)

    if (headerCols.length > 0) {
      const numCols = headerCols.filter((c) => c.key !== 'desc')
      const mapped = {}
      numCols.forEach((col, idx) => {
        if (nums[idx] !== undefined) {
          mapped[col.key] = nums[idx]
        }
      })

      if (mapped.prev) previousReading = mapped.prev
      if (mapped.curr) currentReading = mapped.curr
      if (mapped.units) unitsConsumed = mapped.units
      else if (mapped.diff) unitsConsumed = mapped.diff

      // If units column was not recognized in header, but Energy row has 3 numbers and prev & curr are set
      if (!unitsConsumed && nums.length >= 3 && mapped.prev && mapped.curr) {
        unitsConsumed = nums[2]
      }
    } else {
      if (nums.length >= 2) {
        previousReading = nums[0]
        currentReading = nums[1]
        if (nums.length >= 3) {
          unitsConsumed = nums[2]
        }
      }
    }
  }

  // 2. Labeled field fallback (for spot billing receipts or individual labels)
  if (!previousReading) {
    const prevMatch = text.match(/(?:Previous\s*(?:Meter\s*)?Reading|Prev\s*(?:Mtr\s*)?Rdg|Old\s*(?:Meter\s*)?Reading|Old\s*Rdg|Pr\s*Rdg|Initial\s*Reading|Last\s*Reading|Previous\s*Index)[\s.:=+\-~_]*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i)
    if (prevMatch) previousReading = prevMatch[1].trim()
  }

  if (!currentReading) {
    const presMatch = text.match(/(?:Present\s*(?:Meter\s*)?Reading|Current\s*(?:Meter\s*)?Reading|Pres\s*(?:Mtr\s*)?Rdg|Curr\s*(?:Mtr\s*)?Rdg|New\s*(?:Meter\s*)?Reading|New\s*Rdg|Final\s*Reading|Present\s*Index|Current\s*Index)[\s.:=+\-~_]*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i)
    if (presMatch) currentReading = presMatch[1].trim()
  }

  if (!unitsConsumed) {
    const unitsRegex = /(?:Total\s*Billed\s*Units|Billed\s*Units\s*(?:\(kWh\)|in\s*kWh)?|Units\s*Consumed\s*(?:\(kWh\)|in\s*kWh)?|Consumed\s*Units\s*(?:\(kWh\)|in\s*kWh)?|Total\s*(?:Units\s*)?Consumed|Units\s*Billed\s*(?:\(kWh\))?|Total\s*Units|Total\s*Energy\s*(?:Consumed|Billed)?\s*(?:\(kWh\)|in\s*kWh)?|Billed\s*Consumption|Total\s*Consumption|Consumption\s*(?:in\s*kWh|\(kWh\)|in\s*Units)?|Recorded\s*Units|Assessed\s*Units|Net\s*Units|Units\s*(?:\(kWh\))?|Billed\s*kWh|Total\s*kWh|\bUnits\b)[\s.:=+\-~_]*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i
    const unitsMatch = text.match(unitsRegex)
    if (unitsMatch) {
      unitsConsumed = unitsMatch[1].trim()
    } else {
      // Check multiline: Label on line N, number on line N+1
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i]
        if (/(?:Units\s*Consumed|Consumed\s*Units|Billed\s*Units|Total\s*Units|Billed\s*Consumption|Total\s*Consumption|Consumption|Total\s*Billed\s*Units)(?:\s*(?:\(kWh\)|in\s*kWh|in\s*Units))?[\s.:=+\-~_]*$/i.test(line.trim())) {
          const nextLine = lines[i + 1].trim()
          const m = nextLine.match(/^(?:(?:RS\.?|INR|₹)\s*)?([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)(?:\s*(?:kWh|units?))?$/i)
          if (m) {
            unitsConsumed = m[1]
            break
          }
        }
      }

      // Check for standalone Energy (kWh) : 270 line
      if (!unitsConsumed) {
        for (const line of lines) {
          if (/Energy\s*Charges/i.test(line)) continue
          const m = line.match(/(?:Energy\s*[({[/]?\s*k?Wh\s*[)}\]]?|Energy\s*k?Wh)[\s.:=-]+([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\b/i)
          if (m) {
            const numsOnLine = extractNumbersWithCommas(line)
            if (numsOnLine.length === 1) {
              unitsConsumed = m[1].trim()
              break
            }
          }
        }
      }
    }
  }

  // 3. Zero-inference & validation:
  // If readings or units are missing from labeled columns, do not guess or subtract!
  // Leave blank and surface explicit warnings.
  if (!previousReading && !currentReading && !unitsConsumed) {
    warnings.push('Meter reading details not found in bill text; please enter readings manually.')
  } else if (!previousReading || !currentReading) {
    warnings.push('Previous or present meter reading appears incomplete in OCR text; please verify manually.')
  }

  return { previousReading, currentReading, unitsConsumed }
}

/**
 * Extracts total amount payable, specifically targeting "Total Amount Payable (Rounded)"
 * or "Total Amount Payable", avoiding subtotals and individual charges.
 */
function extractAmountPayable(text, lines, warnings) {
  // 1. High-priority targeted pattern:
  const payableRegex = /(?:Total\s*(?:Amount|Amt)\s*Payable\s*(?:\(Rounded\))?|Net\s*(?:Amount|Amt)\s*Payable\s*(?:\(Rounded\))?|Amount\s*Payable\s*(?:\(Rounded\))?|Amount\s*Payable\s*by\s*Due\s*Date|Amount\s*Payable|Payable\s*Amount\s*(?:\(Rounded\))?|Payable\s*Amount|Amount\s*to\s*(?:be\s*)?Paid|Net\s*Amount\s*to\s*Pay|Total\s*(?:Bill\s*)?(?:Amount|Amt)|Net\s*(?:Bill\s*)?(?:Amount|Amt)|Total\s*Payable\s*(?:\(Rounded\))?|Net\s*Payable|Total\s*Due|Net\s*Due|Bill\s*Amount|Tot\s*Amt(?:\s*Payable)?|Total\s*Dues|Gross\s*Amount\s*Payable|Final\s*(?:Bill\s*)?Amount)[\s.:=+\-~_]*(?:RS\.?|INR|₹)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
  const match = text.match(payableRegex)
  if (match) {
    return match[1].replace(/,/g, '')
  }

  // 2. Multiline check: Label on line N, amount on line N+1
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    if (/(?:Total\s*(?:Amount|Amt)\s*Payable|Net\s*(?:Amount|Amt)\s*Payable|Amount\s*Payable|Total\s*Payable|Bill\s*Amount|Total\s*Amount|Payable\s*Amount|Net\s*Amount|Total\s*Due)/i.test(line)) {
      if (/after\s*due\s*date/i.test(line)) continue
      const nextLine = lines[i + 1]
      const m = nextLine.match(/(?:RS\.?|INR|₹)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i)
      if (m && !/Date|Period|Units|Reading/i.test(nextLine)) {
        return m[1].replace(/,/g, '')
      }
    }
  }

  // 3. Fallback scan avoiding subtotals and individual charges unless the line explicitly specifies total payable
  for (const line of lines) {
    const isTargetedLine = /(?:Total\s*(?:Amount|Amt)\s*Payable|Net\s*(?:Amount|Amt)\s*Payable|Amount\s*Payable|Total\s*Due|Bill\s*Amount|Payable\s*Amount)/i.test(line)
    if (!isTargetedLine && /Energy\s*Charges|Fixed\s*Charges|Customer\s*Charges|Electricity\s*Duty|Current\s*Month|Sub\s*Total|Arrears|Interest/i.test(line)) {
      continue
    }
    const m = line.match(/(?:(?:Total\s*)?(?:Amount|Amt)\s*Payable|Total\s*Due|Bill\s*Amount|Payable\s*Amount)[\s.:=-]*(?:RS\.?|INR|₹)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i)
    if (m) {
      return m[1].replace(/,/g, '')
    }
  }

  return ''
}

/**
 * Parses raw OCR string into structured bill fields.
 * Never invents values; missing fields remain empty strings.
 */
export function parseBillText(rawText) {
  const text = cleanOcrText(rawText)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const warnings = []

  const fields = {
    consumerNumber: '',
    discom: '',
    billingPeriod: '',
    billDate: '',
    previousReading: '',
    currentReading: '',
    unitsConsumed: '',
    billingDays: '',
    amountPayable: '',
  }

  fields.discom = extractDiscom(text)
  fields.consumerNumber = extractConsumerNumber(text, lines, warnings)
  fields.billDate = extractBillDate(text, lines, warnings)
  fields.billingPeriod = extractBillingPeriod(text, lines)
  fields.billingDays = extractBillingDays(text, lines)

  const readings = extractMeterReadingsAndUnits(text, lines, warnings)
  fields.previousReading = readings.previousReading
  fields.currentReading = readings.currentReading
  fields.unitsConsumed = readings.unitsConsumed

  fields.amountPayable = extractAmountPayable(text, lines, warnings)

  // Validate reading arithmetic
  const discrepancy = checkReadingDiscrepancy(
    fields.previousReading,
    fields.currentReading,
    fields.unitsConsumed
  )

  if (discrepancy?.hasDiscrepancy) {
    warnings.push(discrepancy.warning)
  }

  const extractedKeys = Object.keys(fields).filter((k) => fields[k] !== '')

  return {
    fields,
    discrepancy,
    warnings,
    extractedCount: extractedKeys.length,
    rawText,
  }
}
