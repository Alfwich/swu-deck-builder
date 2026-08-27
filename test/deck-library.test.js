import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DECK_LIBRARY_STORAGE_KEY,
  addDeckRecord,
  loadDeckLibrary,
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

test('random generation always replaces one persistent random slot', () => {
  const first = upsertRandomDeckRecord([], deck('first'))
  const renamed = renameDeckRecord(first.records, first.record.id, 'My sandbox')
  const second = upsertRandomDeckRecord(renamed, deck('second'))

  assert.equal(second.records.length, 1)
  assert.equal(second.record.id, first.record.id)
  assert.equal(second.record.name, 'My sandbox')
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
