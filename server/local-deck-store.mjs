import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { normalizeAgentCardCollection } from './card-collection.mjs'

const require = createRequire(import.meta.url)
const VALID_KINDS = new Set(['ai', 'imported', 'saved'])
const MAX_DECKS = 250
const MAX_PROMPT_HISTORY = 30
const MAX_PROMPT_LENGTH = 4000

function loadDatabaseConstructor() {
  try {
    return require('node:sqlite').DatabaseSync
  } catch (builtInError) {
    try {
      return require('better-sqlite3')
    } catch (dependencyError) {
      throw new Error(
        'Local deck database support requires Node.js with node:sqlite or development dependencies.',
        { cause: new AggregateError([builtInError, dependencyError]) },
      )
    }
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function normalizePromptHistory(value) {
  const prompts = value ?? []
  if (!Array.isArray(prompts) || prompts.length > MAX_PROMPT_HISTORY) {
    throw new TypeError(
      `The agent prompt history must contain no more than ${MAX_PROMPT_HISTORY} entries.`,
    )
  }

  return prompts.map((prompt, index) => {
    const normalized = typeof prompt === 'string' ? prompt.trim() : ''
    if (!normalized || normalized.length > MAX_PROMPT_LENGTH) {
      throw new TypeError(`Agent prompt history entry ${index + 1} is invalid.`)
    }
    return normalized
  })
}

function assertDeckRecord(candidate, index, ids, names) {
  if (!isObject(candidate)) {
    throw new TypeError(`Deck ${index + 1} must be an object.`)
  }

  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  if (!id || id.length > 200 || ids.has(id)) {
    throw new TypeError(`Deck ${index + 1} has an invalid or duplicate ID.`)
  }

  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  const nameKey = name.toLocaleLowerCase()
  if (!name || name.length > 100 || names.has(nameKey)) {
    throw new TypeError(`Deck ${index + 1} has an invalid or duplicate name.`)
  }

  if (!VALID_KINDS.has(candidate.kind)) {
    throw new TypeError(`Deck ${index + 1} has an invalid kind.`)
  }
  if (!isTimestamp(candidate.createdAt) || !isTimestamp(candidate.updatedAt)) {
    throw new TypeError(`Deck ${index + 1} has invalid timestamps.`)
  }

  const deck = candidate.deck
  if (
    !isObject(deck) ||
    !Array.isArray(deck.drawDeck) ||
    !Array.isArray(deck.sideboard)
  ) {
    throw new TypeError(`Deck ${index + 1} has an invalid deck definition.`)
  }

  ids.add(id)
  names.add(nameKey)
  return {
    id,
    name,
    kind: candidate.kind,
    deck,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  }
}

export function validateLocalDeckSnapshot(payload) {
  if (!isObject(payload)) {
    throw new TypeError('The deck-library snapshot must be an object.')
  }
  if (!Number.isInteger(payload.expectedRevision) || payload.expectedRevision < 0) {
    throw new TypeError('The expected deck-library revision is invalid.')
  }
  if (!Array.isArray(payload.decks) || payload.decks.length > MAX_DECKS) {
    throw new TypeError(`The deck library must contain no more than ${MAX_DECKS} decks.`)
  }

  const ids = new Set()
  const names = new Set()
  return {
    expectedRevision: payload.expectedRevision,
    decks: payload.decks.map((candidate, index) =>
      assertDeckRecord(candidate, index, ids, names),
    ),
    collection: normalizeAgentCardCollection(payload.collection),
    promptHistory: normalizePromptHistory(payload.promptHistory),
  }
}

export function createLocalDeckStore(databasePath, dependencies = {}) {
  const Database = dependencies.Database ?? loadDatabaseConstructor()
  mkdirSync(path.dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS deck_library_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL,
      initialized INTEGER NOT NULL CHECK (initialized IN (0, 1)),
      updated_at TEXT
    );
    INSERT OR IGNORE INTO deck_library_state
      (id, revision, initialized, updated_at)
      VALUES (1, 0, 0, NULL);

    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      deck_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS decks_position_idx ON decks(position);

    CREATE TABLE IF NOT EXISTS card_collection_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      initialized INTEGER NOT NULL CHECK (initialized IN (0, 1)),
      collection_json TEXT NOT NULL
    );
    INSERT OR IGNORE INTO card_collection_state
      (id, initialized, collection_json)
      VALUES (1, 0, '{"revision":0,"cards":[]}');

    CREATE TABLE IF NOT EXISTS agent_prompt_history_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      initialized INTEGER NOT NULL CHECK (initialized IN (0, 1)),
      history_json TEXT NOT NULL
    );
    INSERT OR IGNORE INTO agent_prompt_history_state
      (id, initialized, history_json)
      VALUES (1, 0, '[]');
  `)

  const readState = database.prepare(
    'SELECT revision, initialized, updated_at FROM deck_library_state WHERE id = 1',
  )
  const readDecks = database.prepare(`
    SELECT id, name, kind, deck_json, created_at, updated_at
    FROM decks
    ORDER BY position ASC
  `)
  const readCollection = database.prepare(
    'SELECT initialized, collection_json FROM card_collection_state WHERE id = 1',
  )
  const readPromptHistory = database.prepare(
    'SELECT initialized, history_json FROM agent_prompt_history_state WHERE id = 1',
  )
  const clearDecks = database.prepare('DELETE FROM decks')
  const insertDeck = database.prepare(`
    INSERT INTO decks
      (id, position, name, kind, deck_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const updateState = database.prepare(`
    UPDATE deck_library_state
    SET revision = ?, initialized = 1, updated_at = ?
    WHERE id = 1
  `)
  const updateCollection = database.prepare(`
    UPDATE card_collection_state
    SET initialized = 1, collection_json = ?
    WHERE id = 1
  `)
  const updatePromptHistory = database.prepare(`
    UPDATE agent_prompt_history_state
    SET initialized = 1, history_json = ?
    WHERE id = 1
  `)

  function read() {
    const state = readState.get()
    const collectionState = readCollection.get()
    const promptHistoryState = readPromptHistory.get()
    return {
      initialized: Boolean(state.initialized),
      collectionInitialized: Boolean(collectionState.initialized),
      promptHistoryInitialized: Boolean(promptHistoryState.initialized),
      revision: state.revision,
      updatedAt: state.updated_at,
      collection: JSON.parse(collectionState.collection_json),
      promptHistory: JSON.parse(promptHistoryState.history_json),
      decks: readDecks.all().map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        deck: JSON.parse(row.deck_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    }
  }

  function replaceTransaction(expectedRevision, decks, collection, promptHistory) {
    database.exec('BEGIN IMMEDIATE')
    try {
      const state = readState.get()
      if (state.revision !== expectedRevision) {
        database.exec('ROLLBACK')
        return null
      }

      clearDecks.run()
      decks.forEach((record, index) => {
        insertDeck.run(
          record.id,
          index,
          record.name,
          record.kind,
          JSON.stringify(record.deck),
          record.createdAt,
          record.updatedAt,
        )
      })
      updateCollection.run(JSON.stringify(collection))
      updatePromptHistory.run(JSON.stringify(promptHistory))

      const revision = state.revision + 1
      updateState.run(revision, new Date().toISOString())
      database.exec('COMMIT')
      return revision
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  return {
    close() {
      database.close()
    },
    read,
    replace(expectedRevision, decks, collection, promptHistory) {
      const revision = replaceTransaction(
        expectedRevision,
        decks,
        collection,
        promptHistory,
      )
      return revision === null
        ? { status: 'conflict', snapshot: read() }
        : { status: 'saved', snapshot: read() }
    },
  }
}
