export type CollectionEventSource = 'assistant' | 'manual'

export interface CollectionCardEntry {
  cardId: string
  count: number
}

export interface CollectionDelta {
  cardId: string
  delta: number
}

export interface CollectionEvent {
  revision: number
  changedAt: string
  source: CollectionEventSource
  deltas: CollectionDelta[]
}

export interface CardCollection {
  historyId: string
  revision: number
  cards: CollectionCardEntry[]
  events: CollectionEvent[]
}

export interface CollectionCheckpoint {
  historyId: string
  revision: number
}

export interface CollectionChangeSummary {
  historyId: string
  fromRevision: number
  throughRevision: number
  additions: Array<CollectionCardEntry & {
    firstAddedAt?: string
    lastAddedAt?: string
  }>
  removals: Array<CollectionCardEntry & {
    firstRemovedAt?: string
    lastRemovedAt?: string
  }>
  historyAvailable: boolean
}

export interface CardOwnershipStatus {
  kind: 'none' | 'partial' | 'all'
  label: string
}
