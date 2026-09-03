import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STARTER_DECK_SOURCE,
  STARTER_DECK_STORAGE_KEY,
  createInitialDeck,
  createStarterDeck,
  hasSeenStarterDeck,
  markStarterDeckSeen,
} from '../src/web/decks/starter-deck.js'

function createMemoryStorage() {
  const values = new Map()

  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
  }
}

function createCatalogForStarterDeck() {
  const source = JSON.parse(STARTER_DECK_SOURCE)
  const cards = [source.leader, source.base, ...source.deck]
  const sets = {}

  for (const { id } of cards) {
    const [setCode, number] = id.split('_')
    sets[setCode] ??= { cards: [] }
    sets[setCode].cards.push({
      FrontArt: `https://example.test/${id}.png`,
      Name: id,
      Number: number,
      Set: setCode,
      Type: id === source.leader.id ? 'Leader' : id === source.base.id ? 'Base' : 'Unit',
    })
  }

  return { database: { sets } }
}

test('starter deck definition contains the expected card totals', () => {
  const source = JSON.parse(STARTER_DECK_SOURCE)

  assert.equal(source.deck.reduce((total, entry) => total + entry.count, 0), 50)
  assert.equal(source.sideboard.length, 0)
  assert.equal(source.metadata.name, 'Grievous Starter')
  assert.equal(source.metadata.author, 'Force Table')
})

test('starter deck resolves through the SWUDB importer', () => {
  const starterDeck = createStarterDeck(createCatalogForStarterDeck())

  assert.equal(starterDeck.name, 'Grievous Starter')
  assert.equal(starterDeck.deck.leader.setCode, 'TWI')
  assert.equal(starterDeck.deck.leader.cardNumber, '015')
  assert.equal(starterDeck.deck.base.setCode, 'TWI')
  assert.equal(starterDeck.deck.base.cardNumber, '023')
  assert.equal(starterDeck.deck.drawDeck.length, 50)
  assert.equal(starterDeck.deck.sideboard.length, 0)
  assert.equal(starterDeck.deck.metadata.author, 'Force Table')
})

test('initial deck is seeded once and later empty libraries receive a blank deck', () => {
  const storage = createMemoryStorage()
  const catalog = createCatalogForStarterDeck()

  assert.equal(hasSeenStarterDeck(storage), false)

  const firstDeck = createInitialDeck(catalog, storage)
  assert.equal(firstDeck.kind, 'imported')
  assert.equal(firstDeck.name, 'Grievous Starter')
  assert.equal(storage.getItem(STARTER_DECK_STORAGE_KEY), '1')

  const laterDeck = createInitialDeck({}, storage)
  assert.equal(laterDeck.kind, 'saved')
  assert.equal(laterDeck.name, 'New deck')
  assert.deepEqual(laterDeck.deck, {
    leader: null,
    secondLeader: null,
    base: null,
    drawDeck: [],
    sideboard: [],
  })
})

test('existing users can be marked without creating or replacing a deck', () => {
  const storage = createMemoryStorage()

  markStarterDeckSeen(storage)

  assert.equal(hasSeenStarterDeck(storage), true)
  assert.equal(storage.getItem(STARTER_DECK_STORAGE_KEY), '1')
})
