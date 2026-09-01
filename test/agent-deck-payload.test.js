import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compactAgentCardGroups,
  serializeAgentChatTurn,
} from '../server/agent-deck-payload.mjs'

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
    deck('Selected deck', [{ cardId: 'TST_003', count: 2 }]),
    [
      { deckId: 'deck-one', deck: deck('Selected deck') },
      { deckId: 'deck-two', deck: deck('Other deck') },
    ],
  )

  assert.match(text, /Deck library snapshots loaded at the start of this session/)
  assert.match(text, /Card group notation/)
  assert.match(text, /"deckId":"deck-two"/)
  assert.match(text, /"name":"Other deck"/)
  assert.match(text, /Currently visible deck \(authoritative for this turn\)/)
  assert.match(text, /"drawDeck":\{"TST":\[\[3,2\]\]\}/)
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
  assert.match(text, /Resolve through the catalog and output exact catalog IDs/)
  assert.match(text, /Player card collection \(authoritative for this turn/)
  assert.match(text, /"TST":\[\[3,2\]\]/)
  assert.doesNotMatch(text, /"revision":4/)
  assert.doesNotMatch(text, /"cardId":"TST_003"/)
})

test('later chat turns replace an unchanged collection with a continuation marker', () => {
  const text = serializeAgentChatTurn(
    'Review this again.',
    deck('Selected deck'),
    [],
    {
      revision: 4,
      cards: [{ cardId: 'TST_003', count: 2 }],
    },
    { includeCollection: false },
  )

  assert.match(text, /Player card collection: unchanged from the most recent/)
  assert.doesNotMatch(text, /"revision":4/)
  assert.doesNotMatch(text, /"cardId":"TST_003"/)
})

test('chat turns describe collection additions relative to deck checkpoints', () => {
  const collectionContext = {
    currentDeck: {
      fromRevision: 2,
      throughRevision: 3,
      historyAvailable: true,
      additions: [{ cardId: 'TST_004', count: 2 }],
      removals: [],
    },
    decks: [
      {
        deckId: 'deck-one',
        fromRevision: 2,
        throughRevision: 3,
        historyAvailable: true,
        additions: [{ cardId: 'TST_004', count: 2 }],
        removals: [],
      },
    ],
  }
  const text = serializeAgentChatTurn(
    'Did I get anything useful?',
    deck('Selected deck'),
    [],
    { revision: 3, cards: [{ cardId: 'TST_004', count: 2 }] },
    { collectionContext, includeCollection: true },
  )

  assert.match(text, /Collection changes relative to each deck/)
  assert.match(text, /"deckId":"deck-one"/)
  assert.match(text, /"cardId":"TST_004","count":2/)
})

test('compact card groups sort sets and numbers while preserving quantities', () => {
  assert.deepEqual(
    compactAgentCardGroups([
      { cardId: 'TS26_58', count: 1 },
      { cardId: 'ASH_057', count: 1 },
      { cardId: 'ASH_056', count: 2 },
      { cardId: 'ASH_56', count: 1 },
    ]),
    {
      ASH: [[56, 3], [57, 1]],
      TS26: [[58, 1]],
    },
  )
})

test('compact card groups fall back without losing unsupported IDs', () => {
  const entries = [
    { cardId: 'ASH_056', count: 2 },
    { cardId: 'PRM_A1', count: 1 },
  ]

  assert.deepEqual(compactAgentCardGroups(entries), entries)
})

test('compact card groups materially reduce representative payload size', () => {
  const entries = Array.from({ length: 50 }, (_, index) => ({
    cardId: `ASH_${String(index + 1).padStart(3, '0')}`,
    count: (index % 3) + 1,
  }))
  const legacy = JSON.stringify({ revision: 1, cards: entries })
  const compact = JSON.stringify(compactAgentCardGroups(entries))

  assert.ok(compact.length < legacy.length * 0.3)
})
