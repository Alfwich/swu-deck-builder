import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DRAW_DECK_SIZE_RULES,
  DeckGenerationValidationError,
  validateAndHydrateDeck,
  validateAndHydrateSwudbDeck,
} from '../src/server/deck-validation.js'
import { createAgentCatalog } from '../src/server/catalog.js'

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
    sourceCard('Leader', 30, 'Second Leader'),
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

test('accepts a Premier draw deck larger than 50 cards', () => {
  const payload = validPayload()
  payload.drawDeck.at(-1).count = 3

  const result = validateAndHydrateDeck(payload, testCatalog(), {
    drawDeckSizeRule: DRAW_DECK_SIZE_RULES.premier,
  })

  assert.equal(result.deck.drawDeck.length, 51)
})

test('supports explicit minimum and optional maximum draw-deck rules', () => {
  const payload = validPayload()
  payload.drawDeck = payload.drawDeck.slice(0, 10).map((entry) => ({
    ...entry,
    count: 3,
  }))

  const structuralResult = validateAndHydrateDeck(payload, testCatalog())
  assert.equal(structuralResult.deck.drawDeck.length, 30)

  payload.drawDeck = validPayload().drawDeck
  payload.drawDeck.at(-1).count = 3
  assert.throws(
    () =>
      validateAndHydrateDeck(payload, testCatalog(), {
        drawDeckSizeRule: {
          ...DRAW_DECK_SIZE_RULES.structural,
          maximum: 50,
        },
      }),
    (error) =>
      error instanceof DeckGenerationValidationError &&
      error.issues.some((issue) => issue.includes('at most 50')),
  )
})

test('supports unrestricted work-in-progress deck zones', () => {
  const payload = validPayload()
  payload.drawDeck = []
  payload.sideboard = []

  const result = validateAndHydrateDeck(payload, testCatalog(), {
    drawDeckSizeRule: DRAW_DECK_SIZE_RULES.unrestricted,
    maximumSideboardCount: null,
    enforceCopyLimits: false,
  })

  assert.deepEqual(result.deck.drawDeck, [])
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
      error.issues.some((issue) => issue.includes('at least 30')),
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

test('validates a current SWUDB deck and optionally supports a second leader', () => {
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

  swudbDeck.deck.at(-1).count = 3
  const oversizedResult = validateAndHydrateSwudbDeck(swudbDeck, testCatalog())
  assert.equal(oversizedResult.deck.drawDeck.length, 51)

  swudbDeck.deck = validPayload().drawDeck.slice(0, 16)
  assert.throws(
    () => validateAndHydrateSwudbDeck(swudbDeck, testCatalog()),
    (error) =>
      error instanceof DeckGenerationValidationError &&
      error.issues.some((issue) => issue.includes('at least 50')),
  )

  swudbDeck.deck = validPayload().drawDeck.map(({ cardId, count }) => ({
    id: cardId,
    count,
  }))
  swudbDeck.secondleader = { id: 'TST_030', count: 1 }
  assert.throws(
    () => validateAndHydrateSwudbDeck(swudbDeck, testCatalog()),
    (error) =>
      error instanceof DeckGenerationValidationError &&
      error.issues.some((issue) => issue.includes('secondLeaderId to be null')),
  )

  const twinLeaderResult = validateAndHydrateSwudbDeck(
    swudbDeck,
    testCatalog(),
    {
      drawDeckSizeRule: DRAW_DECK_SIZE_RULES.unrestricted,
      allowSecondLeader: true,
    },
  )
  assert.equal(twinLeaderResult.modelDeck.secondLeaderId, 'TST_030')
  assert.equal(twinLeaderResult.deck.secondLeader.name, 'Second Leader')
})

test('accepts missing primary identities only for editable work in progress', () => {
  const blank = {
    metadata: { name: 'New deck' },
    leader: null,
    secondleader: null,
    base: null,
    deck: [],
    sideboard: [],
  }

  assert.throws(
    () => validateAndHydrateSwudbDeck(blank, testCatalog()),
    /did not pass validation/,
  )

  const result = validateAndHydrateSwudbDeck(blank, testCatalog(), {
    drawDeckSizeRule: DRAW_DECK_SIZE_RULES.unrestricted,
    enforceCopyLimits: false,
    allowSecondLeader: true,
    allowMissingIdentities: true,
  })

  assert.equal(result.modelDeck.leaderId, null)
  assert.equal(result.modelDeck.baseId, null)
  assert.equal(result.deck.leader, null)
  assert.equal(result.deck.base, null)
})

test('accepts padded SWUDB aliases for source sets with unpadded card numbers', () => {
  const cards = [
    { ...sourceCard('Leader', 1, 'Leader'), Set: 'IBH', Number: '1' },
    { ...sourceCard('Base', 2, 'Base'), Set: 'IBH', Number: '2' },
    { ...sourceCard('Unit', 83, 'E-Web Gunner'), Set: 'IBH', Number: '83' },
    { ...sourceCard('Unit', 87, 'Snowtrooper'), Set: 'IBH', Number: '87' },
  ]
  const catalog = createAgentCatalog({
    schemaVersion: 1,
    sets: { IBH: { cards } },
  })
  const result = validateAndHydrateSwudbDeck(
    {
      metadata: { name: 'IBH aliases' },
      leader: { id: 'IBH_001', count: 1 },
      secondleader: null,
      base: { id: 'IBH_002', count: 1 },
      deck: [{ id: 'IBH_083', count: 1 }],
      sideboard: [{ id: 'IBH_087', count: 1 }],
    },
    catalog,
    {
      drawDeckSizeRule: DRAW_DECK_SIZE_RULES.unrestricted,
      enforceCopyLimits: false,
    },
  )

  assert.equal(result.deck.drawDeck[0].name, 'E-Web Gunner')
  assert.equal(result.deck.sideboard[0].name, 'Snowtrooper')
  assert.equal(result.modelDeck.leaderId, 'IBH_1')
  assert.deepEqual(result.modelDeck.drawDeck, [
    { cardId: 'IBH_83', count: 1 },
  ])
  assert.deepEqual(result.modelDeck.sideboard, [
    { cardId: 'IBH_87', count: 1 },
  ])
})
