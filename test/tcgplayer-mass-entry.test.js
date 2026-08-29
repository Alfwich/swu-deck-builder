import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TCGPLAYER_MASS_ENTRY_URL,
  createTcgplayerMassEntry,
} from '../src/integrations/tcgplayer.js'

function card(id, name, subtitle, type, setCode, cardNumber) {
  return { id, name, subtitle, type, setCode, cardNumber }
}

const leader = card('SOR-005', 'Luke Skywalker', 'Faithful Friend', 'Leader', 'sor', '005')
const base = card('SOR-029', 'Administrator’s Tower', null, 'Base', 'SOR', '029')
const unit = card('SOR-051', 'Luke Skywalker', 'Jedi Knight', 'Unit', 'SOR', '051')
const unitReprint = card('SEC-051', 'Luke Skywalker', 'Jedi Knight', 'Unit', 'SEC', '051')
const event = card('SOR-058', '  Make   an Opening ', null, 'Event', 'SOR', '058')

const deck = {
  leader,
  secondLeader: null,
  base,
  drawDeck: [unit, unitReprint, unit],
  sideboard: [event],
}

test('formats purchasable deck cards for TCGplayer Mass Entry', () => {
  assert.equal(
    createTcgplayerMassEntry(deck),
    [
      '3 Luke Skywalker - Jedi Knight [SOR]',
      '1 Make an Opening [SOR]',
    ].join('\n'),
  )
})

test('sorts entries alphabetically instead of preserving deck order', () => {
  assert.equal(
    createTcgplayerMassEntry({
      drawDeck: [event, unit],
      sideboard: [],
    }),
    [
      '1 Luke Skywalker - Jedi Knight [SOR]',
      '1 Make an Opening [SOR]',
    ].join('\n'),
  )
})

test('missing-only entries subtract owned equivalent printings', () => {
  const cardsById = new Map([
    ['SOR_005', leader],
    ['SEC_051', unitReprint],
  ])
  const collection = {
    revision: 3,
    cards: [
      { cardId: 'SOR_005', count: 1 },
      { cardId: 'SEC_051', count: 2 },
    ],
  }

  assert.equal(
    createTcgplayerMassEntry(deck, {
      collection,
      cardsById,
      missingOnly: true,
    }),
    [
      '1 Luke Skywalker - Jedi Knight [SOR]',
      '1 Make an Opening [SOR]',
    ].join('\n'),
  )
})

test('missing-only entries are empty when the library covers the deck', () => {
  const cardsById = new Map([
    ['SOR_005', leader],
    ['SOR_029', base],
    ['SEC_051', unitReprint],
    ['SOR_058', event],
  ])
  const collection = {
    revision: 4,
    cards: [
      { cardId: 'SEC_051', count: 3 },
      { cardId: 'SOR_058', count: 1 },
    ],
  }

  assert.equal(
    createTcgplayerMassEntry(deck, {
      collection,
      cardsById,
      missingOnly: true,
    }),
    '',
  )
})

test('opens Mass Entry with Star Wars Unlimited preselected', () => {
  const url = new URL(TCGPLAYER_MASS_ENTRY_URL)

  assert.equal(url.origin + url.pathname, 'https://www.tcgplayer.com/massentry')
  assert.equal(url.searchParams.get('productline'), 'Star Wars Unlimited')
})
