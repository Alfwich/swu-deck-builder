import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addDeckHistory,
  appendPersistentDeckHistory,
  appendDeckHistory,
  createDeckHistoryVisualStack,
  createPersistentDeckHistory,
  deckHistoryEntryAt,
  deckHistoryShortcutDirection,
  decksHaveSameState,
  hydratePersistentDeckHistoryEntryAt,
  hydratePersistentDeckHistory,
  initializeDeckHistories,
  moveDeckHistory,
  movePersistentDeckHistory,
  normalizePersistentDeckHistory,
  persistentDeckHistoryFutureCount,
  removeDeckHistory,
} from '../src/deck-history.js'

test('persistent history retains every delta without a fixed event limit', () => {
  let previousDeck = { ...deck('start'), drawDeck: [] }
  let history = createPersistentDeckHistory(previousDeck)

  for (let revision = 1; revision <= 55; revision += 1) {
    const nextDeck = {
      ...previousDeck,
      drawDeck: [{ id: `card-${revision}` }],
    }
    history = appendPersistentDeckHistory(history, {
      previousDeck,
      nextDeck,
      label: `Change ${revision}`,
      changedAt: `2026-08-${String((revision % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
    })
    previousDeck = nextDeck
  }

  assert.equal(history.revision, 55)
  assert.equal(history.entries.length, 56)
  assert.equal(history.entries[0].revision, 0)
  assert.equal(history.entries.at(-1).revision, 55)
  assert.equal(history.position, 55)
  assert.ok(history.entries[0].snapshot)
  assert.deepEqual(history.entries.at(-1).delta, {
    drawDeck: [['card-54', -1], ['card-55', 1]],
  })
  assert.equal(history.entries.at(-1).deck, undefined)
})

test('persistent history filters zero deltas and branches monotonically', () => {
  const firstCard = { id: 'first' }
  const secondCard = { id: 'second' }
  const startingDeck = { ...deck('start'), drawDeck: [] }
  const firstDeck = { ...startingDeck, drawDeck: [firstCard, secondCard] }
  const reorderedDeck = { ...startingDeck, drawDeck: [secondCard, firstCard] }
  const secondDeck = { ...startingDeck, drawDeck: [secondCard] }
  let history = createPersistentDeckHistory(
    startingDeck,
    { historyId: 'collection', revision: 1 },
  )
  history = appendPersistentDeckHistory(history, {
    collectionCheckpoint: { historyId: 'collection', revision: 2 },
    previousDeck: startingDeck,
    nextDeck: firstDeck,
    label: 'First change',
    changedAt: '2026-08-01T12:00:00.000Z',
  })
  const unchanged = appendPersistentDeckHistory(history, {
    previousDeck: firstDeck,
    nextDeck: reorderedDeck,
    label: 'Reordered only',
  })
  assert.equal(unchanged.revision, 1)
  assert.equal(decksHaveSameState(firstDeck, reorderedDeck), true)

  history = appendPersistentDeckHistory(history, {
    previousDeck: firstDeck,
    nextDeck: secondDeck,
    label: 'Second change',
    changedAt: '2026-08-02T12:00:00.000Z',
  })
  history = movePersistentDeckHistory(history, 1)
  assert.equal(persistentDeckHistoryFutureCount(history), 1)
  history = appendPersistentDeckHistory(history, {
    previousDeck: firstDeck,
    nextDeck: startingDeck,
    label: 'Branched change',
    changedAt: '2026-08-03T12:00:00.000Z',
  })

  assert.deepEqual(history.entries.map(({ revision }) => revision), [0, 1, 3])
  assert.equal(persistentDeckHistoryFutureCount(history), 0)
  assert.equal(history.entries.at(-1).parentRevision, 1)
  assert.deepEqual(history.entries[0].collectionCheckpoint, {
    historyId: 'collection',
    revision: 1,
  })
})

test('legacy full snapshots migrate to deltas and reconstruct on demand', () => {
  const leader = { id: 'leader' }
  const base = { id: 'base' }
  const card = { id: 'card' }
  const firstDeck = {
    leader,
    secondLeader: null,
    base,
    drawDeck: [card],
    sideboard: [],
  }
  const secondDeck = { ...firstDeck, drawDeck: [card, card] }
  const snapshots = [firstDeck, secondDeck].map((candidate) => ({
    leader: candidate.leader.id,
    secondLeader: null,
    base: candidate.base.id,
    drawDeck: [{ id: 'card', count: candidate.drawDeck.length }],
    sideboard: [],
  }))
  const legacy = {
    historyId: 'legacy-history',
    revision: 1,
    position: 1,
    entries: [
      {
        revision: 0,
        parentRevision: null,
        changedAt: null,
        label: 'Loaded deck',
        deck: snapshots[0],
      },
      {
        revision: 1,
        parentRevision: 0,
        changedAt: '2026-09-01T12:00:00.000Z',
        label: 'Added a card',
        deck: snapshots[1],
      },
    ],
  }

  const history = normalizePersistentDeckHistory(legacy, secondDeck)
  const restored = hydratePersistentDeckHistoryEntryAt(
    history,
    1,
    new Map([['leader', leader], ['base', base], ['card', card]]),
  )

  assert.equal(history.format, 2)
  assert.deepEqual(history.entries[1].delta, { drawDeck: [['card', 1]] })
  assert.equal(history.entries[1].deck, undefined)
  assert.equal(restored.deck.drawDeck.length, 2)
})

test('persistent history restores stacked visuals and modal details', () => {
  const card = {
    id: 'SHD-126',
    setCode: 'SHD',
    cardNumber: '126',
    name: 'The Darksaber',
    subtitle: null,
    type: 'Upgrade',
    url: '/darksaber.png',
  }
  const startingDeck = { ...deck('start'), drawDeck: [] }
  const nextDeck = { ...startingDeck, drawDeck: [card, card] }
  let history = createPersistentDeckHistory(startingDeck)
  history = appendPersistentDeckHistory(history, {
    previousDeck: startingDeck,
    nextDeck,
    label: 'Added two cards',
    changedAt: '2026-09-01T12:00:00.000Z',
    visual: {
      card,
      kind: 'addition',
      count: 2,
      cards: [
        { card, kind: 'addition' },
        { card, kind: 'addition' },
      ],
      details: {
        name: null,
        replacements: [],
        removals: [],
        additions: [{
          id: 'SHD_126',
          zone: 'drawDeck',
          zoneLabel: 'Draw deck',
          count: 2,
          card,
        }],
      },
    },
  })
  const cardsById = new Map([
    ['SHD_126', card],
    ['start-leader', startingDeck.leader],
    ['start-base', startingDeck.base],
  ])
  const restored = normalizePersistentDeckHistory(
    JSON.parse(JSON.stringify(history)),
    nextDeck,
    null,
    { cardsById, strict: true },
  )
  const visual = hydratePersistentDeckHistory(restored, cardsById)
    .entries[1].visual

  assert.equal(visual.cards.length, 2)
  assert.equal(visual.card.url, '/darksaber.png')
  assert.equal(visual.details.additions[0].card.name, 'The Darksaber')
})

test('history visuals represent multi-card changes with a three-card stack', () => {
  const addition = {
    card: { id: 'addition', url: '/addition.png' },
    kind: 'addition',
    count: 2,
  }
  const replacement = {
    card: { id: 'replacement', url: '/replacement.png' },
    kind: 'replacement',
    count: 1,
  }
  const removal = {
    card: { id: 'removal', url: '/removal.png' },
    kind: 'removal',
    count: 2,
  }

  const visual = createDeckHistoryVisualStack([
    addition,
    replacement,
    removal,
  ])

  assert.equal(visual.count, 5)
  assert.equal(visual.kind, 'mixed')
  assert.deepEqual(
    visual.cards.map(({ card, kind }) => [card.id, kind]),
    [
      ['addition', 'addition'],
      ['replacement', 'replacement'],
      ['removal', 'removal'],
    ],
  )
})

test('history visuals repeat one card when several copies changed', () => {
  const visual = createDeckHistoryVisualStack([
    {
      card: { id: 'copies', url: '/copies.png' },
      kind: 'addition',
      count: 3,
    },
  ])

  assert.equal(visual.cards.length, 3)
  assert.deepEqual(
    visual.cards.map(({ card }) => card.id),
    ['copies', 'copies', 'copies'],
  )
})

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
  assert.equal(deckHistoryEntryAt(histories.two).deck, undefined)
})

test('appends snapshots without changing another deck history', () => {
  const histories = initializeDeckHistories([record('one'), record('two')])
  const previousDeck = deck('one')
  const nextDeck = deck('one-updated')
  const visual = {
    card: { id: 'one-card', name: 'One Card', url: '/one-card.png' },
    kind: 'addition',
  }
  const updated = appendDeckHistory(histories, {
    deckId: 'one',
    previousDeck,
    nextDeck,
    label: 'Changed leader',
    visual,
  })

  assert.equal(updated.one.position, 1)
  assert.equal(updated.one.entries[1].deck, undefined)
  assert.equal(updated.one.entries[1].label, 'Changed leader')
  assert.equal(updated.one.entries[1].visual, visual)
  assert.equal(updated.two, histories.two)
})

test('keeps forward history while navigating and truncates it after branching', () => {
  const initial = initializeDeckHistories([record('one')])
  const startingDeck = deck('one')
  const firstDeck = deck('first')
  const secondDeck = deck('second')
  const first = appendDeckHistory(initial, {
    deckId: 'one',
    previousDeck: startingDeck,
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
  assert.equal(deckHistoryEntryAt(rewound.one).label, 'First change')

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
  assert.equal(deckHistoryEntryAt(branched.one).label, 'Branched change')
})

test('clamps navigation and ignores equivalent deck snapshots', () => {
  const histories = initializeDeckHistories([record('one')])
  const previousDeck = deck('one')
  const equivalentDeck = structuredClone(previousDeck)
  const unchanged = appendDeckHistory(histories, {
    deckId: 'one',
    previousDeck,
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
  const previousDeck = deck('old')
  const changed = appendDeckHistory(initial, {
    deckId: 'old',
    previousDeck,
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
