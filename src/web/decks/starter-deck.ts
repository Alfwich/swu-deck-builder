import { createEmptyDeck } from './deck-library-model.js'
import { parseSwudbDeck } from '../integrations/swudb.js'
import type { Catalog } from '../types/catalog.js'
import type { Deck, DeckRecordKind } from '../types/deck.js'
import type { StorageLike } from '../types/persistence.js'

export const STARTER_DECK_STORAGE_KEY = 'swu-deck-builder.starter-deck-seen.v1'

export const STARTER_DECK_SOURCE = JSON.stringify({
  metadata: {
    name: 'Grievous Starter',
    author: 'Force Table',
  },
  leader: {
    id: 'TWI_015',
    count: 1,
  },
  base: {
    id: 'TWI_023',
    count: 1,
  },
  deck: [
    { id: 'TWI_206', count: 1 },
    { id: 'TWI_104', count: 3 },
    { id: 'TWI_207', count: 2 },
    { id: 'TWI_084', count: 1 },
    { id: 'TWI_080', count: 1 },
    { id: 'TWI_180', count: 3 },
    { id: 'TWI_229', count: 3 },
    { id: 'TWI_230', count: 2 },
    { id: 'TWI_083', count: 3 },
    { id: 'TWI_184', count: 1 },
    { id: 'TWI_086', count: 1 },
    { id: 'TWI_217', count: 1 },
    { id: 'TWI_233', count: 2 },
    { id: 'TWI_087', count: 1 },
    { id: 'TWI_228', count: 2 },
    { id: 'TWI_079', count: 2 },
    { id: 'TWI_082', count: 1 },
    { id: 'TWI_112', count: 1 },
    { id: 'TWI_234', count: 1 },
    { id: 'TWI_237', count: 2 },
    { id: 'TWI_190', count: 1 },
    { id: 'TWI_221', count: 2 },
    { id: 'TWI_222', count: 1 },
    { id: 'SOR_124', count: 2 },
    { id: 'TWI_257', count: 1 },
    { id: 'TWI_238', count: 3 },
    { id: 'SOR_222', count: 2 },
    { id: 'TWI_218', count: 1 },
    { id: 'TWI_236', count: 3 },
  ],
  sideboard: [],
})

export function hasSeenStarterDeck(storage: StorageLike | null | undefined) {
  try {
    return storage?.getItem(STARTER_DECK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markStarterDeckSeen(storage: StorageLike | null | undefined) {
  try {
    storage?.setItem(STARTER_DECK_STORAGE_KEY, '1')
  } catch {
    // The deck remains usable when storage is unavailable, even if onboarding repeats.
  }
}

export function createStarterDeck(catalog: Catalog) {
  return parseSwudbDeck(STARTER_DECK_SOURCE, catalog)
}

export function createInitialDeck(
  catalog: Catalog,
  storage: StorageLike | null | undefined,
): { deck: Deck; kind: DeckRecordKind; name: string } {
  if (hasSeenStarterDeck(storage)) {
    return {
      deck: createEmptyDeck(),
      kind: 'saved',
      name: 'New deck',
    }
  }

  const starterDeck = createStarterDeck(catalog)
  markStarterDeckSeen(storage)

  return {
    ...starterDeck,
    kind: 'imported',
  }
}
