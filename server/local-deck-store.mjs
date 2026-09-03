import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { normalizeAgentCardCollection } from './card-collection.mjs'
import {
  DECK_HISTORY_FORMAT_VERSION,
  applyDeckHistoryDelta,
  createDeckHistoryDelta,
  isCompactDeckHistorySnapshot,
} from '../shared/deck-history-format.mjs'

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

function historyCardId(card) {
  const setCode = String(card?.setCode ?? card?.Set ?? '').trim().toUpperCase()
  const cardNumber = String(card?.cardNumber ?? card?.Number ?? '').trim()
  if (setCode && cardNumber) return `${setCode}_${cardNumber}`
  return typeof card?.id === 'string' && card.id.trim()
    ? card.id.trim().slice(0, 100)
    : null
}

function compactHistoryCardList(cards) {
  const counts = new Map()
  for (const card of cards ?? []) {
    const id = historyCardId(card)
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => ({ id, count }))
}

function compactHistoryMetadata(metadata) {
  if (!isObject(metadata)) return undefined
  const name = typeof metadata.name === 'string' ? metadata.name.slice(0, 100) : ''
  const author = typeof metadata.author === 'string' ? metadata.author.slice(0, 100) : ''
  return name || author
    ? { ...(name ? { name } : {}), ...(author ? { author } : {}) }
    : undefined
}

