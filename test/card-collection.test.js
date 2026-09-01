import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CARD_COLLECTION_STORAGE_KEY,
  addCardCollectionCopies,
  applyCardCollectionChange,
  applyCardCollectionChanges,
  createCollectionCheckpoint,
  createEmptyCardCollection,
  getCardListOwnershipSummary,
  getCardCollectionCount,
  getCardOwnershipStatus,
  getCollectionChangesSince,
  getGameplayCardCollectionCount,
  isDeckFullyOwned,
  loadCardCollection,
  removeCardCollectionCopies,
  saveCardCollection,
} from '../src/card-collection.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

function card(id, name, type = 'Unit') {
  return { id, name, subtitle: null, type }
}

test('card collection persistence repairs invalid and duplicate entries', () => {
  const storage = memoryStorage()
  storage.setItem(
    CARD_COLLECTION_STORAGE_KEY,
    JSON.stringify({
      revision: 3,
      cards: [
        { cardId: 'TST_001', count: 2 },
        { cardId: 'TST_001', count: 3 },
        { cardId: '', count: 1 },
        { cardId: 'TST_002', count: 0 },
      ],
    }),
  )

  const collection = loadCardCollection(storage)
  assert.match(collection.historyId, /.+/)
  assert.equal(collection.revision, 3)
  assert.deepEqual(collection.cards, [{ cardId: 'TST_001', count: 5 }])
  assert.deepEqual(collection.events, [])
  saveCardCollection(storage, collection)
  assert.equal(
    JSON.parse(storage.getItem(CARD_COLLECTION_STORAGE_KEY)).version,
    2,
  )
})

test('collection history reports net additions after a deck checkpoint', () => {
  const initial = createEmptyCardCollection()
  const checkpoint = createCollectionCheckpoint(initial)
  const first = addCardCollectionCopies(initial, 'TST_001', 2, {
    changedAt: '2026-09-01T10:00:00.000Z',
  })
  const second = addCardCollectionCopies(first, 'TST_002', 1, {
    changedAt: '2026-09-02T10:00:00.000Z',
  })
  const current = removeCardCollectionCopies(second, 'TST_001', 1, {
    changedAt: '2026-09-03T10:00:00.000Z',
  })

  assert.deepEqual(getCollectionChangesSince(current, checkpoint), {
    historyId: current.historyId,
    fromRevision: 0,
    throughRevision: 3,
    additions: [
      {
        cardId: 'TST_001',
        count: 1,
        firstAddedAt: '2026-09-01T10:00:00.000Z',
        lastAddedAt: '2026-09-01T10:00:00.000Z',
      },
      {
        cardId: 'TST_002',
        count: 1,
        firstAddedAt: '2026-09-02T10:00:00.000Z',
        lastAddedAt: '2026-09-02T10:00:00.000Z',
      },
    ],
    removals: [],
    historyAvailable: true,
  })
})

test('assistant collection batches create one atomic revision', () => {
  const initial = createEmptyCardCollection()
  const changed = applyCardCollectionChanges(initial, [
    { type: 'add', zone: 'collection', count: 2, card: { id: 'TST_001' } },
    { type: 'add', zone: 'collection', count: 1, card: { id: 'TST_002' } },
  ])

  assert.equal(changed.revision, 1)
  assert.equal(changed.events.length, 1)
  assert.equal(changed.events[0].source, 'assistant')
  assert.deepEqual(changed.events[0].deltas, [
    { cardId: 'TST_001', delta: 2 },
    { cardId: 'TST_002', delta: 1 },
  ])
})

test('card collection quantity helpers are immutable and revisioned', () => {
  const original = { revision: 0, cards: [] }
  const added = addCardCollectionCopies(original, 'TST_003', 3)
  const decremented = removeCardCollectionCopies(added, 'TST_003', 1)
  const removed = applyCardCollectionChange(decremented, {
    type: 'remove',
    zone: 'collection',
    count: 2,
    card: { id: 'TST_003' },
  })

  assert.equal(getCardCollectionCount(original, 'TST_003'), 0)
  assert.equal(getCardCollectionCount(added, 'TST_003'), 3)
  assert.equal(getCardCollectionCount(decremented, 'TST_003'), 2)
  assert.equal(getCardCollectionCount(removed, 'TST_003'), 0)
  assert.deepEqual(
    [original.revision, added.revision, decremented.revision, removed.revision],
    [0, 1, 2, 3],
  )
})

test('deck ownership includes identities and sideboard while accepting reprints', () => {
  const leader = card('TST-001', 'Leader', 'Leader')
  const base = card('TST-002', 'Base', 'Base')
  const deckUnit = card('TST-003', 'Shared Unit')
  const reprint = card('NEW-099', 'Shared Unit')
  const sideboard = card('TST-004', 'Sideboard Unit')
  const deck = {
    leader,
    secondLeader: null,
    base,
    drawDeck: [deckUnit, deckUnit],
    sideboard: [sideboard],
  }
  const cardsById = new Map([
    ['TST_001', leader],
    ['TST_002', base],
    ['NEW_099', reprint],
    ['TST_004', sideboard],
  ])
  const complete = {
    revision: 1,
    cards: [
      { cardId: 'TST_001', count: 1 },
      { cardId: 'TST_002', count: 1 },
      { cardId: 'NEW_099', count: 2 },
      { cardId: 'TST_004', count: 1 },
    ],
  }

  assert.equal(isDeckFullyOwned(deck, complete, cardsById), true)
  assert.equal(
    isDeckFullyOwned(
      deck,
      { ...complete, cards: complete.cards.slice(0, -1) },
      cardsById,
    ),
    false,
  )
})

test('card ownership counts equivalent printings and describes coverage', () => {
  const deckCard = card('TST-003', 'Shared Unit')
  const reprint = card('NEW-099', 'Shared Unit')
  const cardsById = new Map([['NEW_099', reprint]])
  const collection = {
    revision: 1,
    cards: [{ cardId: 'NEW_099', count: 2 }],
  }

  assert.equal(
    getGameplayCardCollectionCount(collection, deckCard, cardsById),
    2,
  )
  assert.deepEqual(getCardOwnershipStatus(0, 3), {
    kind: 'none',
    label: 'None owned',
  })
  assert.deepEqual(getCardOwnershipStatus(2, 3), {
    kind: 'partial',
    label: '2 of 3 owned',
  })
  assert.deepEqual(getCardOwnershipStatus(4, 3), {
    kind: 'all',
    label: 'All owned',
  })

  assert.deepEqual(
    getCardListOwnershipSummary(
      [deckCard, deckCard, card('TST-004', 'Other Unit')],
      collection,
      cardsById,
    ),
    {
      fullyOwned: false,
      label: '2 out of 3 owned',
      owned: 2,
      total: 3,
    },
  )
  assert.deepEqual(
    getCardListOwnershipSummary(
      [deckCard, deckCard],
      collection,
      cardsById,
    ),
    {
      fullyOwned: true,
      label: 'Fully owned',
      owned: 2,
      total: 2,
    },
  )
})
