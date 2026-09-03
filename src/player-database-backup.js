import {
  MAX_COLLECTION_CARD_COUNT,
  MAX_COLLECTION_EVENTS,
  createCollectionCheckpoint,
  normalizeCardCollection,
} from './card-collection.js'
import { getCatalogCardId } from './catalog.js'
import {
  createPersistentDeckHistory,
  normalizePersistentDeckHistory,
} from './deck-history.js'

export const PLAYER_DATABASE_BACKUP_FORMAT =
  'swu-deck-builder-player-database'
export const PLAYER_DATABASE_BACKUP_VERSION = 4
export const MAX_PLAYER_DATABASE_BACKUP_BYTES = 50 * 1024 * 1024

const MAX_DECKS = 250
const MAX_DECK_ZONE_CARDS = 1000
const VALID_DECK_KINDS = new Set(['ai', 'imported', 'saved'])
const VALID_DECK_CARD_TYPES = new Set(['Unit', 'Event', 'Upgrade'])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cardId(card, label) {
  const id = getCatalogCardId(card)
  if (!id) {
    throw new Error(`${label} does not have a catalog card ID.`)
  }
  return id
}

function groupCards(cards, label) {
  if (!Array.isArray(cards)) {
    throw new Error(`${label} must be an array.`)
  }

  const grouped = new Map()
  cards.forEach((card) => {
    const id = cardId(card, label)
    grouped.set(id, (grouped.get(id) ?? 0) + 1)
  })
  return [...grouped].map(([id, count]) => ({ id, count }))
}

function backupMetadata(metadata) {
  if (!isObject(metadata)) return undefined
  const name = typeof metadata.name === 'string' ? metadata.name : ''
  const author = typeof metadata.author === 'string' ? metadata.author : ''
  if (!name && !author) return undefined
  return {
    ...(name ? { name: name.slice(0, 100) } : {}),
    ...(author ? { author: author.slice(0, 100) } : {}),
  }
}

function backupDeckRecord(record) {
  const metadata = backupMetadata(record.deck?.metadata)
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    collectionCheckpoint: record.collectionCheckpoint ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    history: normalizePersistentDeckHistory(
      record.history,
      record.deck,
      record.collectionCheckpoint,
    ),
    deck: {
      ...(metadata ? { metadata } : {}),
      leader: record.deck?.leader
        ? cardId(record.deck.leader, `${record.name} leader`)
        : null,
      secondLeader: record.deck?.secondLeader
        ? cardId(record.deck.secondLeader, `${record.name} second leader`)
        : null,
      base: record.deck?.base
        ? cardId(record.deck.base, `${record.name} base`)
        : null,
      drawDeck: groupCards(record.deck?.drawDeck, `${record.name} draw deck`),
      sideboard: groupCards(record.deck?.sideboard, `${record.name} sideboard`),
    },
  }
}

export function createPlayerDatabaseBackup(
  { collection, decks, selectedDeckId },
  exportedAt = new Date().toISOString(),
) {
  const normalizedCollection = normalizeCardCollection(collection)
  const payload = {
    format: PLAYER_DATABASE_BACKUP_FORMAT,
    version: PLAYER_DATABASE_BACKUP_VERSION,
    exportedAt,
    selectedDeckId,
    decks: decks.map(backupDeckRecord),
    collection: {
      historyId: normalizedCollection.historyId,
      revision: normalizedCollection.revision,
      cards: normalizedCollection.cards.map(({ cardId: id, count }) => ({
        cardId: id,
        count,
      })),
      events: normalizedCollection.events,
    },
  }

  return JSON.stringify(payload, null, 2)
}

export function playerDatabaseBackupFilename(date = new Date()) {
  const day = date.toISOString().slice(0, 10)
  return `swu-deck-builder-backup-${day}.json`
}

export function playerDatabaseBackupSizeError(size) {
  return size > MAX_PLAYER_DATABASE_BACKUP_BYTES
    ? 'Database backups must be 50 MB or smaller.'
    : null
}

function parseBackupJson(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('Choose a SWU Deck Builder database backup first.')
  }
  try {
    return JSON.parse(source)
  } catch (error) {
    throw new Error(
      `The database backup is not valid JSON${
        error instanceof Error ? `: ${error.message}` : '.'
      }`,
    )
  }
}

function requireString(value, label, maximumLength) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result || result.length > maximumLength) {
    throw new Error(`${label} is invalid.`)
  }
  return result
}

function requireTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} is invalid.`)
  }
  return value
}

function resolveCard(id, label, cardsById, expectedTypes) {
  const normalizedId = requireString(id, label, 100)
  const card = cardsById?.get(normalizedId)
  if (!card) {
    throw new Error(`${label} ${normalizedId} is not in the current catalog.`)
  }
  if (expectedTypes && !expectedTypes.has(card.type)) {
    throw new Error(`${label} ${normalizedId} has an invalid card type.`)
  }
  return card
}

function resolveSingleton(id, label, cardsById, expectedType) {
  if (id === null || id === undefined) return null
  return resolveCard(id, label, cardsById, new Set([expectedType]))
}

function resolveCardEntries(entries, label, cardsById) {
  if (!Array.isArray(entries)) {
    throw new Error(`${label} must be an array.`)
  }

  let total = 0
  const ids = new Set()
  return entries.flatMap((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`${label} entry ${index + 1} is invalid.`)
    }
    const id = requireString(entry.id, `${label} card ID`, 100)
    if (ids.has(id)) {
      throw new Error(`${label} contains duplicate card ID ${id}.`)
    }
    if (!Number.isInteger(entry.count) || entry.count < 1) {
      throw new Error(`${label} entry ${id} has an invalid quantity.`)
    }
    total += entry.count
    if (total > MAX_DECK_ZONE_CARDS) {
      throw new Error(
        `${label} contains more than ${MAX_DECK_ZONE_CARDS} cards.`,
      )
    }
    ids.add(id)
    const card = resolveCard(id, `${label} card`, cardsById, VALID_DECK_CARD_TYPES)
    return Array.from({ length: entry.count }, () => card)
  })
}

function restoreMetadata(value) {
  if (value === undefined) return undefined
  if (!isObject(value)) {
    throw new Error('Deck metadata is invalid.')
  }
  const metadata = {}
  if (value.name !== undefined) {
    metadata.name = requireString(value.name, 'Deck metadata name', 100)
  }
  if (value.author !== undefined) {
    metadata.author = requireString(value.author, 'Deck metadata author', 100)
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function restoreDeckRecord(
  candidate,
  index,
  cardsById,
  ids,
  names,
  collectionCheckpoint,
  version,
) {
  if (!isObject(candidate) || !isObject(candidate.deck)) {
    throw new Error(`Deck ${index + 1} is invalid.`)
  }
  const id = requireString(candidate.id, `Deck ${index + 1} ID`, 200)
  const name = requireString(candidate.name, `Deck ${index + 1} name`, 100)
  const nameKey = name.toLocaleLowerCase()
  if (ids.has(id) || names.has(nameKey)) {
    throw new Error(`Deck ${index + 1} has a duplicate ID or name.`)
  }
  if (!VALID_DECK_KINDS.has(candidate.kind)) {
    throw new Error(`Deck ${index + 1} has an invalid kind.`)
  }

  ids.add(id)
  names.add(nameKey)
  const metadata = restoreMetadata(candidate.deck.metadata)
  const candidateCheckpoint = candidate.collectionCheckpoint
  const restoredCheckpoint =
    isObject(candidateCheckpoint) &&
    candidateCheckpoint.historyId === collectionCheckpoint.historyId &&
    Number.isInteger(candidateCheckpoint.revision) &&
    candidateCheckpoint.revision >= 0 &&
    candidateCheckpoint.revision <= collectionCheckpoint.revision
      ? {
          historyId: candidateCheckpoint.historyId,
          revision: candidateCheckpoint.revision,
        }
      : collectionCheckpoint
  const record = {
    id,
    name,
    kind: candidate.kind,
    collectionCheckpoint: restoredCheckpoint,
    createdAt: requireTimestamp(candidate.createdAt, `${name} creation date`),
    updatedAt: requireTimestamp(candidate.updatedAt, `${name} update date`),
    deck: {
      ...(metadata ? { metadata } : {}),
      leader: resolveSingleton(
        candidate.deck.leader,
        `${name} leader`,
        cardsById,
        'Leader',
      ),
      secondLeader: resolveSingleton(
        candidate.deck.secondLeader,
        `${name} second leader`,
        cardsById,
        'Leader',
      ),
      base: resolveSingleton(
        candidate.deck.base,
        `${name} base`,
        cardsById,
        'Base',
      ),
      drawDeck: resolveCardEntries(
        candidate.deck.drawDeck,
        `${name} draw deck`,
        cardsById,
      ),
      sideboard: resolveCardEntries(
        candidate.deck.sideboard,
        `${name} sideboard`,
        cardsById,
      ),
    },
  }
  record.history = version >= 3
    ? normalizePersistentDeckHistory(
        candidate.history,
        record.deck,
        record.collectionCheckpoint,
        { cardsById, strict: true },
      )
    : createPersistentDeckHistory(
        record.deck,
        record.collectionCheckpoint,
        'Imported player database',
      )
  return record
}

function restoreCollection(value, cardsById, version) {
  if (!isObject(value) || !Array.isArray(value.cards)) {
    throw new Error('The backup card collection is invalid.')
  }
  const ids = new Set()
  const cards = value.cards.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Collection entry ${index + 1} is invalid.`)
    }
    const id = requireString(entry.cardId, 'Collection card ID', 100)
    if (ids.has(id) || !cardsById?.has(id)) {
      throw new Error(`Collection card ${id} is duplicated or not in the catalog.`)
    }
    if (
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > MAX_COLLECTION_CARD_COUNT
    ) {
      throw new Error(`Collection card ${id} has an invalid quantity.`)
    }
    ids.add(id)
    return { cardId: id, count: entry.count }
  })
  if (version === 1) {
    return normalizeCardCollection({ revision: 0, cards })
  }

  const historyId = requireString(
    value.historyId,
    'Collection history ID',
    160,
  )
  if (!Number.isInteger(value.revision) || value.revision < 0) {
    throw new Error('The backup card collection revision is invalid.')
  }
  if (!Array.isArray(value.events) || value.events.length > MAX_COLLECTION_EVENTS) {
    throw new Error('The backup card collection history is invalid.')
  }
  const eventRevisions = new Set()
  const events = value.events.map((event, eventIndex) => {
    if (
      !isObject(event) ||
      !Number.isInteger(event.revision) ||
      event.revision < 1 ||
      event.revision > value.revision ||
      eventRevisions.has(event.revision) ||
      !Array.isArray(event.deltas) ||
      event.deltas.length < 1
    ) {
      throw new Error(`Collection history event ${eventIndex + 1} is invalid.`)
    }
    eventRevisions.add(event.revision)
    const changedAt = requireTimestamp(
      event.changedAt,
      `Collection history event ${eventIndex + 1} date`,
    )
    const deltas = event.deltas.map((delta, deltaIndex) => {
      if (
        !isObject(delta) ||
        !Number.isInteger(delta.delta) ||
        delta.delta === 0 ||
        Math.abs(delta.delta) > MAX_COLLECTION_CARD_COUNT
      ) {
        throw new Error(
          `Collection history event ${eventIndex + 1} delta ${deltaIndex + 1} is invalid.`,
        )
      }
      const card = resolveCard(
        delta.cardId,
        `Collection history event ${eventIndex + 1} card`,
        cardsById,
      )
      return { cardId: getCatalogCardId(card), delta: delta.delta }
    })
    return {
      revision: event.revision,
      changedAt,
      source: ['assistant', 'manual'].includes(event.source)
        ? event.source
        : 'manual',
      deltas,
    }
  })

  return normalizeCardCollection({
    historyId,
    revision: value.revision,
    cards,
    events,
  })
}

