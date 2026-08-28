import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCatalogCardReferenceIndex,
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

test('hydrates aspect metadata throughout decks saved before aspects were persisted', () => {
  const catalog = testCatalog()
  const [leaderSource, baseSource, drawSource, sideboardSource] =
    catalog.database.sets.TST.cards
  leaderSource.Aspects = ['Cunning', 'Villainy']
  baseSource.Aspects = ['Command']
  drawSource.Aspects = ['Aggression']
  sideboardSource.Aspects = ['Vigilance', 'Heroism']
  const leader = toDeckCard(leaderSource)
  const base = toDeckCard(baseSource)
  const drawCard = toDeckCard(drawSource)
  const sideboardCard = toDeckCard(sideboardSource)
  delete leader.aspects
  delete base.aspects
  delete drawCard.aspects
  delete sideboardCard.aspects
  drawCard.id = 'legacy-draw-card-id'

  const hydrateDeck = createDeckAspectHydrator(catalog)
  const hydrated = hydrateDeck({
    leader,
    base,
    drawDeck: [drawCard],
    sideboard: [sideboardCard],
  })

  assert.deepEqual(hydrated.leader.aspects, ['Cunning', 'Villainy'])
  assert.deepEqual(hydrated.base.aspects, ['Command'])
  assert.deepEqual(hydrated.drawDeck[0].aspects, ['Aggression'])
  assert.deepEqual(hydrated.sideboard[0].aspects, ['Vigilance', 'Heroism'])
})

test('card reference index resolves catalog IDs to normal-printing CDN art', () => {
  const catalog = testCatalog()
  catalog.database.sets.TST.cards.push({
    ...sourceCard('Unit', 3, 'Unit 1'),
    VariantType: 'Hyperspace',
    FrontArt: 'https://example.invalid/hyperspace.jpg',
  })

  const index = createCatalogCardReferenceIndex(catalog)

  assert.equal(index.get('TST_003').name, 'Unit 1')
  assert.equal(index.get('TST_003').url, 'https://example.invalid/3.jpg')
})
