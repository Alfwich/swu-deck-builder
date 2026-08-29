import assert from 'node:assert/strict'
import test from 'node:test'

import { applyAgentOperations } from '../server/agent-operations.mjs'
import { createAgentCatalog } from '../server/catalog.mjs'
import {
  applyCollectionOperations,
  fingerprintAgentCardCollection,
} from '../server/card-collection.mjs'

function sourceCard(type, number, name) {
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
        sourceCard('Leader', 1, 'Leader'),
        sourceCard('Base', 2, 'Base'),
        sourceCard('Unit', 3, 'Owned Unit'),
        sourceCard('Unit', 4, 'New Unit'),
      ],
    },
  },
})

const deck = {
  name: 'Collection test',
  leaderId: 'TST_001',
  secondLeaderId: null,
  baseId: 'TST_002',
  drawDeck: [{ cardId: 'TST_003', count: 1 }],
  sideboard: [],
}

test('collection fingerprints are order-independent and revision-aware', () => {
  const first = fingerprintAgentCardCollection({
    revision: 2,
    cards: [
      { cardId: 'TST_004', count: 1 },
      { cardId: 'TST_003', count: 2 },
    ],
  })
  const reordered = fingerprintAgentCardCollection({
    revision: 2,
    cards: [
      { cardId: 'TST_003', count: 2 },
      { cardId: 'TST_004', count: 1 },
    ],
  })
  const revised = fingerprintAgentCardCollection({
    revision: 3,
    cards: [
      { cardId: 'TST_003', count: 2 },
      { cardId: 'TST_004', count: 1 },
    ],
  })

  assert.equal(first, reordered)
  assert.notEqual(first, revised)
})

test('agent operations preserve mixed deck and collection change order', () => {
  const collection = {
    revision: 7,
    cards: [{ cardId: 'TST_003', count: 2 }],
  }
  const result = applyAgentOperations(
    deck,
    collection,
    [
      { type: 'add', zone: 'collection', cardId: 'TST_004', count: 2 },
      { type: 'add', zone: 'drawDeck', cardId: 'TST_004', count: 1 },
      { type: 'remove', zone: 'collection', cardId: 'TST_003', count: 1 },
    ],
    catalog,
  )

  assert.deepEqual(
    result.changes.map(({ id, type, zone }) => ({ id, type, zone })),
    [
      { id: 'change-1', type: 'add', zone: 'collection' },
      { id: 'change-2', type: 'add', zone: 'drawDeck' },
      { id: 'change-3', type: 'remove', zone: 'collection' },
    ],
  )
  assert.deepEqual(result.collection, {
    revision: 7,
    cards: [
      { cardId: 'TST_003', count: 1 },
      { cardId: 'TST_004', count: 2 },
    ],
  })
  assert.deepEqual(result.deck.drawDeck, [
    { cardId: 'TST_003', count: 1 },
    { cardId: 'TST_004', count: 1 },
  ])
  assert.equal(collection.cards.length, 1)
})

test('agent collection operations reject replacement and excess removal', () => {
  const collection = {
    revision: 1,
    cards: [{ cardId: 'TST_003', count: 1 }],
  }

  assert.throws(
    () =>
      applyCollectionOperations(
        collection,
        [
          {
            type: 'replace',
            zone: 'collection',
            removeCardId: 'TST_003',
            addCardId: 'TST_004',
            count: 1,
          },
        ],
        catalog,
      ),
    (error) => error.issues.some((issue) => /only add or remove/.test(issue)),
  )
  assert.throws(
    () =>
      applyCollectionOperations(
        collection,
        [{ type: 'remove', zone: 'collection', cardId: 'TST_003', count: 2 }],
        catalog,
      ),
    (error) => error.issues.some((issue) => /only 1 are owned/.test(issue)),
  )
})
