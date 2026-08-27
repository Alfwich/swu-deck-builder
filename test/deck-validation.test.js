import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DeckGenerationValidationError,
  validateAndHydrateDeck,
  validateAndHydrateSwudbDeck,
} from '../server/deck-validation.mjs'
import { createAgentCatalog } from '../server/catalog.mjs'

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

function testCatalog() {
  const cards = [
    sourceCard('Leader', 1, 'Leader'),
    sourceCard('Base', 2, 'Base'),
    ...Array.from({ length: 27 }, (_, index) =>
      sourceCard('Unit', index + 3, `Unit ${index + 1}`),
    ),
  ]

  return createAgentCatalog({ schemaVersion: 1, sets: { TST: { cards } } })
}

function validPayload() {
  return {
    name: 'Validated deck',
    summary: 'A test deck.',
    leaderId: 'TST_001',
    secondLeaderId: null,
    baseId: 'TST_002',
    drawDeck: Array.from({ length: 17 }, (_, index) => ({
      cardId: `TST_${String(index + 3).padStart(3, '0')}`,
      count: index === 16 ? 2 : 3,
    })),
    sideboard: [],
  }
}

test('validates exact IDs and hydrates a 50-card draw deck', () => {
  const result = validateAndHydrateDeck(validPayload(), testCatalog())

  assert.equal(result.name, 'Validated deck')
  assert.equal(result.deck.leader.name, 'Leader')
  assert.equal(result.deck.drawDeck.length, 50)
  assert.deepEqual(result.deck.sideboard, [])
})

test('rejects unknown IDs and an incomplete draw deck', () => {
  const payload = validPayload()
  payload.drawDeck = [{ cardId: 'TST_999', count: 1 }]

  assert.throws(
    () => validateAndHydrateDeck(payload, testCatalog()),
    (error) =>
      error instanceof DeckGenerationValidationError &&
      error.issues.some((issue) => issue.includes('unknown card TST_999')) &&
      error.issues.some((issue) => issue.includes('exactly 50')),
  )
})

test('can require an exact 10-card generated sideboard', () => {
  const payload = validPayload()

  assert.throws(
    () =>
      validateAndHydrateDeck(payload, testCatalog(), {
        requiredSideboardCount: 10,
      }),
    (error) =>
      error instanceof DeckGenerationValidationError &&
      error.issues.some((issue) => issue.includes('exactly 10')),
  )

  payload.sideboard = Array.from({ length: 10 }, (_, index) => ({
    cardId: `TST_${String(index + 20).padStart(3, '0')}`,
    count: 1,
  }))
  const result = validateAndHydrateDeck(payload, testCatalog(), {
    requiredSideboardCount: 10,
  })

  assert.equal(result.deck.sideboard.length, 10)
})

test('validates a current SWUDB deck and rejects non-Premier second leaders', () => {
  const payload = validPayload()
  const swudbDeck = {
    metadata: { name: payload.name },
    leader: { id: payload.leaderId, count: 1 },
    secondleader: null,
    base: { id: payload.baseId, count: 1 },
    deck: payload.drawDeck.map(({ cardId, count }) => ({ id: cardId, count })),
    sideboard: [],
  }

  const result = validateAndHydrateSwudbDeck(swudbDeck, testCatalog())
  assert.equal(result.modelDeck.leaderId, 'TST_001')
  assert.equal(result.deck.drawDeck.length, 50)

  swudbDeck.secondleader = { id: 'TST_001', count: 1 }
  assert.throws(
    () => validateAndHydrateSwudbDeck(swudbDeck, testCatalog()),
    (error) =>
      error instanceof DeckGenerationValidationError &&
      error.issues.some((issue) => issue.includes('Premier decks only')),
  )
})
