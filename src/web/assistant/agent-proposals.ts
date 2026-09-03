import { applyCardCollectionChanges } from '../player-database/card-collection.js'
import {
  applyCardChanges,
  createCardChangePresentation,
} from '../decks/changes/deck-changes.js'
import type {
  AgentChange,
  AgentOperation,
  AgentProposal,
  AgentProposalStatus,
} from '../types/assistant.js'
import type { ReadonlyCardReferenceMap } from '../types/catalog.js'
import type { CardCollection } from '../types/collection.js'
import type { Deck, DeckRecord } from '../types/deck.js'

type AgentProposalPayload =
  | { operation: 'answer' }
  | {
      operation: Exclude<AgentOperation, 'answer'>
      name?: string | null
      deck: Deck
      changes?: AgentChange[] | null
    }

export function createAgentChatProposal(
  payload: AgentProposalPayload,
  contextRecord: DeckRecord,
  collection: CardCollection,
  cardReferences: ReadonlyCardReferenceMap,
  batchId: string | null,
): AgentProposal | null {
  if (payload.operation === 'answer') {
    return null
  }

  const changes =
    payload.operation === 'modify'
      ? (payload.changes ?? []).map((change) => ({
          ...change,
          status: 'pending' as const,
        }))
      : null
  const hasCollectionChanges = changes?.some(
    (change) => change.zone === 'collection',
  ) ?? false
  const hasDeckChanges = changes?.some(
    (change) => change.zone !== 'collection',
  ) ?? false
  return {
    operation: payload.operation,
    name: payload.name || 'AI deck',
    deck: payload.deck,
    changes,
    visualChanges:
      payload.operation === 'modify'
        ? createCardChangePresentation(
            contextRecord.deck,
            payload.deck,
            changes,
            cardReferences,
          )
        : null,
    hasCollectionChanges,
    hasDeckChanges,
    batchId,
    targetCollectionRevision: hasCollectionChanges
      ? collection.revision
      : null,
    targetCollectionHistoryId: hasCollectionChanges
      ? collection.historyId
      : null,
    targetDeckId: contextRecord.id,
    targetDeckName: contextRecord.name,
    targetDeckUpdatedAt: contextRecord.updatedAt,
    status: 'pending',
  }
}

export function proposalActionLabel(
  proposal: AgentProposal,
  pendingChangeCount: number,
) {
  if (proposal.operation === 'build') {
    return 'Save new deck'
  }
  return pendingChangeCount < (proposal.changes?.length ?? 0)
    ? 'Apply remaining'
    : 'Apply all'
}

export function proposalStatusLabel(status: AgentProposalStatus) {
  if (status === 'applied') {
    return 'Applied'
  }
  return status === 'partial' ? 'Partially applied' : 'Dismissed'
}

export function proposalStaleError(
  proposal: AgentProposal,
  targetRecord: DeckRecord | null,
  collection: CardCollection,
  { checkCollection, checkDeck }: {
    checkCollection: boolean
    checkDeck: boolean
  },
) {
  if (checkDeck && !targetRecord) {
    return 'The deck targeted by this proposal no longer exists.'
  }
  if (
    checkDeck &&
    targetRecord?.updatedAt !== proposal.targetDeckUpdatedAt
  ) {
    return 'That deck changed after this proposal was created. Ask the assistant to update it again.'
  }
  if (
    checkCollection &&
    (
      collection.historyId !== proposal.targetCollectionHistoryId ||
      collection.revision !== proposal.targetCollectionRevision
    )
  ) {
    return 'The card library changed after this proposal was created. Ask the assistant to update it again.'
  }
  return ''
}

export function applyAgentProposalChanges(
  deck: Deck,
  collection: CardCollection,
  changes: AgentChange[],
  referenceDeck: Deck,
) {
  const deckChanges = changes.filter((change) => change.zone !== 'collection')
  const collectionChanges = changes.filter(
    (change) => change.zone === 'collection',
  )
  return {
    collection:
      collectionChanges.length > 0
        ? applyCardCollectionChanges(collection, collectionChanges)
        : collection,
    deck:
      deckChanges.length > 0
        ? applyCardChanges(deck, deckChanges, referenceDeck)
        : deck,
    collectionChanged: collectionChanges.length > 0,
    deckChanged: deckChanges.length > 0,
  }
}
