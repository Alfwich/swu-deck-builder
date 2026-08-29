import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_PLAYER_DATABASE_BACKUP_BYTES,
  createPlayerDatabaseBackup,
  parsePlayerDatabaseBackup,
  playerDatabaseBackupFilename,
  playerDatabaseBackupSizeError,
} from '../src/player-database-backup.js'

function card(setCode, cardNumber, name, type) {
  return {
    id: `${setCode}-${cardNumber}`,
    setCode,
    cardNumber,
    name,
    subtitle: null,
    type,
    aspects: [],
    url: `https://example.test/${setCode}-${cardNumber}.png`,
  }
}

const leader = card('SOR', '005', 'Luke Skywalker', 'Leader')
const base = card('SOR', '029', 'Administrator’s Tower', 'Base')
const unit = card('SOR', '051', 'Luke Skywalker', 'Unit')
const event = card('SOR', '058', 'Make an Opening', 'Event')
const cardsById = new Map([
  ['SOR_005', leader],
  ['SOR_029', base],
  ['SOR_051', unit],
  ['SOR_058', event],
])

const record = {
  id: 'deck-1',
  name: 'Blue Control',
  kind: 'saved',
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-02T12:00:00.000Z',
  deck: {
    metadata: { name: 'Blue Control', author: 'Leia' },
    leader,
    secondLeader: null,
    base,
    drawDeck: [unit, unit, event],
    sideboard: [event],
  },
}

test('player database backups round-trip decks and collection through card IDs', () => {
  const source = createPlayerDatabaseBackup(
    {
      decks: [record],
      selectedDeckId: record.id,
      collection: {
        revision: 7,
        cards: [{ cardId: 'SOR_051', count: 3 }],
      },
    },
    '2026-08-28T12:00:00.000Z',
  )

  assert.doesNotMatch(source, /example\.test/)
  assert.deepEqual(JSON.parse(source).decks[0].deck.drawDeck, [
    { id: 'SOR_051', count: 2 },
    { id: 'SOR_058', count: 1 },
  ])

  const restored = parsePlayerDatabaseBackup(source, cardsById)
  assert.equal(restored.exportedAt, '2026-08-28T12:00:00.000Z')
  assert.equal(restored.selectedDeckId, record.id)
  assert.deepEqual(restored.decks[0], record)
  assert.deepEqual(restored.collection, {
    revision: 0,
    cards: [{ cardId: 'SOR_051', count: 3 }],
  })
})

test('player database backups preserve empty work-in-progress decks', () => {
  const emptyRecord = {
    ...record,
    id: 'empty-deck',
    name: 'Empty deck',
    deck: {
      leader: null,
      secondLeader: null,
      base: null,
      drawDeck: [],
      sideboard: [],
    },
  }
  const source = createPlayerDatabaseBackup({
    decks: [emptyRecord],
    selectedDeckId: emptyRecord.id,
    collection: { cards: [] },
  })

  assert.deepEqual(
    parsePlayerDatabaseBackup(source, cardsById).decks[0],
    emptyRecord,
  )
})

test('player database import rejects incompatible cards before replacement', () => {
  const payload = JSON.parse(createPlayerDatabaseBackup({
    decks: [record],
    selectedDeckId: record.id,
    collection: { cards: [] },
  }))
  payload.decks[0].deck.drawDeck[0].id = 'FUTURE_999'

  assert.throws(
    () => parsePlayerDatabaseBackup(JSON.stringify(payload), cardsById),
    /FUTURE_999 is not in the current catalog/,
  )
})

test('player database backup filenames include the export date', () => {
  assert.equal(
    playerDatabaseBackupFilename(new Date('2026-08-28T23:00:00.000Z')),
    'swu-deck-builder-backup-2026-08-28.json',
  )
})

test('player database backup size guard accepts 50 MB and rejects larger files', () => {
  assert.equal(MAX_PLAYER_DATABASE_BACKUP_BYTES, 50 * 1024 * 1024)
  assert.equal(playerDatabaseBackupSizeError(MAX_PLAYER_DATABASE_BACKUP_BYTES), null)
  assert.equal(
    playerDatabaseBackupSizeError(MAX_PLAYER_DATABASE_BACKUP_BYTES + 1),
    'Database backups must be 50 MB or smaller.',
  )
})
