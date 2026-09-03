import type { CardCollection } from './collection.js'
import type { DeckRecord } from './deck.js'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export interface PlayerDatabase {
  exportedAt: string
  decks: DeckRecord[]
  selectedDeckId: string | null
  collection: CardCollection
}

export interface LocalDeckDatabaseSnapshot {
  revision: number
  initialized: boolean
  collectionInitialized: boolean
  promptHistoryInitialized: boolean
  decks: DeckRecord[]
  collection: CardCollection
  promptHistory: string[]
}
