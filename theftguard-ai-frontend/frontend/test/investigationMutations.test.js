import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isUuidTicket,
  applyOptimisticUpdate,
  rollbackOptimisticUpdate,
  rollbackChecklistToggle,
  restoreDeletedInvestigation,
} from '../src/lib/investigationMutations.js'

describe('Investigation Mutations & Rollback State Management', () => {
  const sampleTicket1 = {
    id: 'b1234567-89ab-cdef-0123-456789abcdef',
    ticketCode: 'INV-20261025-0001',
    customerRef: 'CUST-001',
    status: 'New',
    priority: 'Normal',
    notes: 'Initial observation',
    checklist: [
      { label: 'Seal intact', done: false },
      { label: 'Meter reading verified', done: false },
    ],
    evidence: [{ name: 'meter.jpg', size: 1024 }],
  }

  const sampleTicket2 = {
    id: 'c7654321-ba98-fedc-3210-fedcba987654',
    ticketCode: 'INV-20261025-0002',
    customerRef: 'CUST-002',
    status: 'Scheduled',
    priority: 'High',
    notes: 'Urgent review',
    checklist: [
      { label: 'Seal intact', done: true },
      { label: 'Meter reading verified', done: false },
    ],
    evidence: [],
  }

  const localDemoTicket = {
    id: 'inv-1729864200000-123456',
    ticketCode: 'LOCAL-654321',
    customerRef: 'DEMO-001',
    status: 'New',
    priority: 'Normal',
    notes: 'Local demo only',
    checklist: [{ label: 'Confirm identity', done: false }],
  }

  describe('isUuidTicket', () => {
    it('accurately identifies UUID format tickets vs local demo session tickets', () => {
      assert.strictEqual(isUuidTicket('b1234567-89ab-cdef-0123-456789abcdef'), true)
      assert.strictEqual(isUuidTicket('B1234567-89AB-CDEF-0123-456789ABCDEF'), true)
      assert.strictEqual(isUuidTicket('inv-1729864200000-123456'), false)
      assert.strictEqual(isUuidTicket('LOCAL-654321'), false)
      assert.strictEqual(isUuidTicket(null), false)
      assert.strictEqual(isUuidTicket(undefined), false)
      assert.strictEqual(isUuidTicket(''), false)
    })
  })

  describe('applyOptimisticUpdate', () => {
    it('applies patch to target ticket and captures prior values', () => {
      const list = [sampleTicket1, sampleTicket2]
      const patch = { status: 'In inspection', notes: 'Field crew arrived' }

      const { list: updatedList, originalValues } = applyOptimisticUpdate(
        list,
        sampleTicket1.id,
        patch,
      )

      assert.strictEqual(updatedList.length, 2)
      assert.strictEqual(updatedList[0].status, 'In inspection')
      assert.strictEqual(updatedList[0].notes, 'Field crew arrived')
      assert.strictEqual(updatedList[1].status, 'Scheduled') // unaffected

      assert.deepStrictEqual(originalValues, {
        status: 'New',
        notes: 'Initial observation',
      })
    })

    it('returns unmodified list and null originalValues when target not found', () => {
      const list = [sampleTicket1]
      const { list: updatedList, originalValues } = applyOptimisticUpdate(
        list,
        'non-existent-id',
        { status: 'Closed' },
      )
      assert.deepStrictEqual(updatedList, list)
      assert.strictEqual(originalValues, null)
    })
  })

  describe('rollbackOptimisticUpdate (BUG-02 verification)', () => {
    it('reverts optimistic fields to previous values upon API failure', () => {
      const list = [sampleTicket1, sampleTicket2]
      const patch = { status: 'In inspection', notes: 'Field crew arrived' }
      const { list: updatedList, originalValues } = applyOptimisticUpdate(
        list,
        sampleTicket1.id,
        patch,
      )

      // Simulate API failure: execute rollback
      const rolledBack = rollbackOptimisticUpdate(
        updatedList,
        sampleTicket1.id,
        patch,
        originalValues,
      )

      assert.strictEqual(rolledBack[0].status, 'New')
      assert.strictEqual(rolledBack[0].notes, 'Initial observation')
    })

    it('guards against race conditions: does NOT overwrite newer user modifications', () => {
      const list = [sampleTicket1]
      const patch1 = { notes: 'Edit 1 (in flight)' }
      const { list: afterPatch1, originalValues: orig1 } = applyOptimisticUpdate(
        list,
        sampleTicket1.id,
        patch1,
      )

      // User performs a second edit before request 1 completes
      const patch2 = { notes: 'Edit 2 (newer user typing)' }
      const { list: afterPatch2 } = applyOptimisticUpdate(
        afterPatch1,
        sampleTicket1.id,
        patch2,
      )

      assert.strictEqual(afterPatch2[0].notes, 'Edit 2 (newer user typing)')

      // Request 1 fails now! Attempt rollback with patch1 and orig1
      const afterRollback1 = rollbackOptimisticUpdate(
        afterPatch2,
        sampleTicket1.id,
        patch1,
        orig1,
      )

      // Crucial assertion: notes must REMAIN 'Edit 2 (newer user typing)' because current value != patch1.notes
      assert.strictEqual(
        afterRollback1[0].notes,
        'Edit 2 (newer user typing)',
        'Newer user edit must NOT be overwritten by a delayed failure from an earlier request',
      )
    })

    it('reverts complex object and array values accurately', () => {
      const list = [sampleTicket1]
      const patch = {
        evidence: [
          { name: 'meter.jpg', size: 1024 },
          { name: 'seal_broken.jpg', size: 2048 },
        ],
      }
      const { list: updatedList, originalValues } = applyOptimisticUpdate(
        list,
        sampleTicket1.id,
        patch,
      )

      assert.strictEqual(updatedList[0].evidence.length, 2)

      const rolledBack = rollbackOptimisticUpdate(
        updatedList,
        sampleTicket1.id,
        patch,
        originalValues,
      )
      assert.strictEqual(rolledBack[0].evidence.length, 1)
      assert.strictEqual(rolledBack[0].evidence[0].name, 'meter.jpg')
    })
  })

  describe('rollbackChecklistToggle', () => {
    it('restores previous checklist done status when persistence fails', () => {
      const list = [sampleTicket1]
      // Optimistic toggle of index 0 (originalDone: false -> true)
      const toggledList = list.map((i) => ({
        ...i,
        checklist: i.checklist.map((c, n) => (n === 0 ? { ...c, done: true } : c)),
      }))
      assert.strictEqual(toggledList[0].checklist[0].done, true)

      // Rollback on API error
      const rolledBack = rollbackChecklistToggle(toggledList, sampleTicket1.id, 0, false)
      assert.strictEqual(rolledBack[0].checklist[0].done, false)
    })

    it('does not toggle if current state was modified again by user', () => {
      const list = [sampleTicket1]
      // If user toggled it back themselves, current done is false
      const rolledBack = rollbackChecklistToggle(list, sampleTicket1.id, 0, false)
      assert.strictEqual(rolledBack[0].checklist[0].done, false)
    })
  })

  describe('restoreDeletedInvestigation', () => {
    it('restores deleted ticket at original index on API failure', () => {
      const list = [sampleTicket1, sampleTicket2]
      // Ticket 1 removed optimistically
      const listAfterDelete = [sampleTicket2]

      // API delete fails: restore ticket 1 at original index 0
      const restored = restoreDeletedInvestigation(listAfterDelete, sampleTicket1, 0)
      assert.strictEqual(restored.length, 2)
      assert.strictEqual(restored[0].id, sampleTicket1.id)
      assert.strictEqual(restored[1].id, sampleTicket2.id)
    })

    it('restores ticket at middle index accurately', () => {
      const t3 = { ...sampleTicket2, id: 'd0000000-0000-0000-0000-000000000000' }
      const list = [sampleTicket1, sampleTicket2, t3]
      const listAfterDelete = [sampleTicket1, t3]

      // Restore ticket 2 at original index 1
      const restored = restoreDeletedInvestigation(listAfterDelete, sampleTicket2, 1)
      assert.strictEqual(restored.length, 3)
      assert.strictEqual(restored[1].id, sampleTicket2.id)
    })

    it('is idempotent and prevents duplicate insertions if ticket already present', () => {
      const list = [sampleTicket1, sampleTicket2]
      const restored = restoreDeletedInvestigation(list, sampleTicket1, 0)
      assert.strictEqual(restored.length, 2)
    })
  })
})
