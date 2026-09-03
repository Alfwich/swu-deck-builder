import type { DeckCard } from './catalog.js'
import type { Deck, DeckZone } from './deck.js'
import type {
  HistoryChangeEntry,
  HistoryReplacementEntry,
} from './history.js'

export type AgentOperation = 'answer' | 'build' | 'modify'
export type AgentChangeStatus = 'pending' | 'applied' | 'dismissed'
export type AgentProposalStatus = 'pending' | 'partial' | 'applied' | 'dismissed'
export type AgentMessageRole = 'assistant' | 'user' | 'system'

interface AgentChangeBase {
  id: string
  zone: DeckZone
  count: number
  status?: AgentChangeStatus
}

export interface AgentAddChange extends AgentChangeBase {
  type: 'add'
  card: Pick<DeckCard, 'id'> & Partial<DeckCard>
}

export interface AgentRemoveChange extends AgentChangeBase {
  type: 'remove'
  card: Pick<DeckCard, 'id'> & Partial<DeckCard>
}

export interface AgentReplaceChange extends AgentChangeBase {
  type: 'replace'
  from: Pick<DeckCard, 'id'> & Partial<DeckCard>
  to: Pick<DeckCard, 'id'> & Partial<DeckCard>
}

export type AgentChange = AgentAddChange | AgentRemoveChange | AgentReplaceChange

export interface CardChangePresentation {
  name: string | { from: string; to: string } | null
  additions: HistoryChangeEntry[]
  removals: HistoryChangeEntry[]
  replacements: HistoryReplacementEntry[]
}

export interface AgentProposal {
  operation: Exclude<AgentOperation, 'answer'>
  name: string
  deck: Deck
  changes: AgentChange[] | null
  visualChanges: CardChangePresentation | null
  hasCollectionChanges: boolean
  hasDeckChanges: boolean
  batchId: string | null
  targetCollectionRevision: number | null
  targetCollectionHistoryId: string | null
  targetDeckId: string
  targetDeckName: string
  targetDeckUpdatedAt: string
  status: AgentProposalStatus
}

export interface AgentMessage {
  id: string
  role: AgentMessageRole
  text: string
  features?: string[]
  followup?: string
  imageLabel?: string
  attachmentName?: string
  proposal?: AgentProposal | null
}

export interface AgentChatState {
  token: string
  expiresAt: string | null
  messages: AgentMessage[]
  deckId?: string | null
  deckName?: string
  deckUpdatedAt?: string | null
  hasConversation?: boolean
}

export interface RemoteAgentSession {
  token: string
  expiresAt: string | null
  hasConversation?: boolean
}

export interface AgentImageAttachment {
  file: File
  name: string
  previewUrl?: string
}

export type AgentChatResponsePayload = {
  message?: string
  session?: Partial<RemoteAgentSession>
} & (
  | { operation: 'answer'; deck?: null; changes?: null }
  | { operation: 'build'; name?: string | null; deck: Deck; changes?: null }
  | { operation: 'modify'; name?: string | null; deck: Deck; changes: AgentChange[] }
)
