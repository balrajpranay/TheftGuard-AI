import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { buildDemoCustomers } from '../data/demoCustomers'
import { buildDemoConsumption, DEMO_SPLIT_DATE } from '../data/demoConsumption'
import { DEFAULT_THRESHOLDS } from '../lib/risk'
import {
  createInvestigation as apiCreateInvestigation,
  deleteInvestigation as apiDeleteInvestigation,
  getBatch as apiGetBatch,
  getBatchWithAllRecords as apiGetBatchWithAllRecords,
  listInvestigations as apiListInvestigations,
  updateInvestigation as apiUpdateInvestigation,
  DbApiError,
} from '../lib/dbApi'
import { createInitialSlotState, buildAssistantBillContext } from '../lib/billComparison'
import { useAuth } from '../context/AuthContext.js'

const DEMO_CUSTOMERS = buildDemoCustomers()
const DEFAULT_CHECKLIST = [
  'Confirm the customer and meter identity',
  'Compare the meter reading with the billing record',
  'Check the meter seal and enclosure',
  'Review the connected load against the sanctioned load',
  'Record photographs and field notes',
]

function normalizeInvestigation(inv) {
  const checklist =
    Array.isArray(inv.checklist) && inv.checklist.length > 0
      ? inv.checklist
      : DEFAULT_CHECKLIST.map((label) => ({ label, done: false }))

  return {
    id: String(inv.id),
    ticketCode: inv.ticket_code || inv.ticketCode || inv.id,
    ticket_code: inv.ticket_code || inv.ticketCode || inv.id,
    customerRef: inv.customer_ref || inv.customerRef,
    customer_ref: inv.customer_ref || inv.customerRef,
    origin: inv.origin || 'screening',
    basis: inv.basis || '',
    status: inv.status || 'New',
    priority: inv.priority || 'Normal',
    assignee: inv.assignee || '',
    notes: inv.notes || '',
    outcome: inv.outcome || '',
    evidence: Array.isArray(inv.evidence) ? inv.evidence : [],
    checklist,
    screeningRecordId: inv.screening_record_id || inv.screeningRecordId || null,
    screening_record_id: inv.screening_record_id || inv.screeningRecordId || null,
    batchId: inv.batch_id || inv.batchId || null,
    batch_id: inv.batch_id || inv.batchId || null,
    createdAt: inv.created_at || inv.createdAt || null,
    isPersisted: Boolean(inv.created_at || inv.isPersisted),
  }
}

const Ctx = createContext(null)

