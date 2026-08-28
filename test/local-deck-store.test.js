import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createLocalDeckStore,
  validateLocalDeckSnapshot,
} from '../server/local-deck-store.mjs'

function deckRecord(id, name = id) {
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
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:00:00.000Z',
  }
}

test('local deck database persists authoritative revisioned snapshots', (context) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'swu-local-decks-'))
  const databasePath = path.join(directory, 'decks.sqlite')
  context.after(() => rmSync(directory, { recursive: true, force: true }))

  let store = createLocalDeckStore(databasePath)
  assert.deepEqual(store.read(), {
    initialized: false,
    revision: 0,
    updatedAt: null,
    decks: [],
  })

  const first = store.replace(0, [deckRecord('one', 'First')])
  assert.equal(first.status, 'saved')
  assert.equal(first.snapshot.revision, 1)
  assert.deepEqual(first.snapshot.decks, [deckRecord('one', 'First')])

  store.close()
  store = createLocalDeckStore(databasePath)
  assert.equal(store.read().revision, 1)
  assert.equal(store.read().decks[0].name, 'First')

  const conflict = store.replace(0, [deckRecord('stale')])
  assert.equal(conflict.status, 'conflict')
  assert.equal(conflict.snapshot.decks[0].id, 'one')

  const cleared = store.replace(1, [])
  assert.equal(cleared.status, 'saved')
  assert.equal(cleared.snapshot.revision, 2)
  assert.deepEqual(cleared.snapshot.decks, [])
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
})
