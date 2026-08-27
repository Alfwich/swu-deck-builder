import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DECK_LIBRARY_STORAGE_KEY,
  addDeckRecord,
  createUniqueDeckName,
  isDeckNameAvailable,
  loadDeckLibrary,
  normalizeDeckName,
  renameDeckRecord,
  saveDeckLibrary,
  updateDeckRecord,
  upsertRandomDeckRecord,
} from '../src/deck-library.js'

function deck(label) {
  return {
    leader: { id: `${label}-leader` },
    base: { id: `${label}-base` },
    drawDeck: [],
    sideboard: [],
  }
}

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
    value(key) {
      return values.get(key)
    },
  }
}

test('renaming the random slot realizes it and the next random deck gets a new slot', () => {
  const first = upsertRandomDeckRecord([], deck('first'))
  const renamed = renameDeckRecord(first.records, first.record.id, 'My sandbox')
  const second = upsertRandomDeckRecord(renamed, deck('second'))

  assert.equal(renamed[0].kind, 'saved')
  assert.equal(second.records.length, 2)
  assert.notEqual(second.record.id, first.record.id)
  assert.equal(second.record.name, 'Random deck')
  assert.equal(second.record.deck.leader.id, 'second-leader')
  assert.equal(second.records[0].name, 'My sandbox')
  assert.equal(second.records[0].deck.leader.id, 'first-leader')
})

test('submitting the unchanged random-slot name keeps it rerollable', () => {
  const first = upsertRandomDeckRecord([], deck('first'))
  const unchanged = renameDeckRecord(
    first.records,
    first.record.id,
    '  Random   deck  ',
  )
  const second = upsertRandomDeckRecord(unchanged, deck('second'))

  assert.equal(unchanged[0].kind, 'random')
  assert.equal(second.records.length, 1)
  assert.equal(second.record.id, first.record.id)
  assert.equal(second.record.deck.leader.id, 'second-leader')
})

test('new records receive case-insensitively unique names', () => {
  const first = addDeckRecord([], {
    deck: deck('one'),
    name: 'Blue Control',
    kind: 'ai',
  })
  const second = addDeckRecord(first.records, {
    deck: deck('two'),
    name: 'blue control',
    kind: 'imported',
  })

  assert.equal(second.record.name, 'blue control (2)')
})

test('rename rejects duplicate and blank names', () => {
  const first = addDeckRecord([], { deck: deck('one'), name: 'First' })
  const second = addDeckRecord(first.records, { deck: deck('two'), name: 'Second' })

  assert.throws(
    () => renameDeckRecord(second.records, second.record.id, ' first '),
    /already exists/,
  )
  assert.throws(
    () => renameDeckRecord(second.records, second.record.id, '   '),
    /cannot be empty/,
  )
})

test('deck updates preserve slot identity and name', () => {
  const initial = addDeckRecord([], { deck: deck('before'), name: 'Keep me' })
  const updated = updateDeckRecord(initial.records, initial.record.id, deck('after'))

  assert.equal(updated.record.id, initial.record.id)
  assert.equal(updated.record.name, 'Keep me')
  assert.equal(updated.record.deck.leader.id, 'after-leader')
})

test('deck library round-trips through storage and restores selection', () => {
  const storage = memoryStorage()
  const first = addDeckRecord([], { deck: deck('one'), name: 'One' })
  const second = addDeckRecord(first.records, { deck: deck('two'), name: 'Two' })

  saveDeckLibrary(storage, second.records, second.record.id)
  const restored = loadDeckLibrary(storage)

  assert.equal(restored.records.length, 2)
  assert.equal(restored.selectedId, second.record.id)
  assert.equal(restored.records[1].name, 'Two')
  assert.equal(JSON.parse(storage.value(DECK_LIBRARY_STORAGE_KEY)).version, 1)
})

test('deck names are trimmed, whitespace-normalized, and length-limited', () => {
  assert.equal(normalizeDeckName('  Blue   Control  '), 'Blue Control')
  assert.equal(normalizeDeckName('   ', 'Fallback'), 'Fallback')
  assert.equal(normalizeDeckName('x'.repeat(120)).length, 100)
})

test('unique deck names advance past occupied suffixes', () => {
  const first = addDeckRecord([], { deck: deck('one'), name: 'Control' })
  const second = addDeckRecord(first.records, {
    deck: deck('two'),
    name: 'Control',
  })

  assert.equal(createUniqueDeckName(second.records, 'control'), 'control (3)')
  assert.equal(isDeckNameAvailable(second.records, 'CONTROL'), false)
  assert.equal(
    isDeckNameAvailable(second.records, 'Control', first.record.id),
    true,
  )
})

test('unknown deck kinds are stored as saved decks', () => {
  const result = addDeckRecord([], {
    deck: deck('one'),
    name: 'Mystery deck',
    kind: 'mystery',
  })

  assert.equal(result.record.kind, 'saved')
})

test('updating a missing deck reports that the selection is stale', () => {
  assert.throws(
    () => updateDeckRecord([], 'missing', deck('replacement')),
    /no longer in the deck library/,
  )
})

test('renaming a missing deck reports that the selection is stale', () => {
  assert.throws(
    () => renameDeckRecord([], 'missing', 'New name'),
    /no longer in the deck library/,
  )
})

test('malformed deck-library storage fails safely to an empty library', () => {
  const invalidJson = memoryStorage()
  invalidJson.setItem(DECK_LIBRARY_STORAGE_KEY, '{not-json')
  assert.deepEqual(loadDeckLibrary(invalidJson), {
    records: [],
    selectedId: null,
  })

  const invalidShape = memoryStorage()
  invalidShape.setItem(DECK_LIBRARY_STORAGE_KEY, JSON.stringify({ decks: {} }))
  assert.deepEqual(loadDeckLibrary(invalidShape), {
    records: [],
    selectedId: null,
  })
})

test('loading repairs duplicate IDs and names while discarding invalid records', () => {
  const storage = memoryStorage()
  storage.setItem(
    DECK_LIBRARY_STORAGE_KEY,
    JSON.stringify({
      selectedId: 'missing-selection',
      decks: [
        {
          id: 'incomplete',
          name: 'Incomplete',
          kind: 'saved',
          deck: { leader: {}, drawDeck: [], sideboard: [] },
        },
        {
          id: 'duplicate-id',
          name: 'Shared name',
          kind: 'random',
          deck: deck('random-one'),
        },
        {
          id: 'second-random',
          name: 'Discarded random',
          kind: 'random',
          deck: deck('random-two'),
        },
        {
          id: 'duplicate-id',
          name: 'shared name',
          kind: 'unknown',
          deck: deck('saved'),
        },
      ],
    }),
  )

  const restored = loadDeckLibrary(storage)

  assert.equal(restored.records.length, 2)
  assert.deepEqual(
    restored.records.map(({ name, kind }) => ({ name, kind })),
    [
      { name: 'Shared name', kind: 'random' },
      { name: 'shared name (2)', kind: 'saved' },
    ],
  )
  assert.notEqual(restored.records[0].id, restored.records[1].id)
  assert.equal(restored.selectedId, restored.records[0].id)
})
