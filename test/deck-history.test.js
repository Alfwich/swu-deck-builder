import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addDeckHistory,
  appendDeckHistory,
  deckHistoryEntryAt,
  deckHistoryShortcutDirection,
  initializeDeckHistories,
  moveDeckHistory,
  removeDeckHistory,
} from '../src/deck-history.js'

function deck(label) {
  return {
    leader: { id: `${label}-leader` },
    base: { id: `${label}-base` },
    drawDeck: [],
    sideboard: [],
  }
}

function record(id, label = id) {
  return { id, deck: deck(label) }
}

test('initializes every loaded deck independently at position zero', () => {
  const histories = initializeDeckHistories([
    record('one'),
    record('two'),
  ])

  assert.equal(histories.one.position, 0)
  assert.equal(histories.two.position, 0)
  assert.equal(histories.one.entries[0].label, 'Loaded deck')
  assert.equal(deckHistoryEntryAt(histories.two).deck.leader.id, 'two-leader')
})

test('appends snapshots without changing another deck history', () => {
  const histories = initializeDeckHistories([record('one'), record('two')])
  const nextDeck = deck('one-updated')
  const updated = appendDeckHistory(histories, {
    deckId: 'one',
    previousDeck: histories.one.entries[0].deck,
    nextDeck,
    label: 'Changed leader',
  })

  assert.equal(updated.one.position, 1)
  assert.equal(updated.one.entries[1].deck, nextDeck)
  assert.equal(updated.one.entries[1].label, 'Changed leader')
  assert.equal(updated.two, histories.two)
})

test('keeps forward history while navigating and truncates it after branching', () => {
  const initial = initializeDeckHistories([record('one')])
  const firstDeck = deck('first')
  const secondDeck = deck('second')
  const first = appendDeckHistory(initial, {
    deckId: 'one',
    previousDeck: initial.one.entries[0].deck,
    nextDeck: firstDeck,
    label: 'First change',
  })
  const second = appendDeckHistory(first, {
    deckId: 'one',
    previousDeck: firstDeck,
    nextDeck: secondDeck,
    label: 'Second change',
  })
  const rewound = moveDeckHistory(second, 'one', 1)

  assert.equal(rewound.one.position, 1)
  assert.equal(rewound.one.entries.length, 3)
  assert.equal(deckHistoryEntryAt(rewound.one).deck, firstDeck)

  const branchDeck = deck('branch')
  const branched = appendDeckHistory(rewound, {
    deckId: 'one',
    previousDeck: firstDeck,
    nextDeck: branchDeck,
    label: 'Branched change',
  })

  assert.equal(branched.one.position, 2)
  assert.deepEqual(
    branched.one.entries.map(({ label }) => label),
    ['Loaded deck', 'First change', 'Branched change'],
  )
  assert.equal(deckHistoryEntryAt(branched.one).deck, branchDeck)
})

test('clamps navigation and ignores equivalent deck snapshots', () => {
  const histories = initializeDeckHistories([record('one')])
  const equivalentDeck = structuredClone(histories.one.entries[0].deck)
  const unchanged = appendDeckHistory(histories, {
    deckId: 'one',
    previousDeck: histories.one.entries[0].deck,
    nextDeck: equivalentDeck,
    label: 'No change',
  })

  assert.equal(unchanged, histories)
  assert.equal(moveDeckHistory(histories, 'one', -20), histories)
  assert.equal(moveDeckHistory(histories, 'one', 20), histories)
})

test('adds and removes histories as decks enter and leave the session', () => {
  const initial = initializeDeckHistories([record('one')])
  const added = addDeckHistory(initial, record('two'), 'Imported deck')
  const removed = removeDeckHistory(added, 'one')

  assert.equal(added.two.position, 0)
  assert.equal(added.two.entries[0].label, 'Imported deck')
  assert.deepEqual(Object.keys(removed), ['two'])
})

test('reinitializing after an adopted database replaces all prior histories', () => {
  const initial = initializeDeckHistories([record('old')])
  const changed = appendDeckHistory(initial, {
    deckId: 'old',
    previousDeck: initial.old.entries[0].deck,
    nextDeck: deck('changed'),
    label: 'Changed old deck',
  })
  const restored = initializeDeckHistories(
    [record('new')],
    'Restored from Google Drive',
  )

  assert.equal(changed.old.entries.length, 2)
  assert.deepEqual(Object.keys(restored), ['new'])
  assert.equal(restored.new.position, 0)
  assert.equal(restored.new.entries[0].label, 'Restored from Google Drive')
})

test('recognizes common undo and redo keyboard shortcuts', () => {
  assert.equal(deckHistoryShortcutDirection({ key: 'z', ctrlKey: true }), -1)
  assert.equal(deckHistoryShortcutDirection({ key: 'Z', metaKey: true }), -1)
  assert.equal(
    deckHistoryShortcutDirection({ key: 'z', ctrlKey: true, shiftKey: true }),
    1,
  )
  assert.equal(deckHistoryShortcutDirection({ key: 'y', ctrlKey: true }), 1)
  assert.equal(deckHistoryShortcutDirection({ key: 'z' }), 0)
  assert.equal(
    deckHistoryShortcutDirection({ key: 'z', ctrlKey: true, altKey: true }),
    0,
  )
})
