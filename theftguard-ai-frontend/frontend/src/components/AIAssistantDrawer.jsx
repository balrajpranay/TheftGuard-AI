import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { Badge, Button, Notice, Spinner } from './ui'
import { inr, kwh, pct } from '../lib/format'
import {
  INITIAL_QUESTIONNAIRE_ANSWERS,
  QUESTIONNAIRE_STEPS,
  calculateApplianceEstimates,
  getQuestionnaireProgress,
  synthesizeAnalysis,
} from '../lib/householdQuestionnaire'
import { chatWithAssistant, DEFAULT_SUGGESTIONS, CONTEXT_SUGGESTIONS_BILL_LOADED } from '../lib/assistantEngine'
import FormattedAssistantMessage from './FormattedAssistantMessage'
import { useLanguage } from '../context/LanguageContext.js'

export default function AIAssistantDrawer({
  open = false,
  onClose,
  billContext = null,
  initialQuestionnaireAnswers = null,
  onQuestionnaireChange,
}) {
  const { language, t } = useLanguage()
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'questionnaire' | 'breakdown'
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [answers, setAnswers] = useState(() => initialQuestionnaireAnswers || INITIAL_QUESTIONNAIRE_ANSWERS)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [providerMode, setProviderMode] = useState('local_rule_engine')

  // Synchronize incoming initialQuestionnaireAnswers if updated outside
  useEffect(() => {
    if (initialQuestionnaireAnswers) {
      setAnswers(initialQuestionnaireAnswers)
    }
  }, [initialQuestionnaireAnswers])

  // Initial welcome message
  const [messages, setMessages] = useState(() => [
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        'Hello! I am your TheftGuard AI Bill Assistant.\n\n' +
        (billContext && billContext.ocr_processing
          ? 'Your bill image is currently being scanned locally in your browser via Tesseract OCR. Once the scan finishes, your comparison will be ready to explore!'
          : billContext && billContext.prev_units != null && billContext.curr_units != null
          ? `I have loaded your comparison between ${billContext.prev_period || 'Previous Month'} (${kwh(billContext.prev_units)}) and ${billContext.curr_period || 'Current Month'} (${kwh(billContext.curr_units)}).\n\nAsk me anything about why your units changed, how your appliances contribute, or how tariff slabs work!`
          : billContext && billContext.has_bills
          ? 'I can see bill information uploaded in Bill Comparison, but some required fields (units or bill amounts) are still missing or incomplete.\n\nYou can fill in the missing numbers in the bill form, or ask me for help understanding what details are needed!'
          : 'I can help explain why electricity bills fluctuate, how much energy your appliances use, and how to verify your physical meter.'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: billContext?.ocr_processing
        ? ['What does kWh mean?', 'Could you explain me this webpage?', 'How much electricity does an AC consume in 8 hours?']
        : billContext?.is_complete
        ? CONTEXT_SUGGESTIONS_BILL_LOADED
        : DEFAULT_SUGGESTIONS,
      structured_analysis: null,
    },
  ])

  // Synchronize incoming billContext when it changes and chat only has initial welcome message
  const prevContextRef = useRef(billContext)
  useEffect(() => {
    if (messages.length === 1 && messages[0].id === 'msg-welcome') {
      const isOcrProcessing = Boolean(billContext && billContext.ocr_processing)
      const prevIsOcrProcessing = Boolean(prevContextRef.current && prevContextRef.current.ocr_processing)
      const isComplete = Boolean(billContext && billContext.is_complete && billContext.prev_units != null && billContext.curr_units != null)
      const prevIsComplete = Boolean(prevContextRef.current && prevContextRef.current.is_complete && prevContextRef.current.prev_units != null)
      const hasBills = Boolean(billContext && (billContext.has_bills || billContext.prev_units != null || billContext.curr_units != null))
      const prevHasBills = Boolean(prevContextRef.current && (prevContextRef.current.has_bills || prevContextRef.current.prev_units != null))

      if (
        isOcrProcessing !== prevIsOcrProcessing ||
        isComplete !== prevIsComplete ||
        hasBills !== prevHasBills ||
        (isComplete && (billContext.curr_units !== prevContextRef.current?.curr_units || billContext.prev_units !== prevContextRef.current?.prev_units))
      ) {
        let welcomeContent = ''
        let welcomeSuggestions = DEFAULT_SUGGESTIONS

        if (isOcrProcessing) {
          welcomeContent =
            'Hello! I am your TheftGuard AI Bill Assistant.\n\n' +
            'Your bill images are currently being scanned locally in your browser via Tesseract OCR. Once the scan finishes, your comparison will be ready to explore!\n\n' +
            'In the meantime, feel free to ask me any questions about power usage, tariffs, or appliances.'
          welcomeSuggestions = [
            'What does kWh mean?',
            'Could you explain me this webpage?',
            'How much electricity does an AC consume in 8 hours?',
          ]
        } else if (isComplete) {
          welcomeContent =
            'Hello! I am your TheftGuard AI Bill Assistant.\n\n' +
            `I have loaded your comparison between ${billContext.prev_period || 'Previous Month'} (${kwh(billContext.prev_units)}) and ${billContext.curr_period || 'Current Month'} (${kwh(billContext.curr_units)}).\n\nAsk me anything about why your units changed, how your appliances contribute, or how tariff slabs work!`
          welcomeSuggestions = CONTEXT_SUGGESTIONS_BILL_LOADED
        } else if (hasBills) {
          welcomeContent =
            'Hello! I am your TheftGuard AI Bill Assistant.\n\n' +
            'I can see bill information uploaded in Bill Comparison, but some required fields (units or bill amounts) are still missing or incomplete.\n\n' +
            'You can fill in the missing numbers in the bill form, or ask me for help understanding what details are needed!'
          welcomeSuggestions = [
            'Explain the comparison',
            'Why is my electricity bill so high this month?',
            'What does kWh mean?',
            'What should I do next?',
          ]
        } else {
          welcomeContent =
            'Hello! I am your TheftGuard AI Bill Assistant.\n\n' +
            'I can help explain why electricity bills fluctuate, how much energy your appliances use, and how to verify your physical meter.'
          welcomeSuggestions = DEFAULT_SUGGESTIONS
        }

        setMessages([
          {
            id: 'msg-welcome',
            role: 'assistant',
            content: welcomeContent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            suggestions: welcomeSuggestions,
            structured_analysis: null,
          },
        ])
      }
    }
    prevContextRef.current = billContext
  }, [billContext, messages])

  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isTyping, activeTab])

  // Focus input on open
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        if (inputRef.current) inputRef.current.focus()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [open, activeTab])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && open) {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Live calculations
  const billingDays = billContext?.curr_days || 30
  const estimates = useMemo(() => calculateApplianceEstimates(answers, billingDays), [answers, billingDays])
  const progress = useMemo(() => getQuestionnaireProgress(answers), [answers])
  const synthesized = useMemo(() => {
    if (!billContext) return null
    return synthesizeAnalysis(
      {
        previousUnits: billContext.prev_units,
        currentUnits: billContext.curr_units,
        billingDays,
        amountDifference: billContext.delta_amount,
      },
      answers
    )
  }, [billContext, answers, billingDays])

  // Update answer helper
  function handleAnswerChange(key, value) {
    const updated = { ...answers, [key]: value }
    setAnswers(updated)
    onQuestionnaireChange?.(updated)
  }

  // Send message
  async function handleSend(textToSend) {
    const userText = (textToSend || inputText).trim()
    if (!userText || isTyping) return

    setInputText('')
    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const updatedHistory = [...messages, userMsg]
    setMessages(updatedHistory)
    setIsTyping(true)

    try {
      const res = await chatWithAssistant({
        message: userText,
        billContext,
        questionnaireAnswers: answers,
        history: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
        language,
      })

      if (res.provider) setProviderMode(res.provider)

      const assistantMsg = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: res.provider,
        structured_analysis: res.structured_analysis,
        suggestions: res.suggestions && res.suggestions.length > 0 ? res.suggestions : DEFAULT_SUGGESTIONS,
        disclaimers: res.disclaimers,
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: 'I encountered an error processing your query. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: DEFAULT_SUGGESTIONS,
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  if (!open) return null

  const currentStep = QUESTIONNAIRE_STEPS[currentStepIndex] || QUESTIONNAIRE_STEPS[0]
  const isLastStep = currentStepIndex >= QUESTIONNAIRE_STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 overflow-hidden print:hidden" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
      {/* Dimmed backdrop */}
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-xs transition-opacity" onClick={onClose} aria-hidden="true" />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col border-l border-line">
          {/* Header */}
          <div className="border-b border-line bg-pale px-4 sm:px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold text-ink font-bold shadow-xs">
                  ⚡
                </span>
                <div className="min-w-0">
                  <h2 id="assistant-title" className="text-base font-bold text-ink flex items-center gap-2 truncate">
                    <span>AI Bill Assistant</span>
                    <Badge tone="info" className="text-[10px] uppercase font-semibold shrink-0">
                      {providerMode.includes('gemini') ? 'Gemini AI' : 'Local Rule Engine'}
                    </Badge>
                  </h2>
                  <p className="text-xs text-muted truncate">Friendly household electricity usage insights & guidance</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <Link
                  to="/app/chat"
                  onClick={onClose}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-gold hover:text-ink transition-colors shadow-2xs"
                  title="Open Dedicated Full-Page AI Chat Workspace"
                >
                  <Icon name="external" className="h-3.5 w-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Open Full Workspace</span>
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-muted hover:bg-mist hover:text-ink transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Close assistant"
                >
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Tab navigation */}
            <div className="mt-4 flex border-b border-line/60 gap-3 sm:gap-4 text-xs font-semibold overflow-x-auto no-scrollbar scroll-smooth">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`pb-2 transition-colors border-b-2 flex shrink-0 whitespace-nowrap items-center gap-1.5 min-h-[36px] ${
                  activeTab === 'chat'
                    ? 'border-gold text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <span>💬 Chat Assistant</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('questionnaire')}
                className={`pb-2 transition-colors border-b-2 flex shrink-0 whitespace-nowrap items-center gap-1.5 min-h-[36px] ${
                  activeTab === 'questionnaire'
                    ? 'border-gold text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <span>📋 Household Usage Profile</span>
                <span className="rounded-full bg-mist px-1.5 py-0.2 text-[10px]">
                  {progress.answered}/{progress.total}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('breakdown')}
                className={`pb-2 transition-colors border-b-2 flex shrink-0 whitespace-nowrap items-center gap-1.5 min-h-[36px] ${
                  activeTab === 'breakdown'
                    ? 'border-gold text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <span>📊 Appliance Breakdown</span>
                <span className="rounded-full bg-gold/30 px-1.5 py-0.2 text-[10px] text-ink font-bold">
                  {kwh(estimates.totalEstimatedKwh)}
                </span>
              </button>
            </div>
          </div>

          {/* Context Pill (if bill loaded) */}
          {billContext && billContext.is_complete && billContext.prev_units != null && billContext.curr_units != null ? (
            <div className="bg-mist/40 px-5 py-2 border-b border-line text-xs flex items-center justify-between text-muted">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">Active Comparison:</span>
                <span>{kwh(billContext.prev_units)} &rarr; {kwh(billContext.curr_units)}</span>
                <Badge tone={billContext.delta_units > 0 ? 'gold' : 'ok'} className="text-[10px]">
                  {billContext.delta_units >= 0 ? '+' : ''}{billContext.delta_units} kWh
                </Badge>
              </div>
              {billContext.delta_amount != null ? (
                <span className="font-medium text-ink">{inr(billContext.delta_amount)} diff</span>
              ) : null}
            </div>
          ) : billContext && billContext.has_bills && !billContext.is_complete ? (
            <div className="bg-amber-50 px-5 py-2 border-b border-amber-200 text-xs flex items-center justify-between text-amber-900">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-amber-900">⚠️ Incomplete Bill Data:</span>
                <span className="text-amber-800">
                  {billContext.missing_fields?.length > 0
                    ? `Missing: ${billContext.missing_fields.map((f) => f.replace(/^.+?:\s*/, '')).join(', ')}`
                    : 'Enter missing units/amount in Bill Comparison'}
                </span>
              </div>
              {billContext.curr_amount != null ? (
                <span className="font-medium text-amber-800">Current: {inr(billContext.curr_amount)}</span>
              ) : null}
            </div>
          ) : null}

          {/* TAB 1: Chat Assistant */}
          {activeTab === 'chat' ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFA]">
              {/* Message scroll area */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl p-3.5 text-xs leading-relaxed shadow-xs ${
                        m.role === 'user'
                          ? 'bg-ink text-white rounded-br-none'
                          : 'bg-white border border-line text-ink rounded-bl-none'
                      }`}
                    >
                      {/* Message author badge */}
                      <div className="flex items-center justify-between gap-2 mb-1 text-[10px] opacity-75">
                        <span className="font-semibold">
                          {m.role === 'user' ? 'You' : 'TheftGuard Assistant'}
                        </span>
                        <span>{m.timestamp}</span>
                      </div>

                      {/* Message Content */}
                      {m.role === 'user' ? (
                        <div className="whitespace-pre-line text-xs font-normal">
                          {m.content}
                        </div>
                      ) : (
                        <FormattedAssistantMessage content={m.content} />
                      )}

                      {/* Structured Analysis Card if attached */}
                      {m.structured_analysis ? (
                        <div className="mt-3 pt-3 border-t border-line/60 bg-pale/40 -mx-1 p-2.5 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-ink text-[11px]">
                              {m.structured_analysis.headline}
                            </span>
                            <Badge tone="gold" className="text-[9px]">
                              {kwh(m.structured_analysis.totalEstimatedKwh)} est.
                            </Badge>
                          </div>

                          {m.structured_analysis.plausibleCauses?.length > 0 ? (
                            <ul className="list-disc pl-3.5 space-y-1 text-[11px] text-muted">
                              {m.structured_analysis.plausibleCauses.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          ) : null}

                          {m.structured_analysis.recommendedSteps?.length > 0 ? (
                            <div className="mt-2 pt-2 border-t border-line/40 text-[11px]">
                              <p className="font-semibold text-ink text-[10px] uppercase">Recommended Next Steps:</p>
                              <ol className="list-decimal pl-3.5 space-y-0.5 text-muted mt-1">
                                {m.structured_analysis.recommendedSteps.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ol>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {isTyping ? (
                  <div className="flex justify-start">
                    <div className="bg-white border border-line rounded-xl rounded-bl-none p-3 shadow-xs flex items-center gap-2 text-xs text-muted">
                      <Spinner className="h-4 w-4 text-gold-deep" />
                      <span>Assistant is reviewing your query...</span>
                    </div>
                  </div>
                ) : null}

                <div ref={chatEndRef} />
              </div>

              {/* Suggestions / Prompt Chips */}
              <div className="border-t border-line/70 bg-white px-4 py-2">
                <p className="text-[10px] uppercase font-bold text-muted mb-1.5">Suggested Questions:</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {(messages[messages.length - 1]?.suggestions || DEFAULT_SUGGESTIONS).slice(0, 4).map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(s)}
                      disabled={isTyping}
                      className="rounded-full border border-line bg-mist/50 px-2.5 py-1 text-[11px] font-medium text-ink hover:border-gold hover:bg-pale transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Input Bar */}
              <div className="border-t border-line bg-white p-3 sm:p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSend()
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Ask about your bill, appliances, or meter..."
                    className="flex-1 rounded-lg border border-line px-3.5 py-2 text-xs text-ink placeholder-muted focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold"
                    maxLength={1500}
                    disabled={isTyping}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!inputText.trim() || isTyping}
                    className="shrink-0"
                  >
                    Send
                  </Button>
                </form>
                <p className="mt-2 text-[10px] text-muted text-center">
                  Private & Safe • Estimates based on BEE 3-star ratings • Does not establish electricity theft
                </p>
              </div>
            </div>
          ) : null}

          {/* TAB 2: Household Usage Questionnaire */}
          {activeTab === 'questionnaire' ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-[#FAFAFA]">
              {/* Progress bar */}
              <div className="rounded-xl border border-line bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-ink mb-1.5">
                  <span>Questionnaire Progress</span>
                  <span>{progress.percent}% Completed ({progress.answered}/{progress.total} answered)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-mist">
                  <div
                    className="h-full bg-gold transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  All questions are completely optional. Feel free to skip any question or adjust your answers anytime.
                </p>
              </div>

              {/* Progressive Question Step Card */}
              {currentStep ? (
                <div className="rounded-xl border border-line bg-white p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{currentStep.icon}</span>
                    <Badge tone="grey" className="text-[10px]">
                      Step {currentStepIndex + 1} of {QUESTIONNAIRE_STEPS.length}
                    </Badge>
                  </div>

                  <h3 className="text-sm font-bold text-ink">{currentStep.title}</h3>
                  <p className="mt-1 text-xs text-ink font-medium">{currentStep.prompt}</p>
                  <p className="mt-1 text-[11px] text-muted">{currentStep.helper}</p>

                  {/* Options */}
                  {currentStep.options ? (
                    <div className="mt-4 space-y-2">
                      {currentStep.options.map((opt) => {
                        const isSelected = answers[currentStep.id] === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              handleAnswerChange(currentStep.id, opt.value)
                              if (!isLastStep) setCurrentStepIndex((prev) => prev + 1)
                            }}
                            className={`w-full rounded-lg border p-3 text-left transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'border-gold bg-pale ring-1 ring-gold'
                                : 'border-line bg-white hover:bg-mist/40'
                            }`}
                          >
                            <div>
                              <p className="text-xs font-semibold text-ink">{opt.label}</p>
                              {opt.subtext ? (
                                <p className="text-[11px] text-muted">{opt.subtext}</p>
                              ) : null}
                            </div>
                            {isSelected ? (
                              <Icon name="check" className="h-4 w-4 text-gold-deep shrink-0" />
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  {/* Sub-fields (e.g. for AC details) */}
                  {currentStep.fields ? (
                    <div className="mt-4 space-y-3">
                      {currentStep.fields.map((field) => (
                        <div key={field.name}>
                          <label className="block text-xs font-semibold text-ink mb-1">{field.label}</label>
                          <select
                            value={answers[field.name]}
                            onChange={(e) => handleAnswerChange(field.name, e.target.value)}
                            className="w-full rounded-lg border border-line bg-white p-2 text-xs text-ink focus:border-gold focus:outline-hidden"
                          >
                            {field.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Navigation buttons */}
                  <div className="mt-6 flex items-center justify-between pt-4 border-t border-line">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
                      disabled={currentStepIndex === 0}
                    >
                      &larr; Previous
                    </Button>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          handleAnswerChange(currentStep.id, 'skip')
                          if (!isLastStep) setCurrentStepIndex((prev) => prev + 1)
                        }}
                      >
                        Skip
                      </Button>
                      {!isLastStep ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setCurrentStepIndex((prev) => prev + 1)}
                        >
                          Next &rarr;
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setActiveTab('breakdown')}
                        >
                          View Breakdown &rarr;
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Questionnaire summary snapshot */}
              <div className="rounded-xl border border-line bg-white p-4 shadow-xs">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Current Profile Answers</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-mist/30">
                    <span className="text-muted block text-[10px]">Occupants:</span>
                    <span className="font-medium text-ink">{answers.occupants || 'Not specified'}</span>
                  </div>
                  <div className="p-2 rounded bg-mist/30">
                    <span className="text-muted block text-[10px]">Air Conditioning:</span>
                    <span className="font-medium text-ink">
                      {answers.has_ac === 'yes' ? `${answers.ac_count || 1} AC (~${answers.ac_hours || 6}h/day)` : answers.has_ac || 'Not specified'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-mist/30">
                    <span className="text-muted block text-[10px]">Water Heater:</span>
                    <span className="font-medium text-ink">{answers.has_geyser || 'Not specified'}</span>
                  </div>
                  <div className="p-2 rounded bg-mist/30">
                    <span className="text-muted block text-[10px]">Water Pump:</span>
                    <span className="font-medium text-ink">{answers.has_pump || 'Not specified'}</span>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setActiveTab('chat')
                      handleSend('Explain my bill in light of my household questionnaire profile')
                    }}
                  >
                    Analyze with Assistant &rarr;
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* TAB 3: Appliance Breakdown & Synthesis */}
          {activeTab === 'breakdown' ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-[#FAFAFA]">
              {/* Total Estimated Load Hero Card */}
              <div className="rounded-xl border border-line bg-white p-5 shadow-xs">
                <p className="text-xs font-semibold text-muted">Estimated Monthly Household Load</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-ink">
                    {kwh(estimates.totalEstimatedKwh)}
                  </span>
                  <Badge tone="gold">over {estimates.billingDays} days</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Computed using standard Bureau of Energy Efficiency (BEE) 3-star consumption models.
                </p>

                {billContext && billContext.curr_units != null ? (
                  <div className="mt-4 pt-3 border-t border-line text-xs flex items-center justify-between bg-pale/50 p-2.5 rounded-lg">
                    <span>Current Billed Consumption:</span>
                    <span className="font-bold text-ink">{kwh(billContext.curr_units)}</span>
                  </div>
                ) : null}
              </div>

              {/* Itemized Appliances List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Itemized Appliance Load Estimates
                </h4>
                {estimates.estimates.length === 0 ? (
                  <p className="text-xs text-muted">No appliances reported yet. Answer the questionnaire to generate an itemized breakdown.</p>
                ) : (
                  estimates.estimates.map((item, idx) => (
                    <div key={idx} className="rounded-xl border border-line bg-white p-3.5 shadow-xs flex items-start gap-3">
                      <span className="text-2xl mt-0.5">{item.icon || '⚡'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-ink truncate">{item.appliance}</h5>
                          <span className="font-bold text-xs text-ink">{kwh(item.estimatedMonthlyKwh)}</span>
                        </div>
                        <p className="text-[11px] text-muted mt-0.5">{item.assumptions}</p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                          <span>Rated: ~{item.wattageWatts}W</span>
                          <span>•</span>
                          <span>Daily: ~{item.dailyHours} hrs</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Synthesis findings if bill loaded */}
              {synthesized ? (
                <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                      Synthesis with Bill Differences
                    </h4>
                    <Badge tone="gold">{synthesized.outcome.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="text-xs font-semibold text-ink">{synthesized.headline}</p>

                  <ul className="space-y-1.5 text-xs text-muted list-disc pl-4">
                    {synthesized.plausibleCauses.map((cause, idx) => (
                      <li key={idx}>{cause}</li>
                    ))}
                  </ul>

                  <div className="pt-3 border-t border-line">
                    <p className="text-xs font-bold uppercase text-ink">Actionable Advice:</p>
                    <ol className="list-decimal pl-4 mt-1 space-y-1 text-xs text-muted">
                      {synthesized.recommendedSteps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : null}

              {/* Safety Disclaimers */}
              <Notice tone="info" title="Neutral Interpretation Notice">
                Estimates are based on standard Indian appliance duty cycles. Normal household variance, weather conditions, extra guests, or tariff slab progression does not establish electricity theft or meter tampering.
              </Notice>

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('questionnaire')}
                >
                  Edit Answers
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setActiveTab('chat')
                    handleSend('Explain how these appliance estimates relate to my bill')
                  }}
                >
                  Discuss in Chat &rarr;
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
