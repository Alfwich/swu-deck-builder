import {
  MAX_COLLECTION_CARD_COUNT,
  MAX_COLLECTION_EVENTS,
  createCollectionCheckpoint,
  normalizeCardCollection,
} from './card-collection.js'
import { getCatalogCardId } from '../catalog/catalog.js'
import {
  createPersistentDeckHistory,
  normalizePersistentDeckHistory,
} from '../decks/deck-history.js'
import type { DeckCard, ReadonlyCardReferenceMap } from '../types/catalog.js'
import type { CardCollection, CollectionCheckpoint } from '../types/collection.js'
import type { DeckMetadata, DeckRecord, DeckRecordKind } from '../types/deck.js'
import type { PlayerDatabase } from '../types/persistence.js'

export const PLAYER_DATABASE_BACKUP_FORMAT =
  'swu-deck-builder-player-database'
export const PLAYER_DATABASE_BACKUP_VERSION = 4
export const MAX_PLAYER_DATABASE_BACKUP_BYTES = 50 * 1024 * 1024

const MAX_DECKS = 250
const MAX_DECK_ZONE_CARDS = 1000
const VALID_DECK_KINDS = new Set<DeckRecordKind>(['ai', 'imported', 'saved'])
const VALID_DECK_CARD_TYPES = new Set<string>(['Unit', 'Event', 'Upgrade'])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isDeckRecordKind(value: unknown): value is DeckRecordKind {
  return typeof value === 'string' && VALID_DECK_KINDS.has(value as DeckRecordKind)
}

function cardId(card: DeckCard, label: string) {
  const id = getCatalogCardId(card)
  if (!id) {
    throw new Error(`${label} does not have a catalog card ID.`)
  }
  return id
}

function groupCards(cards: DeckCard[], label: string) {
  if (!Array.isArray(cards)) {
    throw new Error(`${label} must be an array.`)
  }

  const grouped = new Map<string, number>()
  cards.forEach((card) => {
    const id = cardId(card, label)
    grouped.set(id, (grouped.get(id) ?? 0) + 1)
  })
  return [...grouped].map(([id, count]) => ({ id, count }))
}

function backupMetadata(metadata: DeckMetadata | undefined) {
  if (!isObject(metadata)) return undefined
  const name = typeof metadata.name === 'string' ? metadata.name : ''
  const author = typeof metadata.author === 'string' ? metadata.author : ''
  if (!name && !author) return undefined
  return {
    ...(name ? { name: name.slice(0, 100) } : {}),
    ...(author ? { author: author.slice(0, 100) } : {}),
  }
}

function backupDeckRecord(record: DeckRecord) {
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
  {
    collection,
    decks,
    selectedDeckId,
  }: Pick<PlayerDatabase, 'collection' | 'decks' | 'selectedDeckId'>,
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

export function playerDatabaseBackupFilename(date: Date = new Date()) {
  const day = date.toISOString().slice(0, 10)
  return `swu-deck-builder-backup-${day}.json`
}

export function playerDatabaseBackupSizeError(size: number) {
  return size > MAX_PLAYER_DATABASE_BACKUP_BYTES
    ? 'Database backups must be 50 MB or smaller.'
    : null
}

function parseBackupJson(source: string): unknown {
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

function requireString(value: unknown, label: string, maximumLength: number) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result || result.length > maximumLength) {
    throw new Error(`${label} is invalid.`)
  }
  return result
}

