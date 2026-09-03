import {
  alignPersistentDeckHistoryCheckpoints,
  createPersistentDeckHistory,
  normalizePersistentDeckHistory,
} from './deck-history.js'
import type { CollectionCheckpoint } from '../types/collection.js'
import type {
  Deck,
  DeckLibraryState,
  DeckRecord,
  DeckRecordKind,
} from '../types/deck.js'
import type { PersistentDeckHistory } from '../types/history.js'
import type { StorageLike } from '../types/persistence.js'

export const DECK_LIBRARY_STORAGE_KEY = 'swu-deck-builder.deck-library.v1'

const MAX_DECK_NAME_LENGTH = 100
const VALID_KINDS = new Set<DeckRecordKind>(['ai', 'imported', 'saved'])

interface AddDeckRecordOptions {
  deck: Deck
  name: unknown
  kind?: DeckRecordKind
  collectionCheckpoint?: CollectionCheckpoint | null
  historyLabel?: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeDeckKind(value: unknown): DeckRecordKind {
  return typeof value === 'string' && VALID_KINDS.has(value as DeckRecordKind)
    ? value as DeckRecordKind
    : 'saved'
}

function createDeckId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `deck-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isPersistableDeck(deck: unknown): deck is Deck {
  return Boolean(
    isObject(deck) &&
      Array.isArray(deck.drawDeck) &&
      Array.isArray(deck.sideboard),
  )
}

function normalizeCollectionCheckpoint(
  value: unknown,
): CollectionCheckpoint | null {
  const historyId = isObject(value) ? value.historyId : undefined
  const revision = isObject(value) ? value.revision : undefined
  return typeof historyId === 'string' &&
    historyId.trim() &&
    historyId.length <= 160 &&
    typeof revision === 'number' &&
    Number.isInteger(revision) &&
    revision >= 0
    ? { historyId: historyId.trim(), revision }
    : null
}

export function alignDeckCollectionCheckpoints(
  records: DeckRecord[],
  checkpoint: CollectionCheckpoint,
) {
  const normalizedCheckpoint = normalizeCollectionCheckpoint(checkpoint)
  if (!normalizedCheckpoint) return records

  return records.map((record) => {
    const existing = normalizeCollectionCheckpoint(record.collectionCheckpoint)
    const collectionCheckpoint = existing?.historyId === normalizedCheckpoint.historyId &&
      existing.revision <= normalizedCheckpoint.revision
      ? existing
      : normalizedCheckpoint
    return {
      ...record,
      collectionCheckpoint,
      history: alignPersistentDeckHistoryCheckpoints(
        record.history,
        normalizedCheckpoint,
      ),
    }
  })
}

export function createEmptyDeck(): Deck {
  return {
    leader: null,
    secondLeader: null,
    base: null,
    drawDeck: [],
    sideboard: [],
  }
}

export function normalizeDeckName(value: unknown, fallback = 'Untitled deck') {
  const name = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')

  return (name || fallback).slice(0, MAX_DECK_NAME_LENGTH)
}

function normalizedNameKey(value: unknown) {
  return normalizeDeckName(value).toLocaleLowerCase()
}

export function isDeckNameAvailable(
  records: DeckRecord[],
  name: unknown,
  excludedId: string | null = null,
) {
  const key = normalizedNameKey(name)
  return !records.some(
    (record) => record.id !== excludedId && normalizedNameKey(record.name) === key,
  )
}

export function createUniqueDeckName(
  records: DeckRecord[],
  requestedName: unknown,
  excludedId: string | null = null,
) {
  const baseName = normalizeDeckName(requestedName)

  if (isDeckNameAvailable(records, baseName, excludedId)) {
    return baseName
  }

  let suffix = 2
  while (!isDeckNameAvailable(records, `${baseName} (${suffix})`, excludedId)) {
    suffix += 1
  }

  return `${baseName} (${suffix})`
}

export function addDeckRecord(
  records: DeckRecord[],
  {
    deck,
    name,
    kind = 'saved',
    collectionCheckpoint = null,
    historyLabel = null,
  }: AddDeckRecordOptions,
): { records: DeckRecord[]; record: DeckRecord } {
  const timestamp = new Date().toISOString()
  const record: DeckRecord = {
    id: createDeckId(),
    name: createUniqueDeckName(records, name),
    kind: VALID_KINDS.has(kind) ? kind : 'saved',
    deck,
    collectionCheckpoint: normalizeCollectionCheckpoint(collectionCheckpoint),
    createdAt: timestamp,
    updatedAt: timestamp,
    history: createPersistentDeckHistory(
      deck,
      normalizeCollectionCheckpoint(collectionCheckpoint),
      historyLabel ?? (kind === 'imported' ? 'Imported deck' : 'Loaded deck'),
    ),
  }

  return { records: [...records, record], record }
}

export function updateDeckRecord(
  records: DeckRecord[],
  id: string,
  deck: Deck,
  collectionCheckpoint: CollectionCheckpoint | null = null,
  history: PersistentDeckHistory | undefined = undefined,
): { records: DeckRecord[]; record: DeckRecord } {
  const existing = records.find((record) => record.id === id)

  if (!existing) {
    throw new Error('The selected deck is no longer in the deck library.')
  }

  const nextCheckpoint =
    normalizeCollectionCheckpoint(collectionCheckpoint) ??
    existing.collectionCheckpoint ??
    null
  const record = {
    ...existing,
    deck,
    collectionCheckpoint: nextCheckpoint,
    history: history === undefined
      ? createPersistentDeckHistory(deck, nextCheckpoint)
      : normalizePersistentDeckHistory(history, deck, nextCheckpoint),
    updatedAt: new Date().toISOString(),
  }

  return {
    records: records.map((candidate) =>
      candidate.id === id ? record : candidate,
    ),
    record,
  }
}

export function renameDeckRecord(
  records: DeckRecord[],
  id: string,
  requestedName: unknown,
) {
  const name = normalizeDeckName(requestedName, '')

  if (!name) {
    throw new Error('Deck names cannot be empty.')
  }

  if (!isDeckNameAvailable(records, name, id)) {
    throw new Error(`A deck named “${name}” already exists.`)
  }

  const existing = records.find((record) => record.id === id)
  if (!existing) {
    throw new Error('The selected deck is no longer in the deck library.')
  }

  return records.map((record) =>
    record.id === id
      ? { ...record, name, updatedAt: new Date().toISOString() }
      : record,
  )
}

export function deleteDeckRecord(
  records: DeckRecord[],
  id: string,
  selectedId: string | null,
): DeckLibraryState {
  const deletedIndex = records.findIndex((record) => record.id === id)

  if (deletedIndex === -1) {
    throw new Error('The selected deck is no longer in the deck library.')
  }

  const nextRecords = records.filter((record) => record.id !== id)
  const nextSelectedId =
    selectedId === id
      ? nextRecords[Math.min(deletedIndex, nextRecords.length - 1)]?.id ?? null
      : selectedId

  return { records: nextRecords, selectedId: nextSelectedId }
}

export function loadDeckLibrary(storage: StorageLike | null): DeckLibraryState {
  try {
    const raw = storage?.getItem(DECK_LIBRARY_STORAGE_KEY)
    if (!raw) {
      return { records: [], selectedId: null }
    }

    const payload: unknown = JSON.parse(raw)
    if (!isObject(payload) || !Array.isArray(payload.decks)) {
      return { records: [], selectedId: null }
    }

    const records: DeckRecord[] = []
    const ids = new Set<string>()
    payload.decks.forEach((candidate: unknown) => {
      if (!isObject(candidate) || !isPersistableDeck(candidate.deck)) {
        return
      }

      const kind = normalizeDeckKind(candidate.kind)

      const id =
        typeof candidate.id === 'string' && candidate.id && !ids.has(candidate.id)
          ? candidate.id
          : createDeckId()
      const name = createUniqueDeckName(records, candidate.name)
      const timestamp = new Date().toISOString()

      const deck = {
        ...candidate.deck,
        leader: candidate.deck.leader ?? null,
        secondLeader: candidate.deck.secondLeader ?? null,
        base: candidate.deck.base ?? null,
      }
      const collectionCheckpoint = normalizeCollectionCheckpoint(
        candidate.collectionCheckpoint,
      )
      records.push({
        id,
        name,
        kind,
        deck,
        collectionCheckpoint,
        history: normalizePersistentDeckHistory(
          candidate.history,
          deck,
          collectionCheckpoint,
        ),
        createdAt: typeof candidate.createdAt === 'string'
          ? candidate.createdAt
          : timestamp,
        updatedAt: typeof candidate.updatedAt === 'string'
          ? candidate.updatedAt
          : timestamp,
      })
      ids.add(id)
    })

    const requestedSelectedId = typeof payload.selectedId === 'string'
      ? payload.selectedId
      : null
    const selectedId = records.some((record) => record.id === requestedSelectedId)
      ? requestedSelectedId
      : records[0]?.id ?? null

    return { records, selectedId }
  } catch {
    return { records: [], selectedId: null }
  }
}

export function saveDeckLibrary(
  storage: StorageLike | null,
  records: DeckRecord[],
  selectedId: string | null,
) {
  storage?.setItem(
    DECK_LIBRARY_STORAGE_KEY,
    JSON.stringify({ version: 5, selectedId, decks: records }),
  )
}
