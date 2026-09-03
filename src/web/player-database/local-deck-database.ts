import type { CardCollection } from '../types/collection.js'
import type { DeckLibraryState, DeckRecord } from '../types/deck.js'
import type {
  LocalDeckDatabaseSnapshot,
  StorageLike,
} from '../types/persistence.js'

export const LOCAL_DECK_SELECTION_STORAGE_KEY =
  'swu-deck-builder.local-database-selection.v1'

export function databaseSnapshotFingerprint(
  records: DeckRecord[],
  collection: CardCollection,
  promptHistory: string[],
) {
  return JSON.stringify({ records, collection, promptHistory })
}

export function loadLocalDeckSelection(storage: StorageLike | null) {
  try {
    return storage?.getItem(LOCAL_DECK_SELECTION_STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function saveLocalDeckSelection(
  storage: StorageLike | null,
  selectedId: string | null,
) {
  try {
    if (selectedId) {
      storage?.setItem(LOCAL_DECK_SELECTION_STORAGE_KEY, selectedId)
    } else {
      storage?.removeItem?.(LOCAL_DECK_SELECTION_STORAGE_KEY)
    }
  } catch {
    // A database-backed library remains usable without this UI preference.
  }
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}))
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
}

export class LocalDeckDatabaseError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

function databaseError(
  response: Response,
  payload: Record<string, unknown>,
  fallback: string,
) {
  const error = new LocalDeckDatabaseError(
    typeof payload.error === 'string' ? payload.error : fallback,
    typeof payload.code === 'string' ? payload.code : '',
    response.status,
  )
  return error
}

function requireDatabaseSnapshot(
  payload: Record<string, unknown>,
): LocalDeckDatabaseSnapshot {
  if (
    typeof payload.revision !== 'number' ||
    !Number.isInteger(payload.revision) ||
    !Array.isArray(payload.decks)
  ) {
    throw new Error('The local deck database returned an invalid snapshot.')
  }
  return payload as unknown as LocalDeckDatabaseSnapshot
}

export async function loadLocalDeckDatabase({
  fetchImpl = fetch,
  signal,
}: {
  fetchImpl?: typeof fetch
  signal?: AbortSignal
} = {}): Promise<LocalDeckDatabaseSnapshot> {
  const response = await fetchImpl('/api/local/deck-library', { signal })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw databaseError(
      response,
      payload,
      'The local deck database could not be loaded.',
    )
  }
  return requireDatabaseSnapshot(payload)
}

export async function saveLocalDeckDatabase(
  expectedRevision: number,
  decks: DeckRecord[],
  collection: CardCollection,
  promptHistory: string[],
  {
    fetchImpl = fetch,
    signal,
  }: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<LocalDeckDatabaseSnapshot> {
  const response = await fetchImpl('/api/local/deck-library', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedRevision,
      decks,
      collection,
      promptHistory,
    }),
    signal,
  })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw databaseError(
      response,
      payload,
      'The local deck database could not be saved.',
    )
  }
  return requireDatabaseSnapshot(payload)
}

export function selectDatabaseDeckId(
  records: DeckRecord[],
  storedId: string | null,
  legacyId: string | null,
) {
  return [storedId, legacyId]
    .find((id) => records.some((record) => record.id === id)) ??
    records[0]?.id ?? null
}

export function resolveDatabaseDeckSource(
  snapshot: LocalDeckDatabaseSnapshot,
  browserLibrary: DeckLibraryState,
) {
  if (snapshot.initialized && snapshot.decks.length > 0) {
    return {
      needsInitialization: false,
      records: snapshot.decks,
      selectedId: browserLibrary.selectedId,
    }
  }

  return {
    needsInitialization: true,
    records: browserLibrary.records,
    selectedId: browserLibrary.selectedId,
  }
}

export function resolveDatabaseCollectionSource(
  snapshot: LocalDeckDatabaseSnapshot,
  browserCollection: CardCollection,
) {
  return snapshot.collectionInitialized
    ? { needsInitialization: false, collection: snapshot.collection }
    : { needsInitialization: true, collection: browserCollection }
}

export function resolveDatabasePromptHistorySource(
  snapshot: LocalDeckDatabaseSnapshot,
  browserHistory: string[],
) {
  return snapshot.promptHistoryInitialized
    ? { needsInitialization: false, promptHistory: snapshot.promptHistory }
    : { needsInitialization: true, promptHistory: browserHistory }
}
