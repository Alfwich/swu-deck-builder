import {
  loadLocalDeckDatabase,
  loadLocalDeckSelection,
  resolveDatabaseCollectionSource,
  resolveDatabaseDeckSource,
  resolveDatabasePromptHistorySource,
  saveLocalDeckDatabase,
  selectDatabaseDeckId,
} from './local-deck-database.js'
import { addDeckRecord } from '../decks/deck-library-model.js'
import { createInitialDeck } from '../decks/starter-deck.js'
import type { Catalog } from '../types/catalog.js'
import type { CardCollection } from '../types/collection.js'
import type { DeckLibraryState } from '../types/deck.js'
import type { StorageLike } from '../types/persistence.js'

function createFirstDeckLibrary(
  catalog: Catalog,
  storage: StorageLike | null,
): DeckLibraryState {
  const initial = addDeckRecord([], createInitialDeck(catalog, storage))
  return { records: initial.records, selectedId: initial.record.id }
}

export function browserDeckLibrary(
  catalog: Catalog,
  storage: StorageLike | null,
  storedLibrary: DeckLibraryState,
): DeckLibraryState {
  return storedLibrary.records.length > 0
    ? storedLibrary
    : createFirstDeckLibrary(catalog, storage)
}

export async function databaseDeckLibrary(
  catalog: Catalog,
  storage: StorageLike | null,
  storedLibrary: DeckLibraryState,
  storedCollection: CardCollection,
  storedPromptHistory: string[],
  signal?: AbortSignal,
) {
  let snapshot = await loadLocalDeckDatabase({ signal })
  let library: DeckLibraryState & { needsInitialization?: boolean } =
    resolveDatabaseDeckSource(snapshot, storedLibrary)
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

export function deckInitializationError(
  error: unknown,
  mode: 'browser' | 'database',
) {
  if (mode === 'database') {
    return error instanceof Error
      ? `The local deck database could not be initialized: ${error.message}`
      : 'The local deck database could not be initialized.'
  }
  return error instanceof Error
    ? error.message
    : 'A new deck could not be created.'
}
