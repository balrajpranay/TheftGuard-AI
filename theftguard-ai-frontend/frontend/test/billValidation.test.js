import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateBillFile,
  assessDataSufficiency,
  MAX_BILL_FILE_BYTES,
  ACCEPTED_EXTENSIONS,
  DEMO_TELANGANA_BILL,
} from '../src/lib/billValidation.js'

describe('Electricity Bill Validation & Sufficiency', () => {
  it('accepts JPG, JPEG, PNG, and PDF files within 10 MB limit', () => {
    const validFiles = [
      { name: 'bill_hyderabad.jpg', size: 1024 * 500, type: 'image/jpeg' },
      { name: 'tsspdcl_bill.jpeg', size: 1024 * 800, type: 'image/jpeg' },
      { name: 'meter_photo.png', size: 1024 * 1200, type: 'image/png' },
      { name: 'eb_statement.pdf', size: 1024 * 2500, type: 'application/pdf' },
    ]

    for (const f of validFiles) {
      const res = validateBillFile(f)
      assert.equal(res.ok, true, `Expected ${f.name} to be valid`)
      assert.equal(res.fileInfo.name, f.name)
      assert.equal(res.fileInfo.size, f.size)
    }
  })

  it('rejects unsupported file formats like CSV, TXT, DOCX, EXE', () => {
    const invalidFiles = [
      { name: 'consumption.csv', size: 5000, type: 'text/csv' },
      { name: 'notes.txt', size: 1000, type: 'text/plain' },
      { name: 'bill.docx', size: 50000, type: 'application/vnd.openxmlformats' },
      { name: 'program.exe', size: 100000, type: 'application/octet-stream' },
    ]

    for (const f of invalidFiles) {
      const res = validateBillFile(f)
      assert.equal(res.ok, false, `Expected ${f.name} to be rejected`)
      assert.match(res.error, /Unsupported file format/i)
    }
  })

  it('rejects files exceeding 10 MB', () => {
    const bigFile = {
      name: 'large_bill_scan.pdf',
      size: MAX_BILL_FILE_BYTES + 1024,
      type: 'application/pdf',
    }

    const res = validateBillFile(bigFile)
    assert.equal(res.ok, false)
    assert.match(res.error, /too large/i)
  })

  it('handles null or missing files gracefully', () => {
    const res = validateBillFile(null)
    assert.equal(res.ok, false)
    assert.match(res.error, /No file was selected/i)
  })

  it('correctly assesses data sufficiency for a single monthly bill', () => {
    const sufficiency = assessDataSufficiency(DEMO_TELANGANA_BILL)
    assert.equal(sufficiency.isSufficient, false)
    assert.equal(sufficiency.status, 'More consumption history required')
    assert.equal(sufficiency.tone, 'warn')
    assert.ok(sufficiency.reasons.length >= 3)
    assert.match(sufficiency.recommendation, /Do not pass single bill values directly/i)
  })
})
