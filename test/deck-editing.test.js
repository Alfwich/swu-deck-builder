import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addCardToDeck,
  addSecondLeaderToDeck,
  removeCardFromDeck,
  removeSecondLeaderFromDeck,
  replaceBaseInDeck,
  replaceLeaderInDeck,
} from '../src/deck-editing.js'

const card = { id: 'TST-001', name: 'One', subtitle: null }
const deck = {
  leader: { id: 'leader' },
  base: { id: 'base' },
  drawDeck: [card, { ...card }],
  sideboard: [],
}

test('manual edits add and remove one card without mutating the source deck', () => {
  const added = addCardToDeck(deck, 'sideboard', card)
  const removed = removeCardFromDeck(deck, 'drawDeck', card)

  assert.equal(added.sideboard.length, 1)
  assert.equal(removed.drawDeck.length, 1)
  assert.equal(deck.sideboard.length, 0)
  assert.equal(deck.drawDeck.length, 2)
})

test('manual edits reject required deck zones and stale cards', () => {
  assert.throws(() => addCardToDeck(deck, 'leader', card), /draw deck or sideboard/)
  assert.throws(
    () => removeCardFromDeck(deck, 'drawDeck', { ...card, id: 'missing' }),
    /no longer/,
  )
})

test('a leader can fill and leave the optional second-leader slot', () => {
  const leader = { id: 'leader-two', name: 'Two', type: 'Leader' }
  const added = addSecondLeaderToDeck(deck, leader)
  const removed = removeSecondLeaderFromDeck(added)

  assert.equal(added.secondLeader, leader)
  assert.equal(removed.secondLeader, null)
  assert.throws(() => addSecondLeaderToDeck(added, leader), /Remove the current/)
  assert.throws(() => addSecondLeaderToDeck(deck, card), /Only a leader/)
  assert.throws(
    () => addSecondLeaderToDeck({ ...deck, leader: null }, leader),
    /primary leader/,
  )
})

test('selecting a primary leader fills or replaces its permanent slot', () => {
  const first = { id: 'leader-one', name: 'One', type: 'Leader' }
  const second = { id: 'leader-two', name: 'Two', type: 'Leader' }
  const blank = { ...deck, leader: null }

  const filled = replaceLeaderInDeck(blank, first)
  const replaced = replaceLeaderInDeck(filled, second)

  assert.equal(filled.leader, first)
  assert.equal(replaced.leader, second)
  assert.equal(blank.leader, null)
  assert.throws(() => replaceLeaderInDeck(blank, card), /Only a leader/)
})

test('selecting a base swaps the existing base', () => {
  const base = { id: 'base-two', name: 'New Base', type: 'Base' }
  const updated = replaceBaseInDeck(deck, base)

  assert.equal(updated.base, base)
  assert.equal(deck.base.id, 'base')
  assert.throws(() => replaceBaseInDeck(deck, card), /Only a base/)

  const filled = replaceBaseInDeck({ ...deck, base: null }, base)
  assert.equal(filled.base, base)
})
