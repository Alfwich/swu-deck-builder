import type { DeckCard } from './catalog.js'
import type { CollectionCheckpoint } from './collection.js'
import type { Deck, DeckZone } from './deck.js'
import type {
  CompactDeckHistorySnapshot,
  DeckHistoryDelta,
} from '../../shared/deck-history-types.js'

export type {
  CompactCardGroup,
  CompactDeckHistorySnapshot,
  DeckHistoryDelta,
} from '../../shared/deck-history-types.js'

export type DeckHistoryVisualKind =
  | 'addition'
  | 'mixed'
  | 'removal'
  | 'replacement'

export interface CompactHistoryVisualCard {
  cardId: string
  kind: DeckHistoryVisualKind
}

export interface HydratedHistoryVisualCard {
  card: DeckCard
  kind: DeckHistoryVisualKind
}

export interface HistoryChangeEntry {
  id: string
  name?: string
  subtitle?: string | null
  zone: DeckZone
  zoneLabel: string
  count?: number
  changeId?: string
  card?: DeckCard | null
  status?: string
}

export interface HistoryReplacementEntry {
  zone: DeckZone
  zoneLabel: string
  count: number
  changeId?: string
  status?: string
  from: HistoryChangeEntry
  to: HistoryChangeEntry
}

export interface HistoryChangeDetails {
  name: string | { from: string; to: string } | null
  additions: HistoryChangeEntry[]
  removals: HistoryChangeEntry[]
  replacements: HistoryReplacementEntry[]
}

export interface CompactHistoryVisual {
  cardId: string
  kind: DeckHistoryVisualKind
  count: number
  cards?: CompactHistoryVisualCard[]
  details?: HistoryChangeDetails | null
}

export interface HydratedHistoryVisual {
  card: DeckCard
  kind: DeckHistoryVisualKind
  count?: number
  cards?: HydratedHistoryVisualCard[]
  details?: HistoryChangeDetails | null
}

interface PersistentDeckHistoryEntryBase {
  revision: number
  parentRevision: number | null
  changedAt: string | null
  label: string
  collectionCheckpoint: CollectionCheckpoint | null
  visual: CompactHistoryVisual | null
}

export type PersistentDeckHistoryEntry = PersistentDeckHistoryEntryBase & (
  | { snapshot: CompactDeckHistorySnapshot; delta?: never }
  | { delta: DeckHistoryDelta; snapshot?: never }
)

export interface PersistentDeckHistory {
  format: number
  historyId: string
  revision: number
  position: number
  entries: PersistentDeckHistoryEntry[]
}

export interface DeckHistoryEntry {
  deck?: Deck
  label: string
  visual?: HydratedHistoryVisual | null
}

export interface DeckHistory {
  entries: DeckHistoryEntry[]
  position: number
}

export type DeckHistories = Record<string, DeckHistory>
