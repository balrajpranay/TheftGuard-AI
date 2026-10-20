import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Tesseract from 'tesseract.js'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Badge,
  Button,
  DemoBadge,
  EmptyState,
  Field,
  inputClass,
  Notice,
  PageHeader,
  Panel,
  Spinner,
} from '../components/ui'
import Icon from '../components/Icon'
import { inr, kwh, num, pct, fileSize } from '../lib/format'
import { validateBillFile } from '../lib/billValidation'
import { cleanOcrText, parseBillText } from '../lib/billParser'
import {
  buildAssistantBillContext,
  calculateBillComparison,
  checkConsumerMatch,
  cleanNumber,
  createInitialSlotState,
  DEMO_CURRENT_BILL,
  DEMO_PREVIOUS_BILL,
  INITIAL_DUAL_BILL_FIELDS,
} from '../lib/billComparison'
import {
  INITIAL_QUESTIONNAIRE_ANSWERS,
  calculateApplianceEstimates,
  synthesizeAnalysis,
} from '../lib/householdQuestionnaire'
import { useAppState } from '../state/AppState'

const GOLD = '#F4C430'
const INK = '#0F0F0F'
const MIST = '#E6E8EC'
const AXIS = { fontSize: 12, fill: '#565B63' }

export default function BillComparison() {
  const {
    addInvestigation,
    dbConnected,
    assistantOpen,
    setAssistantOpen,
    billSlots,
    setBillSlots,
    setActiveBillContext,
    questionnaireAnswers: appQuestionnaireAnswers,
    setQuestionnaireAnswers: setAppQuestionnaireAnswers,
  } = useAppState()

  const prevSlot = billSlots?.prev || createInitialSlotState()
  const currSlot = billSlots?.curr || createInitialSlotState()

  const setPrevSlot = (updater) => {
    setBillSlots((prev) => ({
      ...prev,
      prev: typeof updater === 'function' ? updater(prev.prev) : updater,
    }))
  }

  const setCurrSlot = (updater) => {
    setBillSlots((prev) => ({
      ...prev,
      curr: typeof updater === 'function' ? updater(prev.curr) : updater,
    }))
  }

  const [confirmUnmatchedConsumer, setConfirmUnmatchedConsumer] = useState(false)
  const [invAdding, setInvAdding] = useState(false)
  const [invTicket, setInvTicket] = useState('')
  const [invError, setInvError] = useState('')
  const [invNotice, setInvNotice] = useState('')

  const questionnaireAnswers = appQuestionnaireAnswers || {
    ...INITIAL_QUESTIONNAIRE_ANSWERS,
    has_ac: 'yes',
    ac_count: 1,
    ac_hours: 6,
    ac_increased: 'summer',
  }
  const setQuestionnaireAnswers = setAppQuestionnaireAnswers

  const prevInputRef = useRef(null)
  const currInputRef = useRef(null)

  // Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (prevSlot.previewUrl) URL.revokeObjectURL(prevSlot.previewUrl)
      if (currSlot.previewUrl) URL.revokeObjectURL(currSlot.previewUrl)
    }
  }, [prevSlot.previewUrl, currSlot.previewUrl])

  // Reset consumer acknowledgement when consumer numbers change
  useEffect(() => {
    setConfirmUnmatchedConsumer(false)
    setInvTicket('')
    setInvError('')
    setInvNotice('')
  }, [prevSlot.fields.consumerNumber, currSlot.fields.consumerNumber])

  // Load demo bills
  function handleLoadDemo() {
    if (prevSlot.previewUrl) URL.revokeObjectURL(prevSlot.previewUrl)
    if (currSlot.previewUrl) URL.revokeObjectURL(currSlot.previewUrl)

    setBillSlots({
      prev: {
        ...createInitialSlotState(DEMO_PREVIOUS_BILL),
        isDemo: true,
        source: 'demo',
        fileInfo: {
          name: 'tsspdcl_hyderabad_domestic_sample_bill_june.pdf',
          size: 320 * 1024,
          isPdf: true,
          isImage: false,
        },
      },
      curr: {
        ...createInitialSlotState(DEMO_CURRENT_BILL),
        isDemo: true,
        source: 'demo',
        fileInfo: {
          name: 'tsspdcl_hyderabad_domestic_sample_bill_july.pdf',
          size: 340 * 1024,
          isPdf: true,
          isImage: false,
        },
      },
    })

    setConfirmUnmatchedConsumer(false)
    setInvTicket('')
    setInvError('')
    setInvNotice('')
  }

  // Clear both slots
  function handleClearBoth() {
    if (prevSlot.previewUrl) URL.revokeObjectURL(prevSlot.previewUrl)
    if (currSlot.previewUrl) URL.revokeObjectURL(currSlot.previewUrl)

    setBillSlots({
      prev: createInitialSlotState(),
      curr: createInitialSlotState(),
    })
    setConfirmUnmatchedConsumer(false)
    setInvTicket('')
    setInvError('')
    setInvNotice('')
    setActiveBillContext?.(null)

    if (prevInputRef.current) prevInputRef.current.value = ''
    if (currInputRef.current) currInputRef.current.value = ''
  }

  // Clear an individual slot
  function handleClearSlot(targetSlot) {
    const isPrev = targetSlot === 'previous'
    const slot = isPrev ? prevSlot : currSlot
    const inputRef = isPrev ? prevInputRef : currInputRef

    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl)
    if (inputRef.current) inputRef.current.value = ''

    const setSlot = isPrev ? setPrevSlot : setCurrSlot
    setSlot(createInitialSlotState())

    setConfirmUnmatchedConsumer(false)
    setInvTicket('')
    setInvError('')
    setInvNotice('')
  }

  // Handle file selection and local OCR
  async function handleFileSelect(file, targetSlot) {
    if (!file) return

    const isPrev = targetSlot === 'previous'
    const setSlot = isPrev ? setPrevSlot : setCurrSlot
    const inputRef = isPrev ? prevInputRef : currInputRef

    const validation = validateBillFile(file)
    if (!validation.ok) {
      setSlot((s) => ({
        ...s,
        ocrStage: 'error',
        ocrMessage: validation.error,
      }))
      return
    }

    const preview = URL.createObjectURL(file)

    setSlot((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl)
      return {
        ...s,
        file,
        fileInfo: validation.fileInfo,
        previewUrl: preview,
        isDemo: false,
        source: 'manual',
        ocrStage: 'idle',
        ocrMessage: '',
        ocrWarnings: [],
        pdfNotice: '',
      }
    })

    if (validation.fileInfo.isPdf) {
      setSlot((s) => ({
        ...s,
        pdfNotice:
          'PDF OCR is not supported in the browser. Please review your PDF document and verify or enter the values manually below.',
      }))
      return
    }

    // Run Tesseract OCR for JPG/PNG
    setSlot((s) => ({
      ...s,
      ocrStage: 'processing',
      ocrProgress: { status: 'Initializing Tesseract OCR engine...', percent: 10 },
      ocrMessage: '',
      ocrWarnings: [],
    }))

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setSlot((s) => ({
              ...s,
              ocrProgress: {
                status: 'Recognizing text...',
                percent: Math.min(99, Math.max(15, Math.round(m.progress * 100))),
              },
            }))
          } else if (m.status) {
            setSlot((s) => ({
              ...s,
              ocrProgress: {
                status: `${m.status}...`,
                percent: Math.min(50, Math.max(10, Math.round((m.progress || 0) * 100))),
              },
            }))
          }
        },
      })

      const rawText = cleanOcrText(result?.data?.text || '')
      const parsed = parseBillText(rawText)

      setSlot((s) => {
        const mergedFields = { ...s.fields }
        for (const [k, v] of Object.entries(parsed.fields || {})) {
          if (v !== '' && v != null) {
            mergedFields[k] = v
          }
        }

        return {
          ...s,
          source: 'ocr',
          ocrStage: 'done',
          ocrMessage:
            parsed.extractedCount > 0
              ? `Extracted ${parsed.extractedCount} field(s) via browser OCR. Review and correct if needed.`
              : 'OCR scan completed, but text was not clearly recognized. Please verify or enter values manually.',
          ocrWarnings: parsed.warnings || [],
          fields: mergedFields,
        }
      })
    } catch (err) {
      setSlot((s) => ({
        ...s,
        ocrStage: 'error',
        ocrMessage: `OCR recognition failed: ${err.message || 'Could not process image.'}. Enter fields manually below.`,
      }))
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // Handle manual field change
  function handleFieldChange(targetSlot, fieldKey, val) {
    const setSlot = targetSlot === 'previous' ? setPrevSlot : setCurrSlot
    setSlot((s) => ({
      ...s,
      source: s.source === 'demo' ? 'demo' : 'manual',
      fields: {
        ...s.fields,
        [fieldKey]: val,
      },
    }))
  }

  // Calculate comparative metrics
  const comparison = useMemo(
    () => calculateBillComparison(prevSlot.fields, currSlot.fields),
    [prevSlot.fields, currSlot.fields]
  )

  const consumerCheck = checkConsumerMatch(
    prevSlot.fields.consumerNumber,
    currSlot.fields.consumerNumber
  )

  // Gate comparison display on consumer verification
  const isConsumerApproved = consumerCheck.match || confirmUnmatchedConsumer
  const canShowResults = comparison.canCompare && isConsumerApproved

  // Add to investigation
  async function handleEscalateToInvestigation() {
    if (!comparison.canCompare || !comparison.metrics) return
    setInvAdding(true)
    setInvError('')
    setInvNotice('')

    const ref =
      prevSlot.fields.consumerNumber ||
      currSlot.fields.consumerNumber ||
      `BILL-COMP-${Date.now().toString().slice(-4)}`

    const m = comparison.metrics
    const basis = `Household Bill Comparison Review: Consumption shifted by ${m.consumptionDelta >= 0 ? '+' : ''}${m.consumptionDelta} kWh (${m.consumptionPctChange !== null ? m.consumptionPctChange + '%' : 'N/A'}), amount changed by ${inr(m.amountDelta)}.`

    const res = await addInvestigation({
      customerRef: ref,
      origin: 'bill',
      basis,
      notes: `Comparison summary: ${comparison.summary.headline}. ${comparison.summary.statements.join(' ')}`,
    })

    setInvAdding(false)
    if (res.ok) {
      setInvTicket(res.ticketCode || '')
      setInvNotice(res.notice || 'Successfully added to investigation queue.')
    } else {
      setInvError(res.message || 'Could not add to investigation queue.')
    }
  }

  // Chart data for visual comparison
  const chartData = useMemo(() => {
    if (!comparison.metrics) return []
    const m = comparison.metrics
    return [
      {
        name: 'Units (kWh)',
        previous: m.prevUnits,
        current: m.currUnits,
      },
      {
        name: 'Amount (₹/10)',
        previous: Math.round(m.prevAmount / 10),
        current: Math.round(m.currAmount / 10),
      },
    ]
  }, [comparison.metrics])

  // Context for AI Bill Assistant
  const assistantBillContext = useMemo(
    () => buildAssistantBillContext(billSlots, isConsumerApproved),
    [billSlots, isConsumerApproved]
  )

  // Sync comparison context to AppState for the AI assistant
  useEffect(() => {
    setActiveBillContext?.(assistantBillContext)
  }, [assistantBillContext, setActiveBillContext])

  // Synthesized appliance analysis
  const usageSynthesis = useMemo(() => {
    if (!comparison.metrics) return null
    const m = comparison.metrics
    return synthesizeAnalysis(
      {
        previousUnits: m.prevUnits,
        currentUnits: m.currUnits,
        billingDays: m.currDays || 30,
        amountDifference: m.amountDelta,
      },
      questionnaireAnswers
    )
  }, [comparison.metrics, questionnaireAnswers])

  return (
    <>
      <PageHeader
        title="Household Bill Comparison"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setAssistantOpen(true)} icon="model" variant="primary">
              Ask AI Assistant
            </Button>
            <Button onClick={handleLoadDemo} icon="file">
              Load Telangana sample bills (Demo)
            </Button>
            <Button variant="ghost" onClick={handleClearBoth}>
              Clear both
            </Button>
            <Button to="/app/bill-upload" variant="secondary" icon="arrowRight" size="sm">
              Single bill audit
            </Button>
          </div>
        }
      >
        Compare two consecutive electricity bills side-by-side. Inspect changes in billed consumption (kWh),
        billing-period duration, daily consumption rates (kWh/day), and total bill amounts (₹).
      </PageHeader>

      {/* Privacy Notice Banner */}
      <Notice tone="info" title="Local Processing & Privacy Guarantee" className="mb-5">
        Bill images are processed 100% locally in your browser via Tesseract.js. No personal bill images, account
        numbers, or consumer data are transmitted to external OCR servers.
      </Notice>

      {/* Two-Column Bill Input Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Previous Bill */}
        <BillSlotCard
          roleTitle="Previous Bill (Reference Month)"
          slotKey="previous"
          slotState={prevSlot}
          inputRef={prevInputRef}
          onFileSelect={(f) => handleFileSelect(f, 'previous')}
          onFieldChange={(k, v) => handleFieldChange('previous', k, v)}
          onClear={() => handleClearSlot('previous')}
        />

        {/* Right Column: Current Bill */}
        <BillSlotCard
          roleTitle="Current Bill (Comparison Month)"
          slotKey="current"
          slotState={currSlot}
          inputRef={currInputRef}
          onFileSelect={(f) => handleFileSelect(f, 'current')}
          onFieldChange={(k, v) => handleFieldChange('current', k, v)}
          onClear={() => handleClearSlot('current')}
        />
      </div>

      {/* Consumer Number Verification Banner */}
      <div className="mt-6">
        {consumerCheck.status === 'match' ? (
          <Notice tone="ok" title="Verified Same Consumer Identifier">
            Both bills reference consumer number <strong>{prevSlot.fields.consumerNumber}</strong>. Comparison will
            reflect the same service connection.
          </Notice>
        ) : consumerCheck.status === 'mismatch' ? (
          <Notice tone="warn" title="Consumer Identifier Mismatch">
            <p className="text-xs">{consumerCheck.warning}</p>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={confirmUnmatchedConsumer}
                onChange={(e) => setConfirmUnmatchedConsumer(e.target.checked)}
                className="h-4 w-4 rounded border-line text-gold focus:ring-gold"
              />
              I confirm I want to compare these two bills despite differing consumer numbers.
            </label>
          </Notice>
        ) : (
          <Notice tone="warn" title="Consumer Identifier Unconfirmed">
            <p className="text-xs">{consumerCheck.warning}</p>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={confirmUnmatchedConsumer}
                onChange={(e) => setConfirmUnmatchedConsumer(e.target.checked)}
                className="h-4 w-4 rounded border-line text-gold focus:ring-gold"
              />
              I confirm both bills belong to the same household connection.
            </label>
          </Notice>
        )}
      </div>

      {/* Validation Errors Notice */}
      {!comparison.canCompare && (prevSlot.fields.unitsConsumed || currSlot.fields.unitsConsumed) ? (
        <Notice tone="danger" title="Comparison Prerequisites Missing" className="mt-4">
          <ul className="list-disc pl-4 space-y-1 text-xs">
            {comparison.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {/* Comparison Results Section */}
      {canShowResults ? (
        <div className="mt-6 space-y-6">
          <Panel
            title="Comparison Analysis"
            subtitle={`${prevSlot.fields.billingPeriod || 'Previous period'} vs ${
              currSlot.fields.billingPeriod || 'Current period'
            }`}
            actions={
              <Badge tone={comparison.metrics.consumptionDelta > 0 ? 'gold' : 'ok'}>
                {comparison.summary.headline}
              </Badge>
            }
          >
            {/* Hero Metric Cards */}
            <div className="grid grid-cols-2 divide-line rounded border border-line bg-white md:grid-cols-4 md:divide-x">
              {/* Card 1: Total Consumption */}
              <div className="p-3 sm:p-4">
                <p className="text-xs font-medium text-muted">Billed Consumption</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                  <span className="font-display text-xl sm:text-2xl font-bold text-ink">
                    {kwh(comparison.metrics.currUnits)}
                  </span>
                  <Badge tone={comparison.metrics.consumptionDelta > 0 ? 'gold' : 'ok'}>
                    {pct(comparison.metrics.consumptionPctChange, 1)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Prev: {kwh(comparison.metrics.prevUnits)} ({comparison.metrics.consumptionDelta >= 0 ? '+' : ''}
                  {comparison.metrics.consumptionDelta} kWh)
                </p>
              </div>

              {/* Card 2: Average Daily Rate */}
              <div className="p-3 sm:p-4 border-t border-line md:border-t-0">
                <p className="text-xs font-medium text-muted">Daily Consumption Rate</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                  <span className="font-display text-xl sm:text-2xl font-bold text-ink">
                    {comparison.metrics.currDaily !== null ? `${comparison.metrics.currDaily} kWh/d` : '—'}
                  </span>
                  {comparison.metrics.dailyPctChange !== null ? (
                    <Badge tone={comparison.metrics.dailyDelta > 0 ? 'gold' : 'ok'}>
                      {pct(comparison.metrics.dailyPctChange, 1)}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {comparison.metrics.prevDaily !== null
                    ? `Prev: ${comparison.metrics.prevDaily} kWh/d (${comparison.metrics.dailyDelta >= 0 ? '+' : ''}${
                        comparison.metrics.dailyDelta
                      })`
                    : 'Billing days missing'}
                </p>
              </div>

              {/* Card 3: Bill Amount */}
              <div className="p-3 sm:p-4 border-t border-line md:border-t-0">
                <p className="text-xs font-medium text-muted">Total Billed Amount</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                  <span className="font-display text-xl sm:text-2xl font-bold text-ink">
                    {inr(comparison.metrics.currAmount)}
                  </span>
                  <Badge tone={comparison.metrics.amountDelta > 0 ? 'gold' : 'ok'}>
                    {pct(comparison.metrics.amountPctChange, 1)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Prev: {inr(comparison.metrics.prevAmount)} ({comparison.metrics.amountDelta >= 0 ? '+' : ''}
                  {inr(comparison.metrics.amountDelta)})
                </p>
              </div>

              {/* Card 4: Effective Rate */}
              <div className="p-3 sm:p-4 border-t border-line md:border-t-0">
                <p className="text-xs font-medium text-muted">Effective Cost Rate</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                  <span className="font-display text-xl sm:text-2xl font-bold text-ink">
                    {comparison.metrics.currEffectiveRate !== null ? `₹${comparison.metrics.currEffectiveRate}` : '—'}
                  </span>
                  <span className="text-xs text-muted">/ kWh</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Prev:{' '}
                  {comparison.metrics.prevEffectiveRate !== null
                    ? `₹${comparison.metrics.prevEffectiveRate}/kWh`
                    : '—'}
                </p>
              </div>
            </div>

            {/* Visual Comparison Chart */}
            <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
              <div className="rounded border border-line bg-surface p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Visual Comparison (Previous vs Current)
                </h4>
                <div className="mt-3 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 15, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={MIST} />
                      <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: INK }} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={38} />
                      <Tooltip />
                      <Bar dataKey="previous" name="Previous Bill" fill={MIST} stroke={INK} />
                      <Bar dataKey="current" name="Current Bill" fill={GOLD} stroke={INK} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[11px] text-muted text-center">
                  * Note: Bill amount is scaled to ₹/10 for side-by-side visualization with units.
                </p>
              </div>

              {/* Deterministic Explanation Statements */}
              <div className="space-y-3 rounded border border-line bg-white p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Verified Findings</h4>
                <ul className="space-y-2 text-xs text-ink leading-relaxed">
                  {comparison.summary.statements.map((s, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-0.5 text-gold font-bold">&bull;</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Household Usage Analysis & Plausible Causes */}
            {usageSynthesis ? (
              <div className="mt-6 rounded border border-line bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                      Household Usage Analysis & Plausible Causes
                    </h4>
                    <p className="text-sm font-bold text-ink mt-0.5">{usageSynthesis.headline}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="gold">
                      Estimated Load: {kwh(usageSynthesis.totalEstimatedKwh)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setAssistantOpen(true)}
                      icon="model"
                    >
                      Open Assistant & Questionnaire
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-ink uppercase tracking-wider">Plausible Factors:</p>
                    <ul className="space-y-1.5 text-xs text-muted list-disc pl-4">
                      {usageSynthesis.plausibleCauses.map((cause, idx) => (
                        <li key={idx}>{cause}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-ink uppercase tracking-wider">Actionable Next Steps:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-xs text-muted">
                      {usageSynthesis.recommendedSteps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                {usageSynthesis.estimates?.length > 0 ? (
                  <div className="pt-2 border-t border-line/60">
                    <p className="text-[11px] font-semibold text-muted mb-2">Active Appliance Profiles:</p>
                    <div className="flex flex-wrap gap-2">
                      {usageSynthesis.estimates.map((est, idx) => (
                        <div key={idx} className="rounded bg-mist/40 px-2.5 py-1 text-xs border border-line flex items-center gap-1.5">
                          <span>{est.icon || '⚡'}</span>
                          <span className="font-medium text-ink">{est.appliance}:</span>
                          <span className="font-bold text-gold-deep">{kwh(est.estimatedMonthlyKwh)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Responsible Guidance & Educational Disclaimers */}
            <div className="mt-6 rounded border border-line bg-pale/50 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <Icon name="info" className="h-4 w-4 text-gold-deep" />
                Responsible Interpretation & Tariff Context
              </h4>
              <div className="mt-2 space-y-2 text-xs text-muted leading-relaxed">
                {comparison.summary.disclaimers.map((d, idx) => (
                  <p key={idx}>{d}</p>
                ))}
              </div>
            </div>

            {/* Escalation to Investigation Option */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded border border-line bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-ink">Escalate to Field Audit / Investigation</p>
                <p className="text-xs text-muted">
                  Open an audit ticket with this verified comparison summary attached to the customer queue.
                </p>
              </div>

              <div>
                {invTicket ? (
                  <div className="flex items-center gap-2">
                    <Badge tone="ok">Ticket {invTicket}</Badge>
                    <Link
                      to="/app/investigations"
                      className="text-xs font-medium text-ink underline underline-offset-2"
                    >
                      View in Investigations
                    </Link>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon="clipboard"
                    onClick={handleEscalateToInvestigation}
                    disabled={invAdding}
                  >
                    {invAdding ? 'Opening Ticket...' : 'Open Investigation Ticket'}
                  </Button>
                )}
              </div>
            </div>

            {invError ? (
              <Notice tone="danger" title="Escalation Error" className="mt-3">
                {invError}
              </Notice>
            ) : null}
            {invNotice && !invError ? (
              <Notice tone="ok" className="mt-3">
                {invNotice}
              </Notice>
            ) : null}
          </Panel>
        </div>
      ) : !canShowResults && (prevSlot.fields.unitsConsumed || currSlot.fields.unitsConsumed) ? (
        <div className="mt-6">
          <EmptyState title="Comparison Pending">
            {!isConsumerApproved
              ? 'Please confirm the consumer identifier acknowledgement banner above to proceed with the comparison.'
              : 'Please enter valid numerical values for Units Consumed and Amount Payable in both bill cards.'}
          </EmptyState>
        </div>
      ) : null}

    </>
  )
}

/**
 * Sub-component for an individual bill slot (Previous or Current)
 */
function BillSlotCard({ roleTitle, slotKey, slotState, inputRef, onFileSelect, onFieldChange, onClear }) {
  const [dragging, setDragging] = useState(false)
  const { fileInfo, previewUrl, isDemo, source, ocrStage, ocrProgress, ocrMessage, ocrWarnings, pdfNotice, fields } =
    slotState

  const isLoaded = Boolean(
    fileInfo ||
    previewUrl ||
    source !== 'empty' ||
    Object.values(fields).some((v) => v !== '')
  )

  const isUnitsMissing =
    isLoaded && ocrStage !== 'processing' && (!fields.unitsConsumed || cleanNumber(fields.unitsConsumed) === null)
  const isAmountMissing =
    isLoaded && ocrStage !== 'processing' && (!fields.amountPayable || cleanNumber(fields.amountPayable) === null)

  const sourceBadge = isDemo ? (
    <DemoBadge>Sample Bill</DemoBadge>
  ) : source === 'ocr' ? (
    <Badge tone="info">Extracted by OCR</Badge>
  ) : source === 'manual' ? (
    <Badge tone="outline">Manually Entered</Badge>
  ) : (
    <Badge tone="grey">No Bill Loaded</Badge>
  )

  const cardActions = (
    <div className="flex items-center gap-2">
      {sourceBadge}
      {isLoaded ? (
        <Button size="xs" variant="ghost" onClick={onClear} aria-label={`Clear ${roleTitle}`}>
          Remove bill
        </Button>
      ) : null}
    </div>
  )

  return (
    <Panel title={roleTitle} actions={cardActions}>
      {/* Upload Box */}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
        className="sr-only"
        id={`file-input-${slotKey}`}
        aria-label={`Upload file for ${roleTitle}`}
        onChange={(e) => onFileSelect(e.target.files?.[0])}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files?.[0]) {
            onFileSelect(e.dataTransfer.files[0])
          }
        }}
        className={`rounded border-2 border-dashed p-4 text-center transition-colors ${
          dragging ? 'border-gold bg-pale/50' : 'border-line bg-surface hover:bg-mist/30'
        }`}
      >
        <p className="text-xs font-medium text-ink">Upload bill image (JPG, PNG) or statement</p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          icon="upload"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
        <p className="mt-1 text-[11px] text-muted">Max 10 MB. In-browser OCR runs on JPG/PNG.</p>
      </div>

      {/* OCR Progress or Status */}
      {ocrStage === 'processing' ? (
        <div className="mt-3">
          <Spinner label={ocrProgress.status || 'Scanning bill image with Tesseract OCR...'} />
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-line">
            <div
              className="h-full bg-gold transition-all duration-200"
              style={{ width: `${ocrProgress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {ocrMessage ? (
        <Notice tone={ocrStage === 'error' ? 'danger' : 'info'} className="mt-3">
          <p className="text-xs">{ocrMessage}</p>
        </Notice>
      ) : null}

      {pdfNotice ? (
        <Notice tone="warn" title="PDF Notice" className="mt-3">
          <p className="text-xs">{pdfNotice}</p>
        </Notice>
      ) : null}

      {ocrWarnings && ocrWarnings.length > 0 ? (
        <Notice tone="warn" title="OCR Warnings" className="mt-3">
          <ul className="list-disc pl-4 space-y-1 text-xs">
            {ocrWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {/* Visual Preview (if loaded) */}
      {previewUrl && fileInfo?.isImage ? (
        <div className="mt-3 overflow-hidden rounded border border-line bg-mist/30 p-2 text-center">
          <img
            src={previewUrl}
            alt={`Preview of ${fileInfo.name}`}
            className="mx-auto max-h-48 rounded object-contain shadow-sm"
          />
          <p className="mt-1 text-[11px] text-muted">
            {fileInfo.name} ({fileSize(fileInfo.size)})
          </p>
        </div>
      ) : null}

      {/* Form Fields */}
      <div className="mt-4 space-y-3">
        <Field label="Consumer / USCNO Reference" hint="e.g. 7-10 digit service connection" htmlFor={`uscno-${slotKey}`}>
          <input
            id={`uscno-${slotKey}`}
            value={fields.consumerNumber}
            onChange={(e) => onFieldChange('consumerNumber', e.target.value)}
            placeholder="e.g. 100458921"
            className={inputClass}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Billing period" hint="e.g. June 2026" htmlFor={`period-${slotKey}`}>
            <input
              id={`period-${slotKey}`}
              value={fields.billingPeriod}
              onChange={(e) => onFieldChange('billingPeriod', e.target.value)}
              placeholder="e.g. June 2026"
              className={inputClass}
            />
          </Field>
          <Field label="Bill date" hint="Issuance date" htmlFor={`date-${slotKey}`}>
            <input
              id={`date-${slotKey}`}
              value={fields.billDate}
              onChange={(e) => onFieldChange('billDate', e.target.value)}
              placeholder="e.g. 02/07/2026"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Billing cycle days"
            hint="Whole days (e.g. 30)"
            htmlFor={`days-${slotKey}`}
          >
            <input
              id={`days-${slotKey}`}
              type="number"
              min="1"
              max="90"
              value={fields.billingDays}
              onChange={(e) => onFieldChange('billingDays', e.target.value)}
              placeholder="e.g. 30"
              className={inputClass}
            />
          </Field>
          <Field label="Utility / DISCOM" hint="Distribution company" htmlFor={`discom-${slotKey}`}>
            <input
              id={`discom-${slotKey}`}
              value={fields.discom}
              onChange={(e) => onFieldChange('discom', e.target.value)}
              placeholder="e.g. TSSPDCL"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Units consumed (kWh) *"
            hint={isUnitsMissing ? '⚠️ Missing in scan — enter manually' : 'Total bill units'}
            htmlFor={`units-${slotKey}`}
          >
            <input
              id={`units-${slotKey}`}
              type="text"
              inputMode="numeric"
              value={fields.unitsConsumed}
              onChange={(e) => onFieldChange('unitsConsumed', e.target.value)}
              placeholder="e.g. 220"
              className={`${inputClass} ${isUnitsMissing ? 'border-amber-500 bg-amber-50/40' : ''}`}
            />
          </Field>
          <Field
            label="Amount payable (₹) *"
            hint={isAmountMissing ? '⚠️ Missing in scan — enter manually' : 'Total bill amount'}
            htmlFor={`amount-${slotKey}`}
          >
            <input
              id={`amount-${slotKey}`}
              type="text"
              inputMode="decimal"
              value={fields.amountPayable}
              onChange={(e) => onFieldChange('amountPayable', e.target.value)}
              placeholder="e.g. 1480"
              className={`${inputClass} ${isAmountMissing ? 'border-amber-500 bg-amber-50/40' : ''}`}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Previous meter reading" hint="kWh index" htmlFor={`prev-rdg-${slotKey}`}>
            <input
              id={`prev-rdg-${slotKey}`}
              type="text"
              inputMode="numeric"
              value={fields.previousReading}
              onChange={(e) => onFieldChange('previousReading', e.target.value)}
              placeholder="e.g. 14060"
              className={inputClass}
            />
          </Field>
          <Field label="Present meter reading" hint="kWh index" htmlFor={`curr-rdg-${slotKey}`}>
            <input
              id={`curr-rdg-${slotKey}`}
              type="text"
              inputMode="numeric"
              value={fields.currentReading}
              onChange={(e) => onFieldChange('currentReading', e.target.value)}
              placeholder="e.g. 14280"
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    </Panel>
  )
}
