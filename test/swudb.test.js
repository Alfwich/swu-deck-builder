import assert from 'node:assert/strict'
import test from 'node:test'

import { serializeSwudbDeck } from '../src/integrations/swudb.js'

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
