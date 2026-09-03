import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createLocalDeckStore,
  validateLocalDeckSnapshot,
} from '../server/local-deck-store.mjs'

function deckRecord(id, name = id, collectionCheckpoint = null) {
  return {
    id,
    name,
    kind: 'saved',
    deck: {
      leader: null,
      secondLeader: null,
      base: null,
      drawDeck: [],
      sideboard: [],
    },
    collectionCheckpoint,
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:00:00.000Z',
  }
}

const emptyCollection = { revision: 0, cards: [] }

test('local deck database persists authoritative revisioned snapshots', (context) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'swu-local-decks-'))
  const databasePath = path.join(directory, 'decks.sqlite')
  context.after(() => rmSync(directory, { recursive: true, force: true }))

  let store = createLocalDeckStore(databasePath)
  assert.deepEqual(store.read(), {
    initialized: false,
    collectionInitialized: false,
    promptHistoryInitialized: false,
    revision: 0,
    updatedAt: null,
    collection: emptyCollection,
    promptHistory: [],
    decks: [],
  })

  const collection = {
    historyId: 'history-1',
    revision: 1,
    cards: [{ cardId: 'TST_003', count: 2 }],
    events: [
      {
        revision: 1,
        changedAt: '2026-08-28T12:30:00.000Z',
        source: 'manual',
        deltas: [{ cardId: 'TST_003', delta: 2 }],
      },
    ],
  }
  const firstRecord = deckRecord(
    'one',
    'First',
    { historyId: 'history-1', revision: 0 },
  )
  firstRecord.history = {
    historyId: 'deck-history-1',
    revision: 0,
    position: 0,
    entries: [{
      revision: 0,
      parentRevision: null,
      changedAt: null,
      label: 'Loaded deck',
      deck: {
        leader: null,
        secondLeader: null,
        base: null,
        drawDeck: [],
        sideboard: [],
      },
      collectionCheckpoint: { historyId: 'history-1', revision: 0 },
      visual: null,
    }],
  }
  const promptHistory = ['Build a clone deck', 'Improve this matchup']
  const first = store.replace(
    0,
    [firstRecord],
    collection,
    promptHistory,
  )
  assert.equal(first.status, 'saved')
  assert.equal(first.snapshot.revision, 1)
  assert.deepEqual(first.snapshot.collection, collection)
  assert.deepEqual(first.snapshot.promptHistory, promptHistory)
  assert.deepEqual(first.snapshot.decks, [firstRecord])

  store.close()
  store = createLocalDeckStore(databasePath)
  assert.equal(store.read().revision, 1)
  assert.deepEqual(store.read().collection, collection)
  assert.deepEqual(store.read().promptHistory, promptHistory)
  assert.equal(store.read().decks[0].name, 'First')
  assert.deepEqual(store.read().decks[0].collectionCheckpoint, {
    historyId: 'history-1',
    revision: 0,
  })
  assert.deepEqual(store.read().decks[0].history, firstRecord.history)

  const conflict = store.replace(
    0,
    [deckRecord('stale')],
    emptyCollection,
    [],
  )
  assert.equal(conflict.status, 'conflict')
  assert.equal(conflict.snapshot.decks[0].id, 'one')

  const cleared = store.replace(1, [], emptyCollection, [])
  assert.equal(cleared.status, 'saved')
  assert.equal(cleared.snapshot.revision, 2)
  assert.deepEqual(cleared.snapshot.decks, [])
  assert.deepEqual(cleared.snapshot.collection, emptyCollection)
  assert.deepEqual(cleared.snapshot.promptHistory, [])
  store.close()
})

test('local deck snapshots reject malformed records and stale metadata', () => {
  assert.throws(
    () => validateLocalDeckSnapshot({ expectedRevision: -1, decks: [] }),
    /revision is invalid/,
  )
  assert.throws(
    () => validateLocalDeckSnapshot({
      expectedRevision: 0,
      decks: [{
        ...deckRecord('history'),
        history: {
          historyId: 'history',
          revision: 51,
          position: 0,
          entries: Array.from({ length: 52 }, (_, revision) => ({ revision })),
        },
      }],
      collection: emptyCollection,
    }),
    /invalid history/,
  )
  assert.throws(
    () => validateLocalDeckSnapshot({
      expectedRevision: 0,
      decks: [deckRecord('same'), deckRecord('same')],
    }),
    /invalid or duplicate ID/,
  )
  assert.throws(
    () => validateLocalDeckSnapshot({
      expectedRevision: 0,
      decks: [deckRecord('one', 'Shared'), deckRecord('two', 'shared')],
    }),
    /invalid or duplicate name/,
  )
  assert.throws(
    () => validateLocalDeckSnapshot({
      expectedRevision: 0,
      decks: [],
      collection: {
        revision: 0,
        cards: [{ cardId: 'TST_003', count: 0 }],
      },
    }),
    /invalid quantity/,
  )
  assert.throws(
    () => validateLocalDeckSnapshot({
      expectedRevision: 0,
      decks: [],
      collection: emptyCollection,
      promptHistory: Array.from({ length: 31 }, () => 'Prompt'),
    }),
    /no more than 30 entries/,
  )
})

test('local deck snapshots accept delta histories longer than fifty changes', () => {
  const entries = [{
    revision: 0,
    parentRevision: null,
    changedAt: null,
    label: 'Loaded deck',
    snapshot: {
      leader: null,
      secondLeader: null,
      base: null,
      drawDeck: [],
      sideboard: [],
    },
  }]
  for (let revision = 1; revision <= 60; revision += 1) {
    entries.push({
      revision,
      parentRevision: revision - 1,
      changedAt: `2026-09-${String((revision % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
      label: `Change ${revision}`,
      delta: { drawDeck: [['TST_001', 1]] },
    })
  }
  const candidate = deckRecord('long-history')
  candidate.deck.drawDeck = Array.from({ length: 60 }, () => ({ id: 'TST_001' }))
  candidate.history = {
    format: 2,
    historyId: 'long-history',
    revision: 60,
    position: 60,
    entries,
  }

  const result = validateLocalDeckSnapshot({
    expectedRevision: 0,
    decks: [candidate],
    collection: emptyCollection,
  })

  assert.equal(result.decks[0].history.entries.length, 61)
})
