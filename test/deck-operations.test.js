import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentCatalog } from '../server/catalog.mjs'
import { DeckGenerationValidationError } from '../server/deck-validation.mjs'
import { applyDeckOperations } from '../server/deck-operations.mjs'

function sourceCard(number, name, type = 'Unit') {
  return {
    Set: 'TST',
    Number: String(number).padStart(3, '0'),
    Name: name,
    Type: type,
    VariantType: 'Normal',
    FrontArt: `https://example.invalid/${number}.jpg`,
  }
}

const catalog = createAgentCatalog({
  schemaVersion: 1,
  sets: {
    TST: {
      cards: [
        sourceCard(1, 'One'),
        sourceCard(2, 'Two'),
        sourceCard(3, 'Three'),
        sourceCard(4, 'Four'),
        sourceCard(5, 'Primary Leader', 'Leader'),
        sourceCard(6, 'Second Leader', 'Leader'),
        sourceCard(7, 'Alternate Leader', 'Leader'),
      ],
    },
  },
})

const currentDeck = {
  name: 'Current deck',
  leaderId: 'TST_005',
  secondLeaderId: null,
  baseId: 'BASE',
  drawDeck: [
    { cardId: 'TST_001', count: 3 },
    { cardId: 'TST_002', count: 2 },
  ],
  sideboard: [{ cardId: 'TST_003', count: 1 }],
}

test('applies ordered add, replace, and remove operations and enriches each row', () => {
  const result = applyDeckOperations(
    currentDeck,
    [
      { type: 'add', zone: 'sideboard', cardId: 'TST_004', count: 2 },
      {
        type: 'replace',
        zone: 'drawDeck',
        removeCardId: 'TST_001',
        addCardId: 'TST_003',
        count: 2,
      },
      { type: 'remove', zone: 'drawDeck', cardId: 'TST_002', count: 1 },
    ],
    catalog,
  )

  assert.deepEqual(result.deck.drawDeck, [
    { cardId: 'TST_001', count: 1 },
    { cardId: 'TST_002', count: 1 },
    { cardId: 'TST_003', count: 2 },
  ])
  assert.deepEqual(result.deck.sideboard, [
    { cardId: 'TST_003', count: 1 },
    { cardId: 'TST_004', count: 2 },
  ])
  assert.deepEqual(
    result.changes.map(({ id, type, zone, count }) => ({ id, type, zone, count })),
    [
      { id: 'change-1', type: 'add', zone: 'sideboard', count: 2 },
      { id: 'change-2', type: 'replace', zone: 'drawDeck', count: 2 },
      { id: 'change-3', type: 'remove', zone: 'drawDeck', count: 1 },
    ],
  )
  assert.equal(result.changes[0].card.name, 'Four')
  assert.equal(result.changes[1].from.name, 'One')
  assert.equal(result.changes[1].to.name, 'Three')
})

test('rejects an invalid operation set without mutating the authoritative deck', () => {
  const snapshot = structuredClone(currentDeck)

  assert.throws(
    () =>
      applyDeckOperations(
        currentDeck,
        [
          { type: 'add', zone: 'drawDeck', cardId: 'TST_004', count: 1 },
          { type: 'remove', zone: 'drawDeck', cardId: 'TST_002', count: 3 },
        ],
        catalog,
      ),
    (error) => {
      assert.ok(error instanceof DeckGenerationValidationError)
      assert.match(error.message, /did not pass validation/i)
      assert.match(error.issues.join(' '), /only 2 are present/i)
      return true
    },
  )

  assert.deepEqual(currentDeck, snapshot)
})

test('rejects unknown IDs and unsupported zones', () => {
  assert.throws(
    () =>
      applyDeckOperations(
        currentDeck,
        [
          { type: 'add', zone: 'leader', cardId: 'TST_004', count: 1 },
          { type: 'add', zone: 'drawDeck', cardId: 'TST_999', count: 1 },
        ],
        catalog,
      ),
    (error) => {
      assert.match(error.issues.join(' '), /secondLeader, drawDeck, or sideboard/i)
      assert.match(error.issues.join(' '), /unknown card TST_999/i)
      return true
    },
  )
})

test('rejects dependent or overlapping rows so each change can be accepted alone', () => {
  assert.throws(
    () =>
      applyDeckOperations(
        currentDeck,
        [
          { type: 'add', zone: 'drawDeck', cardId: 'TST_004', count: 1 },
          {
            type: 'replace',
            zone: 'drawDeck',
            removeCardId: 'TST_004',
            addCardId: 'TST_003',
            count: 1,
          },
        ],
        catalog,
      ),
    (error) => {
      assert.match(error.issues.join(' '), /overlaps another change/i)
      return true
    },
  )
})

test('canonicalizes alternate padded and unpadded IDs in modification rows', () => {
  const result = applyDeckOperations(
    currentDeck,
    [{ type: 'remove', zone: 'drawDeck', cardId: 'TST_1', count: 1 }],
    catalog,
  )

  assert.deepEqual(result.deck.drawDeck[0], {
    cardId: 'TST_001',
    count: 2,
  })
  assert.equal(result.changes[0].card.id, 'TST_001')
})

test('adds, replaces, and removes the optional second-leader singleton', () => {
  const added = applyDeckOperations(
    currentDeck,
    [{ type: 'add', zone: 'secondLeader', cardId: 'TST_006', count: 1 }],
    catalog,
  )
  assert.equal(added.deck.secondLeaderId, 'TST_006')
  assert.equal(added.changes[0].card.name, 'Second Leader')

  const replaced = applyDeckOperations(
    added.deck,
    [
      {
        type: 'replace',
        zone: 'secondLeader',
        removeCardId: 'TST_006',
        addCardId: 'TST_007',
        count: 1,
      },
    ],
    catalog,
  )
  assert.equal(replaced.deck.secondLeaderId, 'TST_007')

  const removed = applyDeckOperations(
    replaced.deck,
    [{ type: 'remove', zone: 'secondLeader', cardId: 'TST_007', count: 1 }],
    catalog,
  )
  assert.equal(removed.deck.secondLeaderId, null)
})

test('enforces one optional second-leader slot containing only a Leader', () => {
  assert.throws(
    () =>
      applyDeckOperations(
        { ...currentDeck, secondLeaderId: 'TST_006' },
        [{ type: 'add', zone: 'secondLeader', cardId: 'TST_007', count: 1 }],
        catalog,
      ),
    (error) => {
      assert.match(error.issues.join(' '), /already has two leaders/i)
      return true
    },
  )

  assert.throws(
    () =>
      applyDeckOperations(
        currentDeck,
        [{ type: 'add', zone: 'secondLeader', cardId: 'TST_001', count: 1 }],
        catalog,
      ),
    (error) => {
      assert.match(error.issues.join(' '), /requires a Leader/i)
      return true
    },
  )

  assert.throws(
    () =>
      applyDeckOperations(
        currentDeck,
        [{ type: 'add', zone: 'secondLeader', cardId: 'TST_006', count: 2 }],
        catalog,
      ),
    (error) => {
      assert.match(error.issues.join(' '), /count 1/i)
      return true
    },
  )
})
