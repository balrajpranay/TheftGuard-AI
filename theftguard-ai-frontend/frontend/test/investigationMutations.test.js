import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isUuidTicket,
  applyOptimisticUpdate,
  rollbackOptimisticUpdate,
  rollbackChecklistToggle,
  restoreDeletedInvestigation,
  findExistingInvestigation,
  findInvestigationMatch,
  buildInvestigationLink,
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

  describe('Duplicate Detection & Investigation Lookup (UX Escalation)', () => {
    const existingTicket = {
      id: 'bd9b8600-1111-2222-3333-444455556666',
      ticketCode: 'INV-20261025-BD9B86',
      customerRef: '100458921',
      origin: 'bill',
      status: 'In inspection',
      priority: 'High',
      assignee: 'Officer Rao',
      notes: 'Initial meter anomaly',
      checklist: [
        { label: 'Confirm customer identity', done: true },
        { label: 'Check seal integrity', done: false },
      ],
      outcome: '',
      screeningRecordId: null,
      batchId: null,
    }

    const screeningTicket = {
      id: 'aa112233-4455-6677-8899-aabbccddeeff',
      ticketCode: 'INV-20261025-SC01',
      customerRef: '100458922',
      origin: 'screening',
      status: 'New',
      priority: 'Normal',
      screeningRecordId: 'rec-1234',
      batchId: 'batch-5678',
    }

    const testList = [existingTicket, screeningTicket]

    describe('findExistingInvestigation', () => {
      it('detects existing investigation for customer 100458921 with bill origin', () => {
        const found = findExistingInvestigation(testList, {
          customerRef: '100458921',
          origin: 'bill',
        })
        assert.ok(found)
        assert.strictEqual(found.ticketCode, 'INV-20261025-BD9B86')
        assert.strictEqual(found.id, existingTicket.id)
      })

      it('matches customerRef case-insensitively and with whitespace trimmed', () => {
        const found = findExistingInvestigation(testList, {
          customerRef: '  100458921  ',
          origin: 'bill',
        })
        assert.ok(found)
        assert.strictEqual(found.ticketCode, 'INV-20261025-BD9B86')
      })

      it('detects screening ticket when screeningRecordId matches', () => {
        const found = findExistingInvestigation(testList, {
          customerRef: '100458922',
          origin: 'screening',
          screeningRecordId: 'rec-1234',
        })
        assert.ok(found)
        assert.strictEqual(found.ticketCode, 'INV-20261025-SC01')
      })

      it('returns null when no matching investigation exists in queue', () => {
        const found = findExistingInvestigation(testList, {
          customerRef: '999999999',
          origin: 'bill',
        })
        assert.strictEqual(found, null)
      })

      it('safely handles empty or non-array list', () => {
        assert.strictEqual(findExistingInvestigation([], { customerRef: '100458921' }), null)
        assert.strictEqual(findExistingInvestigation(null, { customerRef: '100458921' }), null)
        assert.strictEqual(findExistingInvestigation(testList, {}), null)
      })
    })

    describe('findInvestigationMatch (Deep Linking & Parameter Selection)', () => {
      it('finds ticket by exact UUID id', () => {
        const match = findInvestigationMatch(testList, { id: 'bd9b8600-1111-2222-3333-444455556666' })
        assert.ok(match)
        assert.strictEqual(match.ticketCode, 'INV-20261025-BD9B86')
      })

      it('finds ticket by ticketCode case-insensitively', () => {
        const match = findInvestigationMatch(testList, { ticketCode: 'inv-20261025-bd9b86' })
        assert.ok(match)
        assert.strictEqual(match.id, existingTicket.id)
      })

      it('finds ticket by customerRef when id and ticketCode are absent', () => {
        const match = findInvestigationMatch(testList, { customerRef: '100458921' })
        assert.ok(match)
        assert.strictEqual(match.ticketCode, 'INV-20261025-BD9B86')
      })

      it('returns null when identifier does not exist', () => {
        assert.strictEqual(findInvestigationMatch(testList, { ticketCode: 'INV-DOES-NOT-EXIST' }), null)
        assert.strictEqual(findInvestigationMatch(testList, {}), null)
        assert.strictEqual(findInvestigationMatch(null, { id: 'some-id' }), null)
      })
    })

    describe('buildInvestigationLink', () => {
      it('builds link with id and ticketCode query parameters', () => {
        const link = buildInvestigationLink({
          id: 'bd9b8600-1111-2222-3333-444455556666',
          ticketCode: 'INV-20261025-BD9B86',
        })
        assert.strictEqual(
          link,
          '/app/investigations?id=bd9b8600-1111-2222-3333-444455556666&ticket=INV-20261025-BD9B86',
        )
      })

      it('builds link with ticketCode only', () => {
        const link = buildInvestigationLink({ ticketCode: 'INV-20261025-BD9B86' })
        assert.strictEqual(link, '/app/investigations?ticket=INV-20261025-BD9B86')
      })

      it('builds link with customerRef fallback when id/ticket are missing', () => {
        const link = buildInvestigationLink({ customerRef: '100458921' })
        assert.strictEqual(link, '/app/investigations?customer=100458921')
      })

      it('returns default /app/investigations route when no parameters are provided', () => {
        assert.strictEqual(buildInvestigationLink(), '/app/investigations')
        assert.strictEqual(buildInvestigationLink({}), '/app/investigations')
      })
    })

    describe('State Integrity Under Duplicate Escalation', () => {
      it('preserves status, priority, assignee, checklist, and notes of existing investigation', () => {
        const before = JSON.parse(JSON.stringify(existingTicket))

        const duplicate = findExistingInvestigation(testList, {
          customerRef: '100458921',
          origin: 'bill',
        })
        assert.ok(duplicate)

        assert.strictEqual(existingTicket.status, before.status)
        assert.strictEqual(existingTicket.priority, before.priority)
        assert.strictEqual(existingTicket.assignee, before.assignee)
        assert.strictEqual(existingTicket.notes, before.notes)
        assert.deepStrictEqual(existingTicket.checklist, before.checklist)
        assert.strictEqual(existingTicket.outcome, before.outcome)
      })
    })
  })
})
