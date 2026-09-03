export interface CompactCardGroup {
  id: string
  count: number
}

export interface CompactDeckHistorySnapshot {
  metadata?: { name?: string; author?: string }
  leader: string | null
  secondLeader: string | null
  base: string | null
  drawDeck: CompactCardGroup[]
  sideboard: CompactCardGroup[]
}

export type DeckHistoryDelta = Record<string, unknown>
