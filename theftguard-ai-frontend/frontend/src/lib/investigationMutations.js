/**
 * TheftGuard AI — Investigation Mutation & Rollback Helpers.
 *
 * Provides pure state management helpers for optimistic updates, race-condition-safe
 * rollbacks, and ticket restoration on failed persistence requests.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidTicket(id) {
  return typeof id === 'string' && UUID_REGEX.test(id)
}

/**
 * Applies an optimistic patch to the target investigation and records the prior values
 * of all modified keys.
 */
export function applyOptimisticUpdate(list, id, patch) {
  if (!Array.isArray(list) || !id || !patch || typeof patch !== 'object') {
    return { list: list || [], originalValues: null }
  }

  let originalValues = null
  const updatedList = list.map((item) => {
    if (item.id === id) {
      originalValues = {}
      for (const key of Object.keys(patch)) {
        originalValues[key] = item[key]
      }
      return { ...item, ...patch }
    }
    return item
  })

  return { list: updatedList, originalValues }
}

/**
 * Reverts optimistic patch values on API failure.
 *
 * CRITICAL RACE-GUARD:
 * For each patched key, only reverts if the current value in state is STILL identical
 * to the optimistic patch value. If the user or another action has already updated that
 * field in the meantime, the newer value is preserved and not overwritten.
 */
export function rollbackOptimisticUpdate(list, id, patch, originalValues) {
  if (!Array.isArray(list) || !id || !patch || !originalValues) {
    return list || []
  }

  return list.map((item) => {
    if (item.id !== id) return item

    const reverted = { ...item }
    for (const [key, optimisticVal] of Object.entries(patch)) {
      const currentVal = item[key]
      const isStillOptimistic =
        typeof optimisticVal === 'object' && optimisticVal !== null
          ? JSON.stringify(currentVal) === JSON.stringify(optimisticVal)
          : currentVal === optimisticVal

      if (isStillOptimistic) {
        reverted[key] = originalValues[key]
      }
    }
    return reverted
  })
}

/**
 * Reverts a checklist item toggle on API failure if still in optimistic state.
 */
export function rollbackChecklistToggle(list, id, index, originalDone) {
  if (!Array.isArray(list) || !id || typeof index !== 'number' || typeof originalDone !== 'boolean') {
    return list || []
  }

  return list.map((item) => {
    if (item.id !== id || !Array.isArray(item.checklist) || !item.checklist[index]) {
      return item
    }
    // Only revert if current done state equals the toggled optimistic state (!originalDone)
    if (item.checklist[index].done === !originalDone) {
      const revertedChecklist = item.checklist.map((c, idx) =>
        idx === index ? { ...c, done: originalDone } : c,
      )
      return { ...item, checklist: revertedChecklist }
    }
    return item
  })
}

/**
 * Restores a deleted investigation back into the list at its original index upon API failure.
 */
export function restoreDeletedInvestigation(list, target, originalIndex = 0) {
  if (!Array.isArray(list) || !target || !target.id) {
    return list || []
  }
  if (list.some((item) => item.id === target.id)) {
    return list
  }

  const restored = [...list]
  const idx =
    typeof originalIndex === 'number' && originalIndex >= 0 && originalIndex <= restored.length
      ? originalIndex
      : 0
  restored.splice(idx, 0, target)
  return restored
}

/**
 * Resolves an existing investigation from a list based on customerRef, origin, or screeningRecordId.
 * Used for client-side duplicate detection and fast conflict resolution.
 */
export function findExistingInvestigation(list, { customerRef, origin, screeningRecordId } = {}) {
  if (!Array.isArray(list) || !customerRef) return null
  const cleanRef = String(customerRef).trim().toLowerCase()
  return (
    list.find((i) => {
      const matchRef = String(i.customerRef || '').trim().toLowerCase() === cleanRef
      if (!matchRef) return false
      if (screeningRecordId) {
        return i.screeningRecordId === screeningRecordId
      }
      return i.origin === origin || (!screeningRecordId && !i.screeningRecordId)
    }) || null
  )
}

/**
 * Finds an investigation by ID (UUID/local ID), ticket code, or customer reference.
 * Supports deep linking and URL search parameters navigation.
 */
export function findInvestigationMatch(list, { id, ticketCode, customerRef } = {}) {
  if (!Array.isArray(list)) return null
  const cleanId = id != null && String(id).trim() ? String(id).trim() : null
  const cleanTicket =
    ticketCode != null && String(ticketCode).trim() ? String(ticketCode).trim().toLowerCase() : null
  const cleanCust =
    customerRef != null && String(customerRef).trim() ? String(customerRef).trim().toLowerCase() : null

  if (!cleanId && !cleanTicket && !cleanCust) return null

  return (
    list.find((i) => {
      if (cleanId && (i.id === cleanId || String(i.id) === cleanId)) return true
      if (
        cleanTicket &&
        (i.ticketCode === ticketCode || String(i.ticketCode || '').toLowerCase() === cleanTicket)
      ) {
        return true
      }
      if (
        cleanCust &&
        (i.customerRef === customerRef || String(i.customerRef || '').toLowerCase() === cleanCust)
      ) {
        return true
      }
      return false
    }) || null
  )
}

/**
 * Constructs a valid navigation path and search query to select an investigation.
 */
export function buildInvestigationLink({ id, ticketCode, customerRef } = {}) {
  const params = new URLSearchParams()
  if (id) params.set('id', id)
  if (ticketCode) params.set('ticket', ticketCode)
  if (customerRef && !id && !ticketCode) params.set('customer', customerRef)

  const queryString = params.toString()
  return queryString ? `/app/investigations?${queryString}` : '/app/investigations'
}
