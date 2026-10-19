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

const DEMO_CUSTOMERS = buildDemoCustomers()
export const DEFAULT_CHECKLIST = [
  'Confirm the customer and meter identity',
  'Compare the meter reading with the billing record',
  'Check the meter seal and enclosure',
  'Review the connected load against the sanctioned load',
  'Record photographs and field notes',
]

export function normalizeInvestigation(inv) {
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
  // Results source: demonstration rows, or rows from an uploaded file (previewed or ML-scored).
  const [uploaded, setUploaded] = useState(null)
  const [source, setSource] = useState('demo')
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [tariff, setTariff] = useState(7)
  const [comparison, setComparison] = useState({
    rows: buildDemoConsumption(),
    label: 'Demonstration data (synthetic)',
    isDemo: true,
    splitDate: DEMO_SPLIT_DATE,
    dropThreshold: 30,
  })
  const [investigations, setInvestigations] = useState([])
  const [dbConnected, setDbConnected] = useState(false)
  const [dbError, setDbError] = useState(null)

  const customers = source === 'uploaded' && uploaded ? uploaded.customers : DEMO_CUSTOMERS
  const hasScores = source === 'uploaded' && Boolean(uploaded?.hasScores)

  const loadUploaded = useCallback((fileName, rows) => {
    setUploaded({ fileName, customers: rows, hasScores: false })
    setSource('uploaded')
  }, [])

  const loadScreened = useCallback((fileName, rows, metadata = {}) => {
    setUploaded({ fileName, customers: rows, hasScores: true, metadata })
    setSource('uploaded')
  }, [])

  const loadDemo = useCallback(() => setSource('demo'), [])

  // Fetch persisted investigations on mount
  const refreshInvestigations = useCallback(async () => {
    try {
      const data = await apiListInvestigations({ limit: 100 })
      if (Array.isArray(data)) {
        setInvestigations(data.map(normalizeInvestigation))
        setDbConnected(true)
        setDbError(null)
      }
    } catch (err) {
      // Local/demo fallback if DB is not running or not configured
      setDbConnected(false)
      setDbError(err.message || 'Database unavailable')
    }
  }, [])

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
        // If database is unavailable, fall back to in-memory state
        setInvestigations((list) => [fallbackLocalTicket, ...list])
        return {
          ok: true,
          local: true,
          investigation: fallbackLocalTicket,
          ticketCode: fallbackLocalTicket.ticketCode,
          notice: 'Saved to local session only (database offline).',
        }
      }
    },
    [investigations],
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
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState must be used inside AppStateProvider')
  return v
}