export function AppStateProvider({ children }) {
  const { isAuthenticated, isDemoMode } = useAuth()

  // Results source: demonstration rows, or rows from an uploaded file (previewed or ML-scored).
  const [uploaded, setUploaded] = useState(null)
  const [source, setSource] = useState(() => (isDemoMode ? 'demo' : 'empty'))
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [tariff, setTariff] = useState(7)
  const [comparison, setComparison] = useState(() => {
    if (isDemoMode) {
      return {
        rows: buildDemoConsumption(),
        label: 'Demonstration data (synthetic)',
        isDemo: true,
        splitDate: DEMO_SPLIT_DATE,
        dropThreshold: 30,
      }
    }
    return {
      rows: [],
      label: 'No consumption data loaded',
      isDemo: false,
      splitDate: null,
      dropThreshold: 30,
    }
  })
  const [investigations, setInvestigations] = useState([])
  const [dbConnected, setDbConnected] = useState(false)
  const [dbError, setDbError] = useState(null)

  // Ensure workspace state is cleanly isolated between real authenticated user and demo workspace
  useEffect(() => {
    if (isAuthenticated && !isDemoMode) {
      // Transitioning to real authenticated workspace: purge any residual demo state
      setSource((prev) => (prev === 'demo' ? 'empty' : prev))
      setComparison((prev) => {
        if (prev.isDemo) {
          return {
            rows: [],
            label: 'No consumption data loaded',
            isDemo: false,
            splitDate: null,
            dropThreshold: 30,
          }
        }
        return prev
      })
    } else if (isDemoMode) {
      // Explicitly entering demo mode: populate synthetic demo data if empty
      setSource((prev) => (prev === 'empty' ? 'demo' : prev))
      setComparison((prev) => {
        if (!prev.rows.length && !prev.isDemo) {
          return {
            rows: buildDemoConsumption(),
            label: 'Demonstration data (synthetic)',
            isDemo: true,
            splitDate: DEMO_SPLIT_DATE,
            dropThreshold: 30,
          }
        }
        return prev
      })
    }
  }, [isAuthenticated, isDemoMode])

  // Household Bill Comparison & Assistant Context
  const [billSlots, setBillSlots] = useState(() => ({
    prev: createInitialSlotState(),
    curr: createInitialSlotState(),
  }))
  const [manualBillContext, setManualBillContext] = useState(undefined)
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState(null)
  const [assistantOpen, setAssistantOpen] = useState(false)

  // Derived automatically from billSlots so context is never stale across routes or renders
  const derivedBillContext = useMemo(() => {
    return buildAssistantBillContext(billSlots)
  }, [billSlots])

  // activeBillContext uses manualBillContext if explicitly set, otherwise derivedBillContext
  const activeBillContext = manualBillContext !== undefined ? manualBillContext : derivedBillContext
  const setActiveBillContext = useCallback((val) => {
    setManualBillContext(val)
  }, [])

  // Customers are derived strictly from uploaded records or explicit demo mode.
  // Real authenticated workspaces NEVER inject DEMO_CUSTOMERS.
  const customers = useMemo(() => {
    if (source === 'uploaded' && uploaded?.customers) {
      return uploaded.customers
    }
    if (isDemoMode) {
      return DEMO_CUSTOMERS
    }
    return []
  }, [source, uploaded, isDemoMode])

  const hasScores = source === 'uploaded' && Boolean(uploaded?.hasScores)

  const loadUploaded = useCallback((fileName, rows) => {
    setUploaded({ fileName, customers: rows, hasScores: false })
    setSource('uploaded')
  }, [])

  const loadScreened = useCallback((fileName, rows, metadata = {}) => {
    setUploaded({ fileName, customers: rows, hasScores: true, metadata })
    setSource('uploaded')
  }, [])

  const loadDemo = useCallback(() => {
    if (isAuthenticated && !isDemoMode) {
      // Real authenticated user cannot switch workspace to fake demo screening
      return
    }
    setSource('demo')
  }, [isAuthenticated, isDemoMode])

  // Fetch persisted investigations when authenticated
  const refreshInvestigations = useCallback(async () => {
    if (isDemoMode || !isAuthenticated) {
      setDbConnected(false)
      setDbError(null)
      if (!isDemoMode) {
        setInvestigations([])
      }
      return
    }

    try {
      const data = await apiListInvestigations({ limit: 100 })
      if (Array.isArray(data)) {
        setInvestigations(data.map(normalizeInvestigation))
        setDbConnected(true)
        setDbError(null)
      }
    } catch (err) {
      setDbConnected(false)
      setInvestigations([]) // Do not inject demo investigations for real users
      if (err.code !== 'unauthorized') {
        setDbError(err.message || 'Database unavailable')
      } else {
        setDbError('Authentication session expired. Please sign in again.')
      }
    }
  }, [isAuthenticated, isDemoMode])

  useEffect(() => {
    refreshInvestigations()
  }, [refreshInvestigations])

  // Load a persisted batch from the database (paginating all child records)
  const loadBatchFromDb = useCallback(
    async (batchId, { onProgress = null } = {}) => {
      const batch = await apiGetBatchWithAllRecords(batchId, { pageSize: 100, onProgress })
      const mappedCustomers = (batch.records || []).map((r) => ({
        id: r.customer_ref,
        score: r.model_score,
        predicted_label: r.predicted_label,
        label_name: r.label_name,
        status: r.status,
        review_category: r.review_category,
        features: r.features || {},
        warnings: r.warnings || [],
        errors: r.errors || [],
        screeningRecordId: r.id,
        batchId: batch.id,
        isDemo: false,
      }))

      const stats = {
        total: batch.total_rows,
        scored: batch.scored_rows,
        rejected: batch.rejected_rows,
        warnCount: batch.warning_rows,
        modelSha: batch.model_sha256,
        batchId: batch.id,
        createdAt: batch.created_at,
        isPersisted: true,
      }

      loadScreened(batch.file_name, mappedCustomers, stats)
      return batch
    },
    [loadScreened],
  )

  const addInvestigation = useCallback(
    async ({ customerRef, origin, basis, screeningRecordId, batchId, priority = 'Normal', assignee = '', notes = '' }) => {
      // Check local list first for fast feedback
      const existing = investigations.find(
        (i) => i.customerRef === customerRef && (screeningRecordId ? i.screeningRecordId === screeningRecordId : i.origin === origin),
      )
      if (existing) {
        return {
          ok: false,
          conflict: true,
          ticketCode: existing.ticketCode,
          message: `Customer ${customerRef} is already in the investigation queue (${existing.ticketCode}).`,
        }
      }

      const fallbackLocalTicket = {
        id: `inv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        ticketCode: `LOCAL-${Date.now().toString().slice(-6)}`,
        customerRef,
        origin,
        basis,
        status: 'New',
        priority,
        assignee,
        notes,
        outcome: '',
        evidence: [],
        checklist: DEFAULT_CHECKLIST.map((label) => ({ label, done: false })),
        screeningRecordId: screeningRecordId || null,
        batchId: batchId || null,
        isPersisted: false,
      }

      if (isDemoMode || !isAuthenticated) {
        setInvestigations((list) => [fallbackLocalTicket, ...list])
        return {
          ok: true,
          local: true,
          investigation: fallbackLocalTicket,
          ticketCode: fallbackLocalTicket.ticketCode,
          notice: 'Saved to local demo queue.',
        }
      }

      try {
        const persisted = await apiCreateInvestigation({
          customerRef,
          origin,
          basis,
          priority,
          assignee,
          notes,
          screeningRecordId: screeningRecordId || null,
          batchId: batchId || null,
          checklist: DEFAULT_CHECKLIST.map((label) => ({ label, done: false })),
        })

        const normalized = normalizeInvestigation(persisted)
        setInvestigations((list) => [normalized, ...list.filter((i) => i.id !== normalized.id)])
        setDbConnected(true)
        return { ok: true, investigation: normalized, ticketCode: normalized.ticketCode }
      } catch (err) {
        if (err instanceof DbApiError && err.code === 'conflict') {
          return {
            ok: false,
            conflict: true,
            message: err.message || 'Conflict: an active investigation already exists.',
          }
        }
        // Do not silently inject local demo tickets for authenticated users on database error
        if (isDemoMode || !isAuthenticated) {
          setInvestigations((list) => [fallbackLocalTicket, ...list])
          return {
            ok: true,
            local: true,
            investigation: fallbackLocalTicket,
            ticketCode: fallbackLocalTicket.ticketCode,
            notice: 'Saved to local demo queue.',
          }
        }
        setDbConnected(false)
        const errorMsg = err?.message || 'Database error: could not save investigation.'
        setDbError(errorMsg)
        return {
          ok: false,
          error: true,
          message: errorMsg,
        }
      }
    },
    [investigations, isAuthenticated, isDemoMode],
  )

  const updateInvestigation = useCallback(
    async (id, patch) => {
      // Optimistic state update
      setInvestigations((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))

      // If persistent ticket (UUID format), push patch to API
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      if (isUuid) {
        try {
          const updated = await apiUpdateInvestigation(id, patch)
          setInvestigations((list) => list.map((i) => (i.id === id ? normalizeInvestigation(updated) : i)))
        } catch (err) {
          console.warn('Failed to persist investigation patch:', err)
        }
      }
    },
    [],
  )

  const toggleChecklist = useCallback(
    (id, index) => {
      setInvestigations((list) => {
        const target = list.find((i) => i.id === id)
        if (!target) return list
        const updatedChecklist = target.checklist.map((c, n) => (n === index ? { ...c, done: !c.done } : c))

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        if (isUuid) {
          apiUpdateInvestigation(id, { checklist: updatedChecklist }).catch((err) => {
            console.warn('Failed to persist checklist update:', err)
          })
        }

        return list.map((i) => (i.id === id ? { ...i, checklist: updatedChecklist } : i))
      })
    },
    [],
  )

  const removeInvestigation = useCallback(async (id) => {
    setInvestigations((list) => list.filter((i) => i.id !== id))
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (isUuid) {
      try {
        await apiDeleteInvestigation(id)
      } catch (err) {
        console.warn('Failed to delete persisted investigation:', err)
      }
    }
  }, [])

  const value = useMemo(
    () => ({
      customers,
      source,
      uploaded,
      hasScores,
      loadUploaded,
      loadScreened,
      loadDemo,
      loadBatchFromDb,
      thresholds,
      setThresholds,
      tariff,
      setTariff,
      comparison,
      setComparison,
      investigations,
      addInvestigation,
      updateInvestigation,
      toggleChecklist,
      removeInvestigation,
      dbConnected,
      dbError,
      refreshInvestigations,
      billSlots,
      setBillSlots,
      activeBillContext,
      setActiveBillContext,
      questionnaireAnswers,
      setQuestionnaireAnswers,
      assistantOpen,
      setAssistantOpen,
    }),
    [
      customers,
      source,
      uploaded,
      hasScores,
      loadUploaded,
      loadScreened,
      loadDemo,
      loadBatchFromDb,
      thresholds,
      tariff,
      comparison,
      investigations,
      addInvestigation,
      updateInvestigation,
      toggleChecklist,
      removeInvestigation,
      dbConnected,
      dbError,
      refreshInvestigations,
      billSlots,
      activeBillContext,
      questionnaireAnswers,
      assistantOpen,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState must be used inside AppStateProvider')
  return v
}