function requireTimestamp(value: unknown, label: string) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} is invalid.`)
  }
  return value
}

function resolveCard(
  id: unknown,
  label: string,
  cardsById: ReadonlyCardReferenceMap,
  expectedTypes?: ReadonlySet<string>,
) {
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

function resolveSingleton(
  id: unknown,
  label: string,
  cardsById: ReadonlyCardReferenceMap,
  expectedType: string,
) {
  if (id === null || id === undefined) return null
  return resolveCard(id, label, cardsById, new Set([expectedType]))
}

function resolveCardEntries(
  entries: unknown,
  label: string,
  cardsById: ReadonlyCardReferenceMap,
) {
  if (!Array.isArray(entries)) {
    throw new Error(`${label} must be an array.`)
  }

  let total = 0
  const ids = new Set<string>()
  return entries.flatMap((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`${label} entry ${index + 1} is invalid.`)
    }
    const id = requireString(entry.id, `${label} card ID`, 100)
    if (ids.has(id)) {
      throw new Error(`${label} contains duplicate card ID ${id}.`)
    }
    const count = entry.count
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new Error(`${label} entry ${id} has an invalid quantity.`)
    }
    total += count
    if (total > MAX_DECK_ZONE_CARDS) {
      throw new Error(
        `${label} contains more than ${MAX_DECK_ZONE_CARDS} cards.`,
      )
    }
    ids.add(id)
    const card = resolveCard(id, `${label} card`, cardsById, VALID_DECK_CARD_TYPES)
    return Array.from({ length: count }, () => card)
  })
}

function restoreMetadata(value: unknown): DeckMetadata | undefined {
  if (value === undefined) return undefined
  if (!isObject(value)) {
    throw new Error('Deck metadata is invalid.')
  }
  const metadata: DeckMetadata = {}
  if (value.name !== undefined) {
    metadata.name = requireString(value.name, 'Deck metadata name', 100)
  }
  if (value.author !== undefined) {
    metadata.author = requireString(value.author, 'Deck metadata author', 100)
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function restoreDeckRecord(
  candidate: unknown,
  index: number,
  cardsById: ReadonlyCardReferenceMap,
  ids: Set<string>,
  names: Set<string>,
  collectionCheckpoint: CollectionCheckpoint,
  version: number,
): DeckRecord {
  if (!isObject(candidate) || !isObject(candidate.deck)) {
    throw new Error(`Deck ${index + 1} is invalid.`)
  }
  const id = requireString(candidate.id, `Deck ${index + 1} ID`, 200)
  const name = requireString(candidate.name, `Deck ${index + 1} name`, 100)
  const nameKey = name.toLocaleLowerCase()
  if (ids.has(id) || names.has(nameKey)) {
    throw new Error(`Deck ${index + 1} has a duplicate ID or name.`)
  }
  if (!isDeckRecordKind(candidate.kind)) {
    throw new Error(`Deck ${index + 1} has an invalid kind.`)
  }

  ids.add(id)
  names.add(nameKey)
  const metadata = restoreMetadata(candidate.deck.metadata)
  const candidateCheckpoint = candidate.collectionCheckpoint
  const candidateRevision = isObject(candidateCheckpoint)
    ? candidateCheckpoint.revision
    : undefined
  const restoredCheckpoint =
    isObject(candidateCheckpoint) &&
    candidateCheckpoint.historyId === collectionCheckpoint.historyId &&
    typeof candidateRevision === 'number' &&
    Number.isInteger(candidateRevision) &&
    candidateRevision >= 0 &&
    candidateRevision <= collectionCheckpoint.revision
      ? {
          historyId: candidateCheckpoint.historyId,
          revision: candidateRevision,
        }
      : collectionCheckpoint
  const deck = {
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
  }
  const history = version >= 3
    ? normalizePersistentDeckHistory(
        candidate.history,
        deck,
        restoredCheckpoint,
        { cardsById, strict: true },
      )
    : createPersistentDeckHistory(
        deck,
        restoredCheckpoint,
        'Imported player database',
      )
  const record: DeckRecord = {
    id,
    name,
    kind: candidate.kind,
    collectionCheckpoint: restoredCheckpoint,
    createdAt: requireTimestamp(candidate.createdAt, `${name} creation date`),
    updatedAt: requireTimestamp(candidate.updatedAt, `${name} update date`),
    deck,
    history,
  }
  return record
}

function restoreCollection(
  value: unknown,
  cardsById: ReadonlyCardReferenceMap,
  version: number,
): CardCollection {
  if (!isObject(value) || !Array.isArray(value.cards)) {
    throw new Error('The backup card collection is invalid.')
  }
  const ids = new Set<string>()
  const cards = value.cards.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Collection entry ${index + 1} is invalid.`)
    }
    const id = requireString(entry.cardId, 'Collection card ID', 100)
    if (ids.has(id) || !cardsById?.has(id)) {
      throw new Error(`Collection card ${id} is duplicated or not in the catalog.`)
    }
    const count = entry.count
    if (
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_COLLECTION_CARD_COUNT
    ) {
      throw new Error(`Collection card ${id} has an invalid quantity.`)
    }
    ids.add(id)
    return { cardId: id, count }
  })
  if (version === 1) {
    return normalizeCardCollection({ revision: 0, cards })
  }

  const historyId = requireString(
    value.historyId,
    'Collection history ID',
    160,
  )
  const revision = value.revision
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) {
    throw new Error('The backup card collection revision is invalid.')
  }
  if (!Array.isArray(value.events) || value.events.length > MAX_COLLECTION_EVENTS) {
    throw new Error('The backup card collection history is invalid.')
  }
  const eventRevisions = new Set<number>()
  const events = value.events.map((event, eventIndex) => {
    const eventRevision = isObject(event) ? event.revision : undefined
    if (
      !isObject(event) ||
      typeof eventRevision !== 'number' ||
      !Number.isInteger(eventRevision) ||
      eventRevision < 1 ||
      eventRevision > revision ||
      eventRevisions.has(eventRevision) ||
      !Array.isArray(event.deltas) ||
      event.deltas.length < 1
    ) {
      throw new Error(`Collection history event ${eventIndex + 1} is invalid.`)
    }
    eventRevisions.add(eventRevision)
    const changedAt = requireTimestamp(
      event.changedAt,
      `Collection history event ${eventIndex + 1} date`,
    )
    const deltas = event.deltas.map((delta, deltaIndex) => {
      const deltaCount = isObject(delta) ? delta.delta : undefined
      if (
        !isObject(delta) ||
        typeof deltaCount !== 'number' ||
        !Number.isInteger(deltaCount) ||
        deltaCount === 0 ||
        Math.abs(deltaCount) > MAX_COLLECTION_CARD_COUNT
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
      return { cardId: getCatalogCardId(card)!, delta: deltaCount }
    })
    return {
      revision: eventRevision,
      changedAt,
      source: event.source === 'assistant' || event.source === 'manual'
        ? event.source
        : 'manual',
      deltas,
    }
  })

  return normalizeCardCollection({
    historyId,
    revision,
    cards,
    events,
  })
}

