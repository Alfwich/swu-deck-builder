import type { DeckCard } from './catalog.js'
import type { CollectionCheckpoint } from './collection.js'
import type { PersistentDeckHistory } from './history.js'

export type DeckRecordKind = 'ai' | 'imported' | 'saved'
export type DeckCardZone = 'leader' | 'secondLeader' | 'base' | 'drawDeck' | 'sideboard'
export type DeckZone = DeckCardZone | 'collection'

export interface DeckMetadata {
  name?: string
  author?: string
}

export interface Deck {
  metadata?: DeckMetadata
  leader: DeckCard | null
  secondLeader: DeckCard | null
  base: DeckCard | null
  drawDeck: DeckCard[]
  sideboard: DeckCard[]
}

export interface DeckRecord {
  id: string
  name: string
  kind: DeckRecordKind
  deck: Deck
  collectionCheckpoint: CollectionCheckpoint | null
  history: PersistentDeckHistory
  createdAt: string
  updatedAt: string
}

export interface DeckLibraryState {
  records: DeckRecord[]
  selectedId: string | null
}
