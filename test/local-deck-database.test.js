import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LOCAL_DECK_SELECTION_STORAGE_KEY,
  databaseSnapshotFingerprint,
  loadLocalDeckDatabase,
  loadLocalDeckSelection,
  resolveDatabaseCollectionSource,
  resolveDatabaseDeckSource,
  saveLocalDeckDatabase,
  saveLocalDeckSelection,
  selectDatabaseDeckId,
} from '../src/local-deck-database.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

test('database client reads, writes, and reports revision conflicts', async () => {
  const calls = []
  const collection = {
    revision: 1,
    cards: [{ cardId: 'TST_003', count: 2 }],
  }
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === 'PUT') {
      return new Response(JSON.stringify({
        initialized: true,
        revision: 2,
        decks: [],
      }))
    }
    return new Response(JSON.stringify({
      initialized: true,
      revision: 1,
      decks: [],
    }))
  }

  assert.equal((await loadLocalDeckDatabase({ fetchImpl })).revision, 1)
  assert.equal(
    (await saveLocalDeckDatabase(1, [], collection, { fetchImpl })).revision,
    2,
  )
  assert.equal(calls[1].options.method, 'PUT')
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    expectedRevision: 1,
    decks: [],
    collection,
  })

  await assert.rejects(
    () => loadLocalDeckDatabase({
      fetchImpl: async () => new Response(
        JSON.stringify({ code: 'revision_conflict', error: 'Conflict.' }),
        { status: 409 },
      ),
    }),
    (error) => error.code === 'revision_conflict' && error.status === 409,
  )
})

test('database selection remains a browser-local preference', () => {
  const storage = memoryStorage()
  const records = [{ id: 'one' }, { id: 'two' }]

  saveLocalDeckSelection(storage, 'two')
  assert.equal(loadLocalDeckSelection(storage), 'two')
  assert.equal(
    storage.getItem(LOCAL_DECK_SELECTION_STORAGE_KEY),
    'two',
  )
  assert.equal(selectDatabaseDeckId(records, 'missing', 'one'), 'one')
  assert.equal(selectDatabaseDeckId(records, 'two', 'one'), 'two')
  assert.equal(
    databaseSnapshotFingerprint(records, { revision: 0, cards: [] }),
    JSON.stringify({
      records,
      collection: { revision: 0, cards: [] },
    }),
  )

  saveLocalDeckSelection(storage, null)
  assert.equal(loadLocalDeckSelection(storage), null)
})

test('initialized database decks are authoritative over browser decks', () => {
  const browserLibrary = {
    records: [{ id: 'browser' }],
    selectedId: 'browser',
  }
  const databaseRecord = { id: 'database' }

  assert.deepEqual(
    resolveDatabaseDeckSource(
      { initialized: true, decks: [databaseRecord] },
      browserLibrary,
    ),
    {
      needsInitialization: false,
      records: [databaseRecord],
      selectedId: 'browser',
    },
  )
  assert.deepEqual(
    resolveDatabaseDeckSource(
      { initialized: false, decks: [] },
      browserLibrary,
    ),
    {
      needsInitialization: true,
      records: browserLibrary.records,
      selectedId: 'browser',
    },
  )
})

test('initialized database collections are authoritative over browser storage', () => {
  const browserCollection = {
    revision: 2,
    cards: [{ cardId: 'TST_001', count: 1 }],
  }
  const databaseCollection = {
    revision: 5,
    cards: [{ cardId: 'TST_002', count: 3 }],
  }

  assert.deepEqual(
    resolveDatabaseCollectionSource(
      {
        collectionInitialized: true,
        collection: databaseCollection,
      },
      browserCollection,
    ),
    { needsInitialization: false, collection: databaseCollection },
  )
  assert.deepEqual(
    resolveDatabaseCollectionSource(
      {
        collectionInitialized: false,
        collection: { revision: 0, cards: [] },
      },
      browserCollection,
    ),
    { needsInitialization: true, collection: browserCollection },
  )
})