export function parsePlayerDatabaseBackup(
  source: string,
  cardsById: ReadonlyCardReferenceMap,
): PlayerDatabase {
  const payload = parseBackupJson(source)
  if (!isObject(payload) || payload.format !== PLAYER_DATABASE_BACKUP_FORMAT) {
    throw new Error('This is not a SWU Deck Builder database backup.')
  }
  const version = payload.version
  if (typeof version !== 'number' || ![1, 2, 3, PLAYER_DATABASE_BACKUP_VERSION].includes(version)) {
    throw new Error(
      `Database backup version ${payload.version ?? '(missing)'} is not supported.`,
    )
  }
  const exportedAt = requireTimestamp(payload.exportedAt, 'Backup export date')
  if (!Array.isArray(payload.decks) || payload.decks.length > MAX_DECKS) {
    throw new Error(`A backup can contain no more than ${MAX_DECKS} decks.`)
  }

  const collection = restoreCollection(payload.collection, cardsById, version)
  const collectionCheckpoint = createCollectionCheckpoint(collection)
  const ids = new Set<string>()
  const names = new Set<string>()
  const decks = payload.decks.map((candidate, index) =>
    restoreDeckRecord(
      candidate,
      index,
      cardsById,
      ids,
      names,
      collectionCheckpoint,
      version,
    ),
  )
  const selectedDeckId = payload.selectedDeckId ?? null
  if (
    selectedDeckId !== null &&
    (typeof selectedDeckId !== 'string' ||
      !decks.some((record) => record.id === selectedDeckId))
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
