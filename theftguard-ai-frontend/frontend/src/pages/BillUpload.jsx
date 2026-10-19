import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Tesseract from 'tesseract.js'
import { Badge, Button, DemoBadge, EmptyState, Field, inputClass, Notice, PageHeader, Panel, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { fileSize } from '../lib/format'
import {
  ACCEPTED_EXTENSIONS,
  DEMO_TELANGANA_BILL,
  INITIAL_BILL_FIELDS,
  assessDataSufficiency,
  validateBillFile,
} from '../lib/billValidation'
import { checkReadingDiscrepancy, parseBillText } from '../lib/billParser'
import { useAppState } from '../state/AppState'
import { createBillExtraction, listBillExtractions } from '../lib/dbApi'

export default function BillUpload() {
  const { addInvestigation, dbConnected } = useAppState()
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [fileInfo, setFileInfo] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState('')
  const [isDemo, setIsDemo] = useState(false)
  const [fields, setFields] = useState({ ...INITIAL_BILL_FIELDS })
  const [isConfirmed, setIsConfirmed] = useState(false)

  // Persistence and follow-up state
  const [persistStatus, setPersistStatus] = useState('idle') // idle | saving | saved | error
  const [persistError, setPersistError] = useState('')
  const [savedExtractionId, setSavedExtractionId] = useState('')
  const [recentExtractions, setRecentExtractions] = useState([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [invTicket, setInvTicket] = useState('')
  const [invAdded, setInvAdded] = useState(false)
  const [invAdding, setInvAdding] = useState(false)
  const [invError, setInvError] = useState('')

  // OCR state
  const [ocrStage, setOcrStage] = useState('idle') // idle | processing | done | error
  const [ocrProgress, setOcrProgress] = useState({ status: '', percent: 0 })
  const [ocrMessage, setOcrMessage] = useState('')
  const [ocrWarnings, setOcrWarnings] = useState([])
  const [pdfNotice, setPdfNotice] = useState('')
  const [rawOcrText, setRawOcrText] = useState('')
  const [showRawText, setShowRawText] = useState(false)

  // Revoke object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFileSelection(selectedFile) {
    if (!selectedFile) return
    setError('')
    setPdfNotice('')
    setOcrStage('idle')
    setOcrProgress({ status: '', percent: 0 })
    setOcrMessage('')
    setOcrWarnings([])
    setRawOcrText('')
    setShowRawText(false)

    const validation = validateBillFile(selectedFile)
    if (!validation.ok) {
      setError(validation.error)
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }

    setFile(selectedFile)
    setFileInfo(validation.fileInfo)
    setIsDemo(false)
    setIsConfirmed(false)
    setFields({ ...INITIAL_BILL_FIELDS })
    setPersistStatus('idle')
    setPersistError('')
    setSavedExtractionId('')
    setInvAdded(false)
    setInvError('')
    setInvTicket('')

    const url = URL.createObjectURL(selectedFile)
    setPreviewUrl(url)
  }

  function handleRemove() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFile(null)
    setFileInfo(null)
    setError('')
    setPdfNotice('')
    setIsDemo(false)
    setIsConfirmed(false)
    setOcrStage('idle')
    setOcrProgress({ status: '', percent: 0 })
    setOcrMessage('')
    setOcrWarnings([])
    setRawOcrText('')
    setShowRawText(false)
    setFields({ ...INITIAL_BILL_FIELDS })
    setPersistStatus('idle')
    setPersistError('')
    setSavedExtractionId('')
    setInvAdded(false)
    setInvError('')
    setInvTicket('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleLoadDemo() {
    handleRemove()
    setIsDemo(true)
    setFileInfo({
      name: 'tsspdcl_hyderabad_domestic_sample_bill.pdf',
      size: 340 * 1024,
      type: 'application/pdf',
      isPdf: true,
      isImage: false,
    })
    setFields({ ...DEMO_TELANGANA_BILL })
    setIsConfirmed(false)
    setOcrStage('idle')
    setOcrMessage('')
    setOcrWarnings([])
    setPdfNotice('')
    setPersistStatus('idle')
    setPersistError('')
    setSavedExtractionId('')
    setInvAdded(false)
    setInvError('')
    setInvTicket('')
  }

  function handleFieldChange(key, val) {
    setFields((prev) => ({ ...prev, [key]: val }))
    if (isConfirmed) setIsConfirmed(false)
    setPersistStatus('idle')
    setPersistError('')
  }

  const fetchRecentExtractions = useCallback(async () => {
    setLoadingRecent(true)
    try {
      const data = await listBillExtractions({ limit: 5 })
      if (Array.isArray(data)) {
        setRecentExtractions(data)
      }
    } catch {
      // Non-blocking fallback if database offline
    } finally {
      setLoadingRecent(false)
    }
  }, [])

  useEffect(() => {
    fetchRecentExtractions()
  }, [fetchRecentExtractions])

  async function handleSaveExtraction() {
    if (!fields.consumerNumber || persistStatus === 'saving' || persistStatus === 'saved') return
    setPersistStatus('saving')
    setPersistError('')

    try {
      // PRIVACY AUDIT: Strictly omit rawOcrText, file, previewUrl
      const res = await createBillExtraction({
        consumerNumber: fields.consumerNumber,
        discom: fields.discom || null,
        billDate: fields.billDate || null,
        previousReading: fields.previousReading || null,
        currentReading: fields.currentReading || null,
        unitsConsumed: fields.unitsConsumed || null,
        calculatedUnits: discrepancy?.calculatedUnits ?? null,
        billingDays: fields.billingDays || null,
        amountPayable: fields.amountPayable || null,
        hasDiscrepancy: Boolean(discrepancy?.hasDiscrepancy),
        discrepancyWarning: discrepancy?.hasDiscrepancy ? discrepancy.warning : null,
        rawBillingPeriod: fields.billingPeriod || null,
        rawBillDate: fields.billDate || null,
        rawPreviousReading: fields.previousReading ? String(fields.previousReading) : null,
        rawCurrentReading: fields.currentReading ? String(fields.currentReading) : null,
      })

      setPersistStatus('saved')
      setSavedExtractionId(res.id)
      fetchRecentExtractions()
    } catch (err) {
      setPersistStatus('error')
      setPersistError(err.message || 'Failed to persist bill extraction.')
    }
  }

  async function handleAddToInvestigation() {
    if (!fields.consumerNumber) return
    setInvAdding(true)
    setInvError('')
    const basis = discrepancy?.hasDiscrepancy
      ? `Discrepancy in meter readings: ${discrepancy.warning}`
      : `Electricity bill extraction review for consumer ${fields.consumerNumber}.`

    const res = await addInvestigation({
      customerRef: fields.consumerNumber,
      origin: 'bill',
      basis,
    })

    setInvAdding(false)
    if (res.ok) {
      setInvAdded(true)
      setInvTicket(res.ticketCode || '')
    } else {
      setInvError(res.message || 'Could not open investigation ticket.')
    }
  }

  async function handleRunOcr() {
    setError('')
    setPdfNotice('')
    setOcrWarnings([])

    if (fileInfo?.isPdf || isDemo || !fileInfo?.isImage) {
      setPdfNotice(
        isDemo
          ? 'The loaded bill is a demonstration sample. Automated browser OCR currently supports JPG, JPEG, and PNG images; PDF OCR is not supported yet. To test browser OCR on a real bill, upload a JPG, JPEG, or PNG photo.'
          : 'PDF OCR is not supported yet in this browser version. Automated browser OCR currently runs on JPG, JPEG, and PNG images. For PDF statements, please review the document preview and verify or edit fields manually below.'
      )
      return
    }

    if (!file) return

    setOcrStage('processing')
    setOcrProgress({ status: 'Initializing Tesseract OCR engine...', percent: 5 })
    setOcrMessage('')

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress({
              status: 'Recognizing text...',
              percent: Math.min(99, Math.max(10, Math.round(m.progress * 100))),
            })
          } else if (m.status) {
            setOcrProgress({
              status: `${m.status}...`,
              percent: Math.min(50, Math.max(5, Math.round((m.progress || 0) * 100))),
            })
          }
        },
      })

      const rawText = result?.data?.text || ''
      setRawOcrText(rawText)

      const parsed = parseBillText(rawText)

      // Populate extracted fields without overwriting user data if blank
      setFields((prev) => ({
        ...prev,
        ...parsed.fields,
      }))
      setOcrWarnings(parsed.warnings || [])

      setOcrStage('done')
      if (parsed.extractedCount > 0) {
        setOcrMessage(`Successfully identified ${parsed.extractedCount} field(s) from the bill image using browser OCR. Review and verify below.`)
      } else {
        setOcrMessage('OCR scan completed, but standard utility bill labels were not clearly recognized. Please verify or enter fields manually.')
      }
    } catch (err) {
      setOcrStage('error')
      setError(`OCR processing error: ${err.message || 'Failed to read image locally.'}`)
    }
  }

  const discrepancy = useMemo(
    () => checkReadingDiscrepancy(fields.previousReading, fields.currentReading, fields.unitsConsumed),
    [fields.previousReading, fields.currentReading, fields.unitsConsumed]
  )

  const sufficiency = assessDataSufficiency(fields)
  const hasFileOrDemo = Boolean(fileInfo)

  return (
    <>
      <PageHeader
        title="Bill Upload"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleLoadDemo} icon="file">
              Load sample Telangana bill (Demo)
            </Button>
            {hasFileOrDemo ? (
              <Button variant="ghost" onClick={handleRemove}>
                Clear
              </Button>
            ) : null}
          </div>
        }
      >
        Upload monthly electricity bills (such as Telangana TSSPDCL/TSNPDCL printed or PDF bills) for browser-side
        OCR extraction, reading discrepancy verification, and ML data sufficiency assessment.
      </PageHeader>

      {/* Privacy Notice Banner */}
      <Notice tone="info" title="Privacy and Local Processing Guarantee" className="mb-5">
        All OCR text recognition runs 100% locally inside your browser via Tesseract.js. No bill images, account numbers,
        or consumer data are uploaded to external OCR APIs or remote servers.
      </Notice>

      {error ? (
        <Notice tone="danger" title="Validation or processing error" className="mb-5">
          {error}
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Left Column: Upload & Safe Preview */}
        <div className="space-y-5">
          <Panel
            title="Upload electricity bill"
            subtitle="Accepts JPG, PNG images and PDF documents up to 10 MB"
            actions={isDemo ? <DemoBadge>Demonstration Bill</DemoBadge> : null}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              className="sr-only"
              id="bill-file-input"
              aria-label="Upload electricity bill file"
              onChange={(e) => handleFileSelection(e.target.files?.[0])}
            />

            {!hasFileOrDemo ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  handleFileSelection(e.dataTransfer.files?.[0])
                }}
                className={`rounded border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? 'border-ink bg-pale' : 'border-line bg-mist/50 hover:bg-mist'
                }`}
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white border border-line">
                  <Icon name="upload" className="h-6 w-6 text-ink" />
                </div>
                <p className="font-display text-lg font-semibold">Drop electricity bill here</p>
                <p className="mt-1 text-sm text-muted">Supports printed utility bills, smart-meter receipts, or PDF statements</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="primary" icon="upload" onClick={() => inputRef.current?.click()}>
                    Choose a file
                  </Button>
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  {ACCEPTED_EXTENSIONS.map((ext) => (
                    <span key={ext} className="rounded bg-white px-2 py-0.5 text-xs font-mono font-medium text-muted border border-line">
                      {ext.toUpperCase().replace('.', '')}
                    </span>
                  ))}
                  <span className="rounded bg-white px-2 py-0.5 text-xs font-medium text-muted border border-line">
                    Max 10 MB
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-ink text-white">
                      <Icon name="file" className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-ink break-all">{fileInfo.name}</p>
                      <p className="text-xs text-muted">
                        {fileSize(fileInfo.size)} &bull; {fileInfo.isPdf ? 'PDF Document' : 'Image Scan'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="ok">File validated</Badge>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-line">
                  <Button
                    size="sm"
                    variant="primary"
                    icon="search"
                    onClick={handleRunOcr}
                    disabled={ocrStage === 'processing'}
                  >
                    {ocrStage === 'processing' ? 'Running OCR...' : 'Extract with Browser OCR'}
                  </Button>

                  <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
                    Replace file
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleRemove}>
                    Remove
                  </Button>
                  {previewUrl && fileInfo.isPdf ? (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-sm font-medium hover:bg-mist text-ink"
                    >
                      <Icon name="file" className="h-4 w-4" /> Open PDF in tab
                    </a>
                  ) : null}
                </div>

                {/* PDF OCR Not Supported Warning Message */}
                {pdfNotice ? (
                  <div className="mt-3">
                    <Notice tone="warn" title="PDF OCR Not Supported">
                      <p className="text-xs">{pdfNotice}</p>
                    </Notice>
                  </div>
                ) : null}

                {/* OCR Progress Indicator */}
                {ocrStage === 'processing' ? (
                  <div className="mt-4 rounded border border-gold bg-pale p-3 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-ink flex items-center gap-2">
                        <Spinner label="" /> {ocrProgress.status}
                      </span>
                      <span className="font-mono font-bold text-ink">{ocrProgress.percent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-white border border-line">
                      <div
                        className="h-full bg-gold transition-all duration-300"
                        style={{ width: `${ocrProgress.percent}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {/* OCR Result Message */}
                {ocrMessage ? (
                  <div className="mt-4">
                    <Notice tone="ok" title="OCR Result">
                      <p className="text-xs">{ocrMessage}</p>
                      {rawOcrText ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setShowRawText(!showRawText)}
                            className="text-xs underline font-medium hover:text-ink"
                          >
                            {showRawText ? 'Hide raw recognized text' : 'View raw recognized text'}
                          </button>
                          {showRawText ? (
                            <pre className="mt-1.5 max-h-40 overflow-auto rounded bg-mist p-2 font-mono text-[11px] text-ink whitespace-pre-wrap border border-line">
                              {rawOcrText}
                            </pre>
                          ) : null}
                        </div>
                      ) : null}
                    </Notice>
                  </div>
                ) : null}

                {/* PDF Clarification Notice */}
                {fileInfo.isPdf && !pdfNotice ? (
                  <div className="mt-4">
                    <Notice tone="info" title="PDF Document Handling">
                      <p className="text-xs text-muted">
                        {isDemo
                          ? 'This is a demonstration sample bill. Automated browser OCR currently supports JPG, JPEG, and PNG images; PDF OCR is not supported yet.'
                          : 'Automated browser OCR supports JPG, JPEG, and PNG image scans. PDF OCR is not supported yet. Please inspect the PDF preview and verify or edit the extraction fields directly.'}
                      </p>
                    </Notice>
                  </div>
                ) : null}
              </div>
            )}
          </Panel>

          {/* Safe Preview Container */}
          <Panel title="Bill visual preview" subtitle="Safe client-side display">
            {!hasFileOrDemo ? (
              <EmptyState title="No bill loaded">
                Upload a bill image or document to view its visual preview here.
              </EmptyState>
            ) : isDemo ? (
              <div className="rounded border border-line bg-white p-5 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-ink pb-3 mb-3">
                  <div>
                    <p className="font-bold text-sm text-ink font-sans">TSSPDCL - Electricity Bill</p>
                    <p className="text-muted font-sans text-xs">Telangana State Southern Power Distribution Co. Ltd.</p>
                  </div>
                  <DemoBadge>Sample Bill</DemoBadge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-ink">
                  <div><span className="text-muted">USCNO / Consumer:</span> 100458921</div>
                  <div><span className="text-muted">Tariff:</span> LT-1(B) Domestic</div>
                  <div><span className="text-muted">Bill Date:</span> 02-AUG-2026</div>
                  <div><span className="text-muted">Bill Period:</span> July 2026 (31 Days)</div>
                  <div><span className="text-muted">Previous Reading:</span> 14280 kWh</div>
                  <div><span className="text-muted">Current Reading:</span> 14525 kWh</div>
                  <div><span className="text-muted">Billed Units:</span> 245 kWh</div>
                  <div><span className="text-muted">Total Amount:</span> ₹1,725.00</div>
                </div>
                <div className="mt-4 pt-3 border-t border-dashed border-line text-[11px] text-muted font-sans">
                  * Visual simulation of a standard Telangana printed domestic bill for demonstration.
                </div>
              </div>
            ) : previewUrl && fileInfo.isImage ? (
              <div className="overflow-hidden rounded border border-line bg-mist/40 p-2 text-center">
                <img
                  src={previewUrl}
                  alt={`Preview of ${fileInfo.name}`}
                  className="mx-auto max-h-96 rounded object-contain shadow-sm"
                />
                <p className="mt-2 text-xs text-muted">
                  Client-side image preview &bull; {fileInfo.name}
                </p>
              </div>
            ) : previewUrl && fileInfo.isPdf ? (
              <div className="rounded border border-line bg-white p-6 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-pale border border-gold">
                  <Icon name="file" className="h-7 w-7 text-ink" />
                </div>
                <p className="font-semibold text-ink">{fileInfo.name}</p>
                <p className="mt-1 text-sm text-muted">PDF electricity statement loaded ({fileSize(fileInfo.size)})</p>
                <div className="mt-4 flex justify-center">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#2A2A2A]"
                  >
                    View document in browser tab
                  </a>
                </div>
              </div>
            ) : null}
          </Panel>
        </div>

        {/* Right Column: Extraction Review & Data Sufficiency */}
        <div className="space-y-5">
          <Panel
            title="Extraction review"
            subtitle="Verify, edit, or enter values from the bill"
            actions={
              isConfirmed ? (
                <Badge tone="ok">Values confirmed</Badge>
              ) : (
                <Badge tone="outline">Pending confirmation</Badge>
              )
            }
          >
            {/* Extraction Notes & Ambiguity Warnings */}
            {ocrWarnings && ocrWarnings.filter((w) => !w.includes('Reading mismatch')).length > 0 ? (
              <Notice tone="warn" title="Extraction Notes & Warnings" className="mb-4">
                <ul className="list-disc pl-4 space-y-1 text-xs">
                  {ocrWarnings
                    .filter((w) => !w.includes('Reading mismatch'))
                    .map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                </ul>
              </Notice>
            ) : null}

            {/* Reading Discrepancy Warning Notice */}
            {discrepancy?.hasDiscrepancy ? (
              <Notice tone="warn" title="Meter Reading Discrepancy" className="mb-4">
                <p className="text-xs">{discrepancy.warning}</p>
              </Notice>
            ) : null}

            <div className="mb-4 rounded border border-line bg-surface p-3 text-xs text-ink">
              {isDemo ? (
                <>
                  <p className="font-medium text-ink flex items-center gap-1.5">
                    <DemoBadge>Demonstration Bill</DemoBadge> Pre-populated sample values:
                  </p>
                  <p className="mt-0.5 text-muted">
                    Values below are demonstration data for a standard Telangana domestic connection (LT-1B).
                    They were not generated by OCR. You can edit any field directly.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Verification instructions:</p>
                  <p className="mt-0.5 text-muted">
                    Unrecognized fields are marked &ldquo;Not extracted&rdquo;. Review any auto-populated values against
                    your bill preview and make manual corrections if needed.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-3.5">
              <Field
                label="Consumer / USCNO Reference"
                hint="Service number on the bill (e.g. 7-10 digits in Telangana)"
                htmlFor="f-uscno"
              >
                <div className="relative">
                  <input
                    id="f-uscno"
                    value={fields.consumerNumber}
                    onChange={(e) => handleFieldChange('consumerNumber', e.target.value)}
                    placeholder="e.g. 100458921 (USCNO in Telangana)"
                    className={inputClass}
                  />
                  {!fields.consumerNumber ? (
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                      <Badge tone="grey">Not extracted</Badge>
                    </span>
                  ) : null}
                </div>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Billing period" hint="e.g. July 2026 or date range" htmlFor="f-period">
                  <div className="relative">
                    <input
                      id="f-period"
                      value={fields.billingPeriod}
                      onChange={(e) => handleFieldChange('billingPeriod', e.target.value)}
                      placeholder="e.g. July 2026"
                      className={inputClass}
                    />
                    {!fields.billingPeriod ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <Badge tone="grey">Not extracted</Badge>
                      </span>
                    ) : null}
                  </div>
                </Field>

                <Field label="Bill date" hint="Date of bill issuance" htmlFor="f-date">
                  <div className="relative">
                    <input
                      id="f-date"
                      value={fields.billDate}
                      onChange={(e) => handleFieldChange('billDate', e.target.value)}
                      placeholder="e.g. 02/08/2026"
                      className={inputClass}
                    />
                    {!fields.billDate ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <Badge tone="grey">Not extracted</Badge>
                      </span>
                    ) : null}
                  </div>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Billing days" hint="Days in cycle (e.g. 30 or 31)" htmlFor="f-days">
                  <div className="relative">
                    <input
                      id="f-days"
                      type="number"
                      value={fields.billingDays}
                      onChange={(e) => handleFieldChange('billingDays', e.target.value)}
                      placeholder="e.g. 30"
                      className={inputClass}
                    />
                    {!fields.billingDays ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <Badge tone="grey">Not extracted</Badge>
                      </span>
                    ) : null}
                  </div>
                </Field>

                <Field label="Utility / DISCOM" hint="Distribution company" htmlFor="f-discom">
                  <div className="relative">
                    <input
                      id="f-discom"
                      value={fields.discom}
                      onChange={(e) => handleFieldChange('discom', e.target.value)}
                      placeholder="e.g. TSSPDCL"
                      className={inputClass}
                    />
                    {!fields.discom ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <Badge tone="grey">Not extracted</Badge>
                      </span>
                    ) : null}
                  </div>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Previous meter reading" hint="kWh index" htmlFor="f-prev">
                  <div className="relative">
                    <input
                      id="f-prev"
                      type="text"
                      inputMode="numeric"
                      value={fields.previousReading}
                      onChange={(e) => handleFieldChange('previousReading', e.target.value)}
                      placeholder="e.g. 14280 or 8,450"
                      className={inputClass}
                    />
                    {!fields.previousReading ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <Badge tone="grey">Not extracted</Badge>
                      </span>
                    ) : null}
                  </div>
                </Field>

                <Field label="Current meter reading" hint="kWh index" htmlFor="f-curr">
                  <div className="relative">
                    <input
                      id="f-curr"
                      type="text"
                      inputMode="numeric"
                      value={fields.currentReading}
                      onChange={(e) => handleFieldChange('currentReading', e.target.value)}
                      placeholder="e.g. 14525 or 8,720"
                      className={inputClass}
                    />
                    {!fields.currentReading ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <Badge tone="grey">Not extracted</Badge>
                      </span>
                    ) : null}
                  </div>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Units consumed (kWh)" hint="Total units in bill" htmlFor="f-units">
                  <div className="relative">
                    <input
                      id="f-units"
                      type="text"
                      inputMode="numeric"
                      value={fields.unitsConsumed}
                      onChange={(e) => handleFieldChange('unitsConsumed', e.target.value)}
                      placeholder="e.g. 245 or 270"
                      className={inputClass}
                    />
                    {!fields.unitsConsumed ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <Badge tone="grey">Not extracted</Badge>
                      </span>
                    ) : null}
                  </div>
                </Field>

                <Field label="Amount payable (₹)" hint="Total bill amount" htmlFor="f-amount">
                  <div className="relative">
                    <input
                      id="f-amount"
                      type="text"
                      inputMode="decimal"
                      value={fields.amountPayable}
                      onChange={(e) => handleFieldChange('amountPayable', e.target.value)}
                      placeholder="e.g. 1725 or 1,842.00"
                      className={inputClass}
                    />
                    {!fields.amountPayable ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <Badge tone="grey">Not extracted</Badge>
                      </span>
                    ) : null}
                  </div>
                </Field>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-xs text-muted">
                {isConfirmed ? 'Values confirmed for this bill.' : 'Review entries and click confirm.'}
              </p>
              <div className="flex gap-2">
                {isConfirmed ? (
                  <Button size="sm" variant="secondary" onClick={() => setIsConfirmed(false)}>
                    Edit values
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon="check"
                    onClick={() => setIsConfirmed(true)}
                    disabled={!hasFileOrDemo}
                  >
                    Confirm bill values
                  </Button>
                )}
              </div>
            </div>
          </Panel>

          {/* Data Sufficiency Assessment Panel */}
          {isConfirmed ? (
            <Panel
              title="Data sufficiency assessment"
              subtitle="Evaluation for machine learning model readiness"
              actions={<Badge tone={sufficiency.tone}>{sufficiency.status}</Badge>}
            >
              <Notice tone="warn" title={sufficiency.headline} className="mb-4">
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs">
                  {sufficiency.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </Notice>

              <div className="rounded border border-line bg-white p-4">
                <h3 className="text-sm font-semibold text-ink">Strict Model Architecture Constraint</h3>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  {sufficiency.recommendation}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 pt-3 border-t border-line">
                  <Button to="/app/screening" variant="secondary" icon="arrowRight" size="sm">
                    Go to CSV Screening (13 model features)
                  </Button>
                  <Button to="/app/comparison" variant="ghost" size="sm">
                    View Consumption Comparison
                  </Button>
                </div>
              </div>
            </Panel>
          ) : null}

          {/* Database Persistence & Follow-Up Panel */}
          {isConfirmed ? (
            <Panel
              title="Database persistence & follow-up"
              subtitle="Store verified meter extraction metadata in PostgreSQL"
            >
              <div className="space-y-4">
                <div className="rounded border border-line bg-pale/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Persist Bill Extraction Record</p>
                      <p className="text-xs text-muted">
                        {persistStatus === 'saved'
                          ? `Extraction saved to database (ID: ${savedExtractionId.slice(0, 8)}...).`
                          : 'Save this confirmed bill reading and discrepancy check to the database.'}
                      </p>
                    </div>
                    {persistStatus === 'saved' ? (
                      <Badge tone="ok">Record Saved</Badge>
                    ) : persistStatus === 'saving' ? (
                      <Spinner label="Saving extraction..." />
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon="upload"
                        onClick={handleSaveExtraction}
                        disabled={!fields.consumerNumber}
                      >
                        Save to database
                      </Button>
                    )}
                  </div>
                  {persistStatus === 'error' ? (
                    <Notice tone="danger" title="Save Error" className="mt-3">
                      <p>{persistError}</p>
                      <div className="mt-2">
                        <Button size="sm" onClick={handleSaveExtraction}>
                          Retry save
                        </Button>
                      </div>
                    </Notice>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-white p-4">
                  <div>
                    <p className="text-sm font-semibold">Investigation Follow-Up</p>
                    <p className="text-xs text-muted">
                      {discrepancy?.hasDiscrepancy
                        ? 'Reading discrepancy detected between billed units and meter difference.'
                        : 'Open an inspection ticket for this consumer if on-site review is needed.'}
                    </p>
                  </div>
                  {invAdded ? (
                    <div className="flex items-center gap-2">
                      <Badge tone="ok">Ticket {invTicket || 'Opened'}</Badge>
                      <Link to="/app/investigations" className="text-xs underline underline-offset-2">
                        View queue
                      </Link>
                    </div>
                  ) : invAdding ? (
                    <Spinner label="Opening ticket..." />
                  ) : (
                    <Button
                      size="sm"
                      icon="plus"
                      onClick={handleAddToInvestigation}
                      disabled={!fields.consumerNumber}
                    >
                      Add to investigation
                    </Button>
                  )}
                </div>
                {invError ? (
                  <Notice tone="warn" title="Investigation Notice">
                    {invError}
                  </Notice>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {/* Recent Bill Extractions Table */}
      <Panel
        className="mt-5"
        title="Recent bill extractions"
        subtitle="Extractions stored in PostgreSQL"
        actions={
          <Button size="sm" onClick={fetchRecentExtractions} disabled={loadingRecent}>
            {loadingRecent ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      >
        {loadingRecent && recentExtractions.length === 0 ? (
          <Spinner label="Loading recent extractions..." />
        ) : recentExtractions.length === 0 ? (
          <p className="text-sm text-muted">
            No bill extractions persisted in the database yet. Confirm bill values and choose "Save to database" to store records.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Consumer Number</th>
                  <th scope="col" className="px-3 py-2 font-medium">DISCOM</th>
                  <th scope="col" className="px-3 py-2 font-medium">Bill Date</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Units Billed</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Amount (₹)</th>
                  <th scope="col" className="px-3 py-2 font-medium">Discrepancy</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {recentExtractions.map((ext) => (
                  <tr key={ext.id} className="border-b border-line last:border-0 hover:bg-mist/30">
                    <td className="px-3 py-2.5 font-medium">{ext.consumer_number}</td>
                    <td className="px-3 py-2.5 text-xs text-muted">{ext.discom || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{ext.bill_date || ext.raw_bill_date || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {ext.units_consumed != null ? ext.units_consumed : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {ext.amount_payable != null ? ext.amount_payable : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {ext.has_discrepancy ? (
                        <Badge tone="danger">Flagged</Badge>
                      ) : (
                        <Badge tone="ok">Consistent</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted">
                      {new Date(ext.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