export function parsePlayerDatabaseBackup(source, cardsById) {
  const payload = parseBackupJson(source)
  if (!isObject(payload) || payload.format !== PLAYER_DATABASE_BACKUP_FORMAT) {
    throw new Error('This is not a SWU Deck Builder database backup.')
  }
  if (![1, 2, 3, PLAYER_DATABASE_BACKUP_VERSION].includes(payload.version)) {
    throw new Error(
      `Database backup version ${payload.version ?? '(missing)'} is not supported.`,
    )
  }
  const exportedAt = requireTimestamp(payload.exportedAt, 'Backup export date')
  if (!Array.isArray(payload.decks) || payload.decks.length > MAX_DECKS) {
    throw new Error(`A backup can contain no more than ${MAX_DECKS} decks.`)
  }

  const collection = restoreCollection(payload.collection, cardsById, payload.version)
  const collectionCheckpoint = createCollectionCheckpoint(collection)
  const ids = new Set()
  const names = new Set()
  const decks = payload.decks.map((candidate, index) =>
    restoreDeckRecord(
      candidate,
      index,
      cardsById,
      ids,
      names,
      collectionCheckpoint,
      payload.version,
    ),
  )
  const selectedDeckId = payload.selectedDeckId ?? null
  if (
    selectedDeckId !== null &&
    !decks.some((record) => record.id === selectedDeckId)
  ) {
    throw new Error('The selected deck is not present in the backup.')
  }

  return {
    exportedAt,
    decks,
    selectedDeckId: selectedDeckId ?? decks[0]?.id ?? null,
    collection,
  }
}
