import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDeckAspectHydrator,
  generateRandomDeck,
  groupDeckCards,
  toDeckCard,
} from '../src/catalog.js'

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
    ...Array.from({ length: 40 }, (_, index) =>
      sourceCard('Unit', index + 3, `Unit ${index + 1}`),
    ),
  ]

  return {
    database: {
      sets: {
        TST: { cards },
      },
    },
  }
}

test('generates a 50-card random deck with a separate 10-card sideboard', () => {
  const deck = generateRandomDeck(testCatalog())
  const drawCardNames = new Set(deck.drawDeck.map((card) => card.name))

  assert.equal(deck.drawDeck.length, 50)
  assert.equal(deck.sideboard.length, 10)
  assert.equal(new Set(deck.sideboard.map((card) => card.name)).size, 10)
  assert.ok(deck.sideboard.every((card) => !drawCardNames.has(card.name)))
  assert.ok(groupDeckCards(deck.drawDeck).every((group) => group.count <= 3))
})

test('hydrates aspect metadata into decks saved before aspects were persisted', () => {
  const catalog = testCatalog()
  const [leaderSource, baseSource] = catalog.database.sets.TST.cards
  leaderSource.Aspects = ['Cunning', 'Villainy']
  baseSource.Aspects = ['Command']
  const leader = toDeckCard(leaderSource)
  const base = toDeckCard(baseSource)
  delete leader.aspects
  delete base.aspects

  const hydrateDeck = createDeckAspectHydrator(catalog)
  const hydrated = hydrateDeck({ leader, base, drawDeck: [], sideboard: [] })

  assert.deepEqual(hydrated.leader.aspects, ['Cunning', 'Villainy'])
  assert.deepEqual(hydrated.base.aspects, ['Command'])
})
