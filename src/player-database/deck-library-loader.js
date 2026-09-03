import {
  loadLocalDeckDatabase,
  loadLocalDeckSelection,
  resolveDatabaseCollectionSource,
  resolveDatabaseDeckSource,
  resolveDatabasePromptHistorySource,
  saveLocalDeckDatabase,
  selectDatabaseDeckId,
} from '../local-deck-database.js'
import { addDeckRecord } from '../deck-library.js'
import { createInitialDeck } from '../starter-deck.js'

function createFirstDeckLibrary(catalog, storage) {
  const initial = addDeckRecord([], createInitialDeck(catalog, storage))
  return { records: initial.records, selectedId: initial.record.id }
}

export function browserDeckLibrary(catalog, storage, storedLibrary) {
  return storedLibrary.records.length > 0
    ? storedLibrary
    : createFirstDeckLibrary(catalog, storage)
}

export async function databaseDeckLibrary(
  catalog,
  storage,
  storedLibrary,
  storedCollection,
  storedPromptHistory,
  signal,
) {
  let snapshot = await loadLocalDeckDatabase({ signal })
  let library = resolveDatabaseDeckSource(snapshot, storedLibrary)
  const collectionSource = resolveDatabaseCollectionSource(
    snapshot,
    storedCollection,
  )
  const promptHistorySource = resolveDatabasePromptHistorySource(
    snapshot,
    storedPromptHistory,
  )

  if (
    library.needsInitialization ||
    collectionSource.needsInitialization ||
    promptHistorySource.needsInitialization
  ) {
    if (library.needsInitialization) {
      library = browserDeckLibrary(catalog, storage, storedLibrary)
    }
    snapshot = await saveLocalDeckDatabase(
      snapshot.revision,
      library.records,
      collectionSource.collection,
      promptHistorySource.promptHistory,
      { signal },
    )
  }

  return {
    collection: snapshot.collection,
    promptHistory: snapshot.promptHistory,
    records: library.records,
    revision: snapshot.revision,
    selectedId: selectDatabaseDeckId(
      library.records,
      loadLocalDeckSelection(storage),
      library.selectedId,
    ),
  }
}

export function deckInitializationError(error, mode) {
  if (mode === 'database') {
    return error instanceof Error
      ? `The local deck database could not be initialized: ${error.message}`
      : 'The local deck database could not be initialized.'
  }
  return error instanceof Error
    ? error.message
    : 'A new deck could not be created.'
}
