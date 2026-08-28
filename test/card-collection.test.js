import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CARD_COLLECTION_STORAGE_KEY,
  addCardCollectionCopies,
  applyCardCollectionChange,
  getCardCollectionCount,
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
  assert.deepEqual(collection, {
    revision: 3,
    cards: [{ cardId: 'TST_001', count: 5 }],
  })
  saveCardCollection(storage, collection)
  assert.equal(
    JSON.parse(storage.getItem(CARD_COLLECTION_STORAGE_KEY)).version,
    1,
  )
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
