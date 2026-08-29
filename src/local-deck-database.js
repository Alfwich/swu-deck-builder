export const LOCAL_DECK_SELECTION_STORAGE_KEY =
  'swu-deck-builder.local-database-selection.v1'

export function databaseSnapshotFingerprint(records, collection, promptHistory) {
  return JSON.stringify({ records, collection, promptHistory })
}

export function loadLocalDeckSelection(storage) {
  try {
    return storage?.getItem(LOCAL_DECK_SELECTION_STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function saveLocalDeckSelection(storage, selectedId) {
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

async function readPayload(response) {
  return response.json().catch(() => ({}))
}

function databaseError(response, payload, fallback) {
  const error = new Error(payload.error ?? fallback)
  error.code = payload.code ?? ''
  error.status = response.status
  return error
}

export async function loadLocalDeckDatabase({
  fetchImpl = fetch,
  signal,
} = {}) {
  const response = await fetchImpl('/api/local/deck-library', { signal })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw databaseError(
      response,
      payload,
      'The local deck database could not be loaded.',
    )
  }
  return payload
}

export async function saveLocalDeckDatabase(
  expectedRevision,
  decks,
  collection,
  promptHistory,
  { fetchImpl = fetch, signal } = {},
) {
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
  return payload
}

export function selectDatabaseDeckId(records, storedId, legacyId) {
  return [storedId, legacyId]
    .find((id) => records.some((record) => record.id === id)) ??
    records[0]?.id ?? null
}

export function resolveDatabaseDeckSource(snapshot, browserLibrary) {
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

export function resolveDatabaseCollectionSource(snapshot, browserCollection) {
  return snapshot.collectionInitialized
    ? { needsInitialization: false, collection: snapshot.collection }
    : { needsInitialization: true, collection: browserCollection }
}

export function resolveDatabasePromptHistorySource(snapshot, browserHistory) {
  return snapshot.promptHistoryInitialized
    ? { needsInitialization: false, promptHistory: snapshot.promptHistory }
    : { needsInitialization: true, promptHistory: browserHistory }
}
