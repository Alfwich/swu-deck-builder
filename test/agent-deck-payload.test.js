import assert from 'node:assert/strict'
import test from 'node:test'

import { serializeAgentChatTurn } from '../server/agent-deck-payload.mjs'

function deck(name, drawDeck = []) {
  return {
    name,
    leaderId: 'TST_001',
    secondLeaderId: null,
    baseId: 'TST_002',
    drawDeck,
    sideboard: [],
    summary: '',
  }
}

test('an initial chat turn loads the deck library and marks the selected deck authoritative', () => {
  const text = serializeAgentChatTurn(
    'Compare these decks.',
    deck('Selected deck', [{ id: 'TST_003', count: 2 }]),
    [
      { deckId: 'deck-one', deck: deck('Selected deck') },
      { deckId: 'deck-two', deck: deck('Other deck') },
    ],
  )

  assert.match(text, /Deck library snapshots loaded at the start of this session/)
  assert.match(text, /"deckId":"deck-two"/)
  assert.match(text, /"name":"Other deck"/)
  assert.match(text, /Currently visible deck \(authoritative for this turn\)/)
  assert.match(text, /"drawDeck":2/)
})

test('later chat turns omit the deck library section', () => {
  const text = serializeAgentChatTurn(
    'Review this.',
    deck('Selected deck'),
    [],
    {
      revision: 4,
      cards: [{ cardId: 'TST_003', count: 2 }],
    },
  )

  assert.doesNotMatch(text, /Deck library snapshots/)
  assert.match(text, /Currently visible deck/)
  assert.match(text, /Player card collection \(authoritative for this turn/)
  assert.match(text, /"revision":4/)
  assert.match(text, /"cardId":"TST_003","count":2/)
})
