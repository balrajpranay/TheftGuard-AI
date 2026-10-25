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
