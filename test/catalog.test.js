import assert from 'node:assert/strict'
import test from 'node:test'

import { generateRandomDeck, groupDeckCards } from '../src/catalog.js'

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