function compactHistoryDeck(deck) {
  const metadata = compactHistoryMetadata(deck?.metadata)
  return {
    ...(metadata ? { metadata } : {}),
    leader: historyCardId(deck?.leader),
    secondLeader: historyCardId(deck?.secondLeader),
    base: historyCardId(deck?.base),
    drawDeck: compactHistoryCardList(deck?.drawDeck),
    sideboard: compactHistoryCardList(deck?.sideboard),
  }
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

function validHistoryEntryMetadata(entry, index, previousRevision, latestRevision) {
  const validDate = typeof entry?.changedAt === 'string' &&
    Number.isFinite(Date.parse(entry.changedAt))
  const validParent = index === 0
    ? entry?.parentRevision === null || entry?.parentRevision === undefined
    : entry?.parentRevision === previousRevision
  return isObject(entry) &&
    Number.isInteger(entry.revision) &&
    entry.revision > previousRevision &&
    entry.revision <= latestRevision &&
    validParent &&
    (index === 0 || validDate) &&
    typeof entry.label === 'string' &&
    Boolean(entry.label.trim()) &&
    entry.label.length <= 240
}

function normalizedHistoryContent(entry, index, deltaFormat, previousSnapshot, deckIndex) {
  if (index === 0) {
    const snapshot = deltaFormat ? entry.snapshot : entry.deck
    if (!isCompactDeckHistorySnapshot(snapshot)) {
      throw new TypeError(`Deck ${deckIndex + 1} has an invalid history anchor.`)
    }
    return { content: { snapshot }, snapshot }
  }
  if (deltaFormat) {
    const snapshot = applyDeckHistoryDelta(previousSnapshot, entry.delta)
    if (JSON.stringify(snapshot) === JSON.stringify(previousSnapshot)) {
      throw new TypeError(`Deck ${deckIndex + 1} has an empty history change.`)
    }
    return {
      content: { delta: entry.delta },
      snapshot,
    }
  }
  if (!isCompactDeckHistorySnapshot(entry.deck)) {
    throw new TypeError(`Deck ${deckIndex + 1} has an invalid history snapshot.`)
  }
  const delta = createDeckHistoryDelta(previousSnapshot, entry.deck)
  if (Object.keys(delta).length === 0) {
    throw new TypeError(`Deck ${deckIndex + 1} has an empty history change.`)
  }
  return { content: { delta }, snapshot: entry.deck }
}

function historyEntryMetadata(entry) {
  const metadata = { ...entry }
  delete metadata.deck
  delete metadata.delta
  delete metadata.snapshot
  return metadata
}

function normalizeHistoryEntries(value, deltaFormat, deckIndex) {
  let previousRevision = -1
  const entries = []
  const snapshots = []
  let snapshot = null
  for (const [index, entry] of value.entries.entries()) {
    if (!validHistoryEntryMetadata(entry, index, previousRevision, value.revision)) {
      throw new TypeError(`Deck ${deckIndex + 1} has an invalid history.`)
    }
    const normalized = normalizedHistoryContent(
      entry,
      index,
      deltaFormat,
      snapshot,
      deckIndex,
    )
    snapshot = normalized.snapshot
    snapshots.push(snapshot)
    entries.push({ ...historyEntryMetadata(entry), ...normalized.content })
    previousRevision = entry.revision
  }
  return { entries, previousRevision, snapshots }
}

function normalizeDeckHistory(value, deckIndex, currentDeck) {
  if (value === null || value === undefined) return null
  if (
    !isObject(value) ||
    typeof value.historyId !== 'string' ||
    !value.historyId.trim() ||
    value.historyId.length > 160 ||
    !Number.isInteger(value.revision) ||
    value.revision < 0 ||
    !Number.isInteger(value.position) ||
    !Array.isArray(value.entries) ||
    value.entries.length < 1 ||
    value.position < 0 ||
    value.position >= value.entries.length
  ) {
    throw new TypeError(`Deck ${deckIndex + 1} has an invalid history.`)
  }
  const deltaFormat = value.format === DECK_HISTORY_FORMAT_VERSION
  if (value.format !== undefined && !deltaFormat) {
    throw new TypeError(`Deck ${deckIndex + 1} has an unsupported history format.`)
  }
  const { entries, previousRevision, snapshots } = normalizeHistoryEntries(
    value,
    deltaFormat,
    deckIndex,
  )
  if (previousRevision !== value.revision) {
    throw new TypeError(`Deck ${deckIndex + 1} has an invalid history.`)
  }
  if (
    JSON.stringify(snapshots[value.position]) !==
    JSON.stringify(compactHistoryDeck(currentDeck))
  ) {
    throw new TypeError(`Deck ${deckIndex + 1} does not match its history position.`)
  }
  return {
    ...value,
    format: DECK_HISTORY_FORMAT_VERSION,
    historyId: value.historyId.trim(),
    entries,
  }
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

  const checkpoint = candidate.collectionCheckpoint
  if (
    checkpoint !== null &&
    checkpoint !== undefined &&
    (
      typeof checkpoint?.historyId !== 'string' ||
      !checkpoint.historyId.trim() ||
      checkpoint.historyId.length > 160 ||
      !Number.isInteger(checkpoint.revision) ||
      checkpoint.revision < 0
    )
  ) {
    throw new TypeError(`Deck ${index + 1} has an invalid collection checkpoint.`)
  }

  ids.add(id)
  names.add(nameKey)
  return {
    id,
    name,
    kind: candidate.kind,
    deck,
    history: normalizeDeckHistory(candidate.history, index, deck),
    collectionCheckpoint: checkpoint
      ? {
          historyId: checkpoint.historyId.trim(),
          revision: checkpoint.revision,
        }
      : null,
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
      history_json TEXT,
      collection_checkpoint_json TEXT,
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

  const deckColumns = database.prepare('PRAGMA table_info(decks)').all()
  if (!deckColumns.some((column) => column.name === 'collection_checkpoint_json')) {
    database.exec('ALTER TABLE decks ADD COLUMN collection_checkpoint_json TEXT')
  }
  if (!deckColumns.some((column) => column.name === 'history_json')) {
    database.exec('ALTER TABLE decks ADD COLUMN history_json TEXT')
  }

  const readState = database.prepare(
    'SELECT revision, initialized, updated_at FROM deck_library_state WHERE id = 1',
  )
  const readDecks = database.prepare(`
    SELECT id, name, kind, deck_json, history_json, collection_checkpoint_json,
      created_at, updated_at
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
      (id, position, name, kind, deck_json, history_json, collection_checkpoint_json,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        history: row.history_json ? JSON.parse(row.history_json) : null,
        collectionCheckpoint: row.collection_checkpoint_json
          ? JSON.parse(row.collection_checkpoint_json)
          : null,
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
          record.history ? JSON.stringify(record.history) : null,
          record.collectionCheckpoint
            ? JSON.stringify(record.collectionCheckpoint)
            : null,
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
