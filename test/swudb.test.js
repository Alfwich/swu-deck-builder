import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseSwudbDeck,
  serializeSwudbDeck,
} from '../src/integrations/swudb.js'

function card(setCode, cardNumber, name) {
  return { setCode, cardNumber, name }
}

function deckWith(drawCard) {
  return {
    leader: card('LAW', '1', 'Leader'),
    base: card('IBH', '54', 'Base'),
    drawDeck: Array.from({ length: 50 }, () => drawCard),
  }
}

function importCatalog() {
  return {
    database: {
      sets: {
        TEST: {
          cards: [
            {
              Set: 'LAW',
              Number: '001',
              Name: 'First Leader',
              Type: 'Leader',
              VariantType: 'Normal',
            },
            {
              Set: 'ASH',
              Number: '007',
              Name: 'Second Leader',
              Type: 'Leader',
              VariantType: 'Normal',
            },
            {
              Set: 'IBH',
              Number: '54',
              Name: 'Base',
              Type: 'Base',
              VariantType: 'Normal',
            },
            {
              Set: 'TS26',
              Number: '58',
              Name: 'Draw Card',
              Type: 'Unit',
              VariantType: 'Normal',
            },
            {
              Set: 'SOR',
              Number: '7',
              Name: 'Sideboard Card',
              Type: 'Event',
              VariantType: 'Normal',
            },
            {
              Set: 'SHD',
              Number: '027F',
              Name: 'Noncanonical Printing',
              Type: 'Base',
              VariantType: 'Normal',
            },
          ],
        },
      },
    },
  }
}

test('preserves SWUDB three-digit IDs for standard and IBH cards', () => {
  const payload = serializeSwudbDeck(deckWith(card('LAW', '34', 'Card')))

  assert.equal(payload.leader.id, 'LAW_001')
  assert.equal(payload.base.id, 'IBH_054')
  assert.equal(payload.deck[0].id, 'LAW_034')
})

test('exports TS26 card numbers without leading zeroes', () => {
  const payload = serializeSwudbDeck(
    deckWith(card('TS26', '058', 'Backed by the Pykes')),
  )

  assert.equal(payload.deck[0].id, 'TS26_58')
})

test('exports a generated sideboard when present', () => {
  const deck = deckWith(card('LAW', '34', 'Draw card'))
  deck.sideboard = [
    card('SOR', '7', 'Sideboard card'),
    card('SOR', '7', 'Sideboard card'),
  ]

  const payload = serializeSwudbDeck(deck)

  assert.deepEqual(payload.sideboard, [{ id: 'SOR_007', count: 2 }])
})

test('imports fenced SWUDB JSON with metadata, second leader, and sideboard', () => {
  const source = `\`\`\`json
  ${JSON.stringify({
    metadata: { name: 'Imported deck', author: 'Test Author' },
    leader: { id: 'LAW_001', count: 1 },
    secondleader: { id: 'ASH_007', count: 1 },
    base: { id: 'IBH_054', count: 1 },
    deck: [{ id: 'TS26_58', count: 50 }],
    sideboard: [{ id: 'SOR_007', count: 2 }],
  })}
  \`\`\``

  const imported = parseSwudbDeck(source, importCatalog())
  const exported = serializeSwudbDeck(imported.deck, {
    name: imported.name,
  })

  assert.equal(imported.name, 'Imported deck')
  assert.equal(imported.deck.secondLeader.name, 'Second Leader')
  assert.equal(imported.deck.drawDeck.length, 50)
  assert.equal(imported.deck.sideboard.length, 2)
  assert.equal(exported.metadata.author, 'Test Author')
  assert.equal(exported.secondleader.id, 'ASH_007')
  assert.deepEqual(exported.deck, [{ id: 'TS26_58', count: 50 }])
})

test('imports and exports a draw deck larger than 50 cards', () => {
  const source = JSON.stringify({
    metadata: { name: 'Large deck' },
    leader: { id: 'LAW_001', count: 1 },
    base: { id: 'IBH_054', count: 1 },
    deck: [{ id: 'TS26_58', count: 51 }],
    sideboard: [],
  })

  const imported = parseSwudbDeck(source, importCatalog())
  const exported = serializeSwudbDeck(imported.deck, { name: imported.name })

  assert.equal(imported.deck.drawDeck.length, 51)
  assert.deepEqual(exported.deck, [{ id: 'TS26_58', count: 51 }])
})

test('imports and exports a structurally valid 30-card deck', () => {
  const source = JSON.stringify({
    metadata: { name: 'Limited deck' },
    leader: { id: 'LAW_001', count: 1 },
    base: { id: 'IBH_054', count: 1 },
    deck: [{ id: 'TS26_58', count: 30 }],
    sideboard: [],
  })

  const imported = parseSwudbDeck(source, importCatalog())
  const exported = serializeSwudbDeck(imported.deck, { name: imported.name })

  assert.equal(imported.deck.drawDeck.length, 30)
  assert.deepEqual(exported.deck, [{ id: 'TS26_58', count: 30 }])
})

test('rejects unknown cards without replacing them with a partial match', () => {
  const source = JSON.stringify({
    metadata: { name: 'Broken import' },
    leader: { id: 'LAW_001', count: 1 },
    base: { id: 'IBH_054', count: 1 },
    deck: [{ id: 'TS26_999', count: 50 }],
    sideboard: [],
  })

  assert.throws(
    () => parseSwudbDeck(source, importCatalog()),
    /Unable to find card TS26_999/,
  )
})

test('requires a structurally valid draw deck with at least 30 cards', () => {
  const source = JSON.stringify({
    metadata: { name: 'Incomplete import' },
    leader: { id: 'LAW_001', count: 1 },
    base: { id: 'IBH_054', count: 1 },
    deck: [{ id: 'TS26_58', count: 29 }],
    sideboard: [],
  })

  assert.throws(
    () => parseSwudbDeck(source, importCatalog()),
    /contains 29 cards; at least 30 are required/,
  )
})

test('can serialize an incomplete work-in-progress deck for AI editing', () => {
  const workInProgress = deckWith(card('TS26', '58', 'Draw card'))
  workInProgress.drawDeck = []

  const payload = serializeSwudbDeck(workInProgress, {
    minimumDrawDeckSize: 0,
  })

  assert.deepEqual(payload.deck, [])
})
