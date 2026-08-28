import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DECK_LIBRARY_STORAGE_KEY,
  addDeckRecord,
  createEmptyDeck,
  createUniqueDeckName,
  deleteDeckRecord,
  isDeckNameAvailable,
  loadDeckLibrary,
  normalizeDeckName,
  renameDeckRecord,
  saveDeckLibrary,
  updateDeckRecord,
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

test('empty decks are first-class records with unique names', () => {
  const first = addDeckRecord([], {
    deck: createEmptyDeck(),
    name: 'New deck',
  })
  const second = addDeckRecord(first.records, {
    deck: createEmptyDeck(),
    name: 'New deck',
  })

  assert.equal(second.record.name, 'New deck (2)')
  assert.deepEqual(second.record.deck, {
    leader: null,
    secondLeader: null,
    base: null,
    drawDeck: [],
    sideboard: [],
  })
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

test('deleting the selected deck selects the next adjacent deck', () => {
  const first = addDeckRecord([], { deck: deck('one'), name: 'One' })
  const second = addDeckRecord(first.records, { deck: deck('two'), name: 'Two' })
  const third = addDeckRecord(second.records, {
    deck: deck('three'),
    name: 'Three',
  })

  const result = deleteDeckRecord(
    third.records,
    second.record.id,
    second.record.id,
  )

  assert.deepEqual(result.records.map((record) => record.name), ['One', 'Three'])
  assert.equal(result.selectedId, third.record.id)
})

test('deleting the last selected deck falls back to the previous deck', () => {
  const first = addDeckRecord([], { deck: deck('one'), name: 'One' })
  const second = addDeckRecord(first.records, { deck: deck('two'), name: 'Two' })

  const result = deleteDeckRecord(
    second.records,
    second.record.id,
    second.record.id,
  )

  assert.equal(result.selectedId, first.record.id)
})

test('deleting an unselected deck preserves selection and emptying the library clears it', () => {
  const first = addDeckRecord([], { deck: deck('one'), name: 'One' })
  const second = addDeckRecord(first.records, { deck: deck('two'), name: 'Two' })
  const remaining = deleteDeckRecord(
    second.records,
    first.record.id,
    second.record.id,
  )

  assert.equal(remaining.selectedId, second.record.id)

  const empty = deleteDeckRecord(
    remaining.records,
    second.record.id,
    second.record.id,
  )
  assert.deepEqual(empty, { records: [], selectedId: null })
})

test('deleting a missing deck reports that the selection is stale', () => {
  assert.throws(
    () => deleteDeckRecord([], 'missing', null),
    /no longer in the deck library/,
  )
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
  assert.equal(JSON.parse(storage.value(DECK_LIBRARY_STORAGE_KEY)).version, 2)
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

test('loading migrates legacy random decks and repairs invalid records', () => {
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
          deck: { leader: {}, drawDeck: 'invalid', sideboard: [] },
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

  assert.equal(restored.records.length, 3)
  assert.deepEqual(
    restored.records.map(({ name, kind }) => ({ name, kind })),
    [
      { name: 'Shared name', kind: 'saved' },
      { name: 'Discarded random', kind: 'saved' },
      { name: 'shared name (2)', kind: 'saved' },
    ],
  )
  assert.notEqual(restored.records[0].id, restored.records[1].id)
  assert.equal(restored.selectedId, restored.records[0].id)
})

test('blank deck identities round-trip as null', () => {
  const storage = memoryStorage()
  const initial = addDeckRecord([], {
    deck: createEmptyDeck(),
    name: 'Blank',
  })

  saveDeckLibrary(storage, initial.records, initial.record.id)
  const restored = loadDeckLibrary(storage)

  assert.equal(restored.records[0].deck.leader, null)
  assert.equal(restored.records[0].deck.base, null)
  assert.deepEqual(restored.records[0].deck.drawDeck, [])
})
