import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseBillText, checkReadingDiscrepancy, extractNumbersWithCommas } from '../src/lib/billParser.js'

describe('Electricity Bill OCR Parser', () => {
  it('correctly parses a standard TSSPDCL spot billing receipt', () => {
    const rawOcr = `
TELANGANA STATE SOUTHERN POWER DISTRIBUTION COMPANY LTD
TSSPDCL - SPOT BILLING RECEIPT
USCNO: 100458921
CATEGORY: LT-1(B) DOMESTIC
BILL DT: 02/08/2026
BILL PERIOD: 01/07/2026 TO 01/08/2026
BILL DAYS: 31
PREV RDG: 14280
PRES RDG: 14525
BILLED UNITS: 245
NET AMT PAYABLE: RS. 1725.00
DUE DATE: 17/08/2026
`
    const result = parseBillText(rawOcr)
    assert.equal(result.fields.discom, 'TSSPDCL (Telangana Southern Power)')
    assert.equal(result.fields.consumerNumber, '100458921')
    assert.equal(result.fields.billDate, '02/08/2026')
    assert.equal(result.fields.billingPeriod, '01/07/2026 TO 01/08/2026')
    assert.equal(result.fields.billingDays, '31')
    assert.equal(result.fields.previousReading, '14280')
    assert.equal(result.fields.currentReading, '14525')
    assert.equal(result.fields.unitsConsumed, '245')
    assert.equal(result.fields.amountPayable, '1725.00')

    assert.equal(result.discrepancy?.hasDiscrepancy, false)
  })

  it('correctly extracts TSSPDCL bill image layout with Old Consumer No, Reading Table, and Rounded Total', () => {
    const billImageOcr = `
SOUTHERN POWER DISTRIBUTION COMPANY OF TELANGANA LIMITED
(TGSPDCL / TSSPDCL)
ELECTRICITY BILL - LT-1(B) DOMESTIC

Consumer Details:
Old Consumer No. : 1234567890
Consumer No. / USCNO : 100458921
Consumer Name : M. SRINIVAS
Category : LT-1(B) Domestic
Connected Load : 4000 Watts

Billing Details:
Bill Issue Date : 02-08-2026
Bill Period : 01-07-2026 to 01-08-2026
Billing Days : 31 Days
Due Date : 17-08-2026
Disconnection Date : 27-08-2026

Meter Reading Details:
Meter No.        Previous Reading    Present Reading    Difference    MF    Units Consumed
TG89421          14280               14550              270           1     270

Energy (kWh) : 270
Slab 3 Limit : 400 Units

Bill Charges:
Energy Charges : 1250.00
Customer Charges : 60.00
Electricity Duty : 55.00
Current Month Charges : 1365.00
Arrears : 0.00
Total Amount Payable (Rounded) : Rs. 1365.00
`
    const result = parseBillText(billImageOcr)

    // 1. Consumer No. / USCNO extracted as 100458921, ignoring Old Consumer No. 1234567890
    assert.equal(result.fields.consumerNumber, '100458921')

    // 2. Units extracted as 270, not 400 from slab/load
    assert.equal(result.fields.unitsConsumed, '270')

    // 3. Bill Date extracted as 02-08-2026, separate from Due Date and Bill Period
    assert.equal(result.fields.billDate, '02-08-2026')
    assert.equal(result.fields.billingPeriod, '01-07-2026 to 01-08-2026')
    assert.equal(result.fields.billingDays, '31')

    // 4. Meter readings from table
    assert.equal(result.fields.previousReading, '14280')
    assert.equal(result.fields.currentReading, '14550')

    // 5. Total Amount Payable (Rounded) extracted
    assert.equal(result.fields.amountPayable, '1365.00')

    // 6. Utility detected
    assert.equal(result.fields.discom, 'TSSPDCL (Telangana Southern Power)')

    // 7. Reading difference 14550 - 14280 = 270 matches unitsConsumed 270
    assert.equal(result.discrepancy?.hasDiscrepancy, false)
  })

  it('correctly extracts exact Telangana Electricity Bill Layout image OCR (preserving commas, column readings, and USCNO with OCR noise)', () => {
    // Exact raw OCR output from Telangana Electricity Bill Layout.png
    const rawOcr = `
~ SOUTHERN POWER DISTRIBUTION COMPANY OF TELANGANA LIMITED |. i
TSSPDCL (A Government of Telangana Undertaking) TELANGANA hi A A ol
7d Electricity Bill for Domestic Service (LT-1B) BRIGHTER 0 enll
CIN: U40109TG2000SGC034116 | Website: www.tsspdcl.in TOMORROW NAIR
Consumer No. / USCNO © 100458921 Billing Period : 01-08-2026 to 31-08-2026 Total Amount Payable (2)
Consumer Name : K. Ramesh Kumar Bill Date + 02-09-2026
Address © H.No. 12-3-456, Sri Venkateswara Colony ~~ pye Date + 17-09-2026 1,842.00
Hayathnagar, R.R. District
Ren Re oi50 EB Deposit © 21,000.00 Due Date: 17-09-2026
Service Type : Domestic (LT-1B) Bill Cycle + 30Days IO] RE [E scan&pay
Sanctioned Load © 5.00 kw Tariff Category : LT-1B (Domestic) Tl 3 via UPI / Mobile Apps
Supply Voltage 1 230V Meter Reading Type  : Actual [Erk BHIMp  QPay
Meter No. : MF123456 Old Consumer No. ~~: 1234567890 [EE ©rroncre  paytm
Meter Reading Details Consumption History (Last 6 Months)
Description Previous Reading Current Reading Units Consumed | Meter Multiplier Total Units 400
| = 280
Energy (kWh) 8,450 8,720 ( 270 1 270 og 200
> 200
Reading Date | 01082026 31-08-2026 - - - The
5
Reading Type Actual Actual - | - - 0
L Mar Apr May Jun Jul Aug
— : 2026 2026 2026 2026 2026 2026
Billing Details
Sl.No. Description Units / Days Rate (3) Amount (3) Message / Information
1 | Energy Charges 270 5.50 1,485.00 « Please pay the bill on or before the due date to avoid
1 disconnection and additional charges.
2 Fixed Charges 30 Days | 5.00 150.00 « This is a computer generated bill and does not require
ke! Electricity Duty - | 6% 99.90 signature.
« For any billing complaints, contact 1912 (24x7) or visit
4 Other Charges - | - | 25.00 www.tsspdelin.
Total Current Charges 1,759.90 « You can also pay through TSSPDCL Mobile App or UPI.
CaST®2.5% “0 « Meter reading is actual.
: ; « Keep your consumer number ready for all communications.
SGST @ 2.5% 43.00
| Total Amount Payable (Rounded) | 1,842.00 Vv Save Energy Use electricity wisely
for a greener Telangana. T
Amount in Words: Rupees One Thousand Eight Hundred Forty Two Only Save Tomorrow Lies = g
For Office Use Only Receipt No. : Date : Amount : Bank:
`
    const result = parseBillText(rawOcr)

    // 1. Consumer number is 100458921 (ignoring Old Consumer No: 1234567890 and handling "©" separator)
    assert.equal(result.fields.consumerNumber, '100458921')

    // 2. Previous reading preserves comma: "8,450" (not "450" or "8")
    assert.equal(result.fields.previousReading, '8,450')

    // 3. Current reading preserves comma: "8,720" (not "720")
    assert.equal(result.fields.currentReading, '8,720')

    // 4. Units consumed is "270" from the Units Consumed column (not "8")
    assert.equal(result.fields.unitsConsumed, '270')

    // 5. Reading discrepancy: 8,720 - 8,450 = 270 matches billed units 270 (no false mismatch warning)
    assert.equal(result.discrepancy?.hasDiscrepancy, false)
    assert.equal(result.discrepancy?.calcUnits, 270)
    assert.equal(result.discrepancy?.billedUnits, 270)
    assert.equal(result.discrepancy?.warning, null)

    // 6. Preserves existing working extractions
    assert.equal(result.fields.discom, 'TSSPDCL (Telangana Southern Power)')
    assert.equal(result.fields.billDate, '02-09-2026')
    assert.equal(result.fields.billingPeriod, '01-08-2026 to 31-08-2026')
    assert.equal(result.fields.billingDays, '30')
    assert.equal(result.fields.amountPayable, '1842.00')

    // 7. No spurious warnings
    assert.deepEqual(result.warnings, [])
  })

  it('does not infer units consumed by subtraction when units column/label is missing', () => {
    // Only previous and current readings are given in table; no units column or units label
    const rawOcr = `
TSSPDCL
Consumer No. / USCNO: 100458921
Meter Reading Details:
Description Previous Reading Current Reading
Energy (kWh) 8,450 8,720
Bill Issue Date: 02-09-2026
Total Amount Payable: 1500
`
    const result = parseBillText(rawOcr)
    assert.equal(result.fields.previousReading, '8,450')
    assert.equal(result.fields.currentReading, '8,720')
    // Must NOT infer unitsConsumed = 8720 - 8450 = 270! Must remain empty string!
    assert.equal(result.fields.unitsConsumed, '')
    // Discrepancy helper returns null when units are empty
    assert.equal(result.discrepancy, null)
  })

  it('does not infer previous reading through subtraction when missing from table', () => {
    // Only present reading and units consumed are given; previous reading is missing
    const rawOcr = `
TSSPDCL
Consumer No. / USCNO: 100458921
Meter Reading Details:
Description Current Reading Units Consumed
Energy (kWh) 8,720 270
Bill Issue Date: 02-09-2026
Total Amount Payable: 1500
`
    const result = parseBillText(rawOcr)
    // Must NOT infer previousReading = 8720 - 270 = 8450!
    assert.equal(result.fields.previousReading, '')
    assert.equal(result.fields.currentReading, '8,720')
    assert.equal(result.fields.unitsConsumed, '270')
    assert.ok(result.warnings.some((w) => /incomplete/i.test(w)))
    assert.equal(result.discrepancy, null)
  })

  it('correctly extracts readings when table header spans across multiple lines', () => {
    const rawOcr = `
TSSPDCL
USCNO: 100458921
Meter Reading Details:
Description Previous Current
Reading Reading Units
Energy (kWh) 8,450 8,720 270
Bill Issue Date: 02-09-2026
Total Amount Payable: 1500
`
    const result = parseBillText(rawOcr)
    assert.equal(result.fields.previousReading, '8,450')
    assert.equal(result.fields.currentReading, '8,720')
    assert.equal(result.fields.unitsConsumed, '270')
    assert.equal(result.discrepancy?.hasDiscrepancy, false)
  })

  it('detects and flags reading discrepancies between (curr - prev) and billed units without overwriting', () => {
    const rawOcr = `
TSSPDCL
Consumer No. / USCNO: 99887766
PREV RDG: 10000
PRES RDG: 10250
BILLED UNITS: 300
Total Amount Payable: 2100
`
    const result = parseBillText(rawOcr)
    assert.equal(result.fields.previousReading, '10000')
    assert.equal(result.fields.currentReading, '10250')
    assert.equal(result.fields.unitsConsumed, '300') // Billed units preserved

    assert.ok(result.discrepancy)
    assert.equal(result.discrepancy.hasDiscrepancy, true)
    assert.equal(result.discrepancy.calcUnits, 250)
    assert.equal(result.discrepancy.billedUnits, 300)
    assert.match(result.discrepancy.warning, /Reading mismatch/i)
  })

  it('leaves ambiguous multiple consumer numbers blank and adds a warning instead of guessing', () => {
    const rawOcr = `
ELECTRICITY BILL
Service No: 11223344
Consumer No: 99887766
`
    const result = parseBillText(rawOcr)
    // Ambiguous conflicting numbers without USCNO label -> leave blank
    assert.equal(result.fields.consumerNumber, '')
    assert.ok(result.warnings.some((w) => /ambiguous|multiple consumer/i.test(w)))
  })

  it('leaves missing fields empty instead of hallucinating values', () => {
    const rawOcr = `
ELECTRICITY BILL
CONSUMER: 12345678
BILL DATE: 15-JUN-2026
AMOUNT PAYABLE: 850
`
    const result = parseBillText(rawOcr)
    assert.equal(result.fields.consumerNumber, '12345678')
    assert.equal(result.fields.billDate, '15-JUN-2026')
    assert.equal(result.fields.amountPayable, '850')
    assert.equal(result.fields.previousReading, '')
    assert.equal(result.fields.currentReading, '')
    assert.equal(result.fields.unitsConsumed, '')
    assert.equal(result.fields.billingDays, '')
    assert.equal(result.fields.billingPeriod, '')

    assert.equal(result.discrepancy, null)
  })

  it('handles checkReadingDiscrepancy helper with comma-separated and incomplete data', () => {
    // Comma-separated numbers
    const validWithCommas = checkReadingDiscrepancy('8,450', '8,720', '270')
    assert.equal(validWithCommas.hasDiscrepancy, false)
    assert.equal(validWithCommas.calcUnits, 270)
    assert.equal(validWithCommas.billedUnits, 270)

    const mismatchWithCommas = checkReadingDiscrepancy('8,450', '8,720', '350')
    assert.equal(mismatchWithCommas.hasDiscrepancy, true)
    assert.equal(mismatchWithCommas.calcUnits, 270)
    assert.equal(mismatchWithCommas.billedUnits, 350)
    assert.match(mismatchWithCommas.warning, /8,720/)
    assert.match(mismatchWithCommas.warning, /8,450/)

    // Incomplete data
    assert.equal(checkReadingDiscrepancy('', '100', '100'), null)
    assert.equal(checkReadingDiscrepancy('100', '', '100'), null)
    assert.equal(checkReadingDiscrepancy('100', '200', ''), null)
    assert.equal(checkReadingDiscrepancy('invalid', '200', '100'), null)
  })

  it('correctly extracts comma-separated numbers using extractNumbersWithCommas', () => {
    assert.deepEqual(
      extractNumbersWithCommas('Energy (kWh) 8,450 8,720 ( 270 1 270 og 200'),
      ['8,450', '8,720', '270', '1', '270', '200']
    )
    assert.deepEqual(
      extractNumbersWithCommas('TG89421 14280 14550 270 1 270'),
      ['14280', '14550', '270', '1', '270']
    )
    assert.deepEqual(
      extractNumbersWithCommas('Rate: 5.50 Amount: 1,485.00 Total: 1,25,000'),
      ['5.50', '1,485.00', '1,25,000']
    )
    assert.deepEqual(extractNumbersWithCommas(''), [])
    assert.deepEqual(extractNumbersWithCommas(null), [])
  })
})
