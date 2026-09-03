import { getGameplayCardKey } from '../catalog/catalog.js'
import type { DeckCard, ReadonlyCardReferenceMap } from '../types/catalog.js'
import type {
  CardCollection,
  CardOwnershipStatus,
  CollectionCheckpoint,
  CollectionDelta,
  CollectionEvent,
  CollectionEventSource,
} from '../types/collection.js'
import type { Deck } from '../types/deck.js'
import type { StorageLike } from '../types/persistence.js'

export const CARD_COLLECTION_STORAGE_KEY =
  'swu-deck-builder.card-collection.v1'
export const MAX_COLLECTION_CARD_COUNT = 999
export const MAX_COLLECTION_EVENTS = 10000
export const RECENT_COLLECTION_EVENT_LIMIT = 4

interface CollectionMutationOptions {
  source?: CollectionEventSource
  changedAt?: string
}

interface CollectionChangeInput {
  zone?: string
  type?: string
  card?: { id?: string }
  cardId?: string
  count: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validCollectionEventSource(value: unknown): CollectionEventSource {
  return value === 'assistant' ? 'assistant' : 'manual'
}

function createCollectionHistoryId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `collection-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function validHistoryId(value: unknown) {
  return typeof value === 'string' && value.trim() && value.length <= 160
    ? value.trim()
    : null
}

function validTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function normalizeCollectionEvents(value: unknown, revision: number): CollectionEvent[] {
  const events: CollectionEvent[] = []
  const revisions = new Set<number>()
  for (const candidate of Array.isArray(value) ? value : []) {
    if (
      !Number.isInteger(candidate?.revision) ||
      candidate.revision < 1 ||
      candidate.revision > revision ||
      revisions.has(candidate.revision)
    ) {
      continue
    }
    revisions.add(candidate.revision)
    const changedAt = validTimestamp(candidate.changedAt)
    if (!changedAt || !Array.isArray(candidate.deltas)) continue
    const deltas = candidate.deltas
      .map((delta: unknown) => {
        const rawCardId = isObject(delta) ? delta.cardId : undefined
        const rawDelta = isObject(delta) ? delta.delta : undefined
        return {
          cardId: validCardId(rawCardId),
          delta: typeof rawDelta === 'number' &&
            Number.isInteger(rawDelta) && rawDelta !== 0
            ? Math.max(
                -MAX_COLLECTION_CARD_COUNT,
                Math.min(rawDelta, MAX_COLLECTION_CARD_COUNT),
              )
            : null,
        }
      })
      .filter((delta: { cardId: string | null; delta: number | null }):
        delta is CollectionDelta => Boolean(delta.cardId && delta.delta))
    if (deltas.length === 0) continue
    events.push({
      revision: candidate.revision,
      changedAt,
      deltas,
      source: validCollectionEventSource(candidate.source),
    })
  }

  return events
    .sort((left, right) => left.revision - right.revision)
    .slice(-MAX_COLLECTION_EVENTS)
}

function validCardId(value: unknown) {
  const cardId = typeof value === 'string' ? value.trim() : ''
  return cardId && cardId.length <= 100 ? cardId : null
}

function validCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_COLLECTION_CARD_COUNT)
    : null
}

export function createEmptyCardCollection(): CardCollection {
  return {
    historyId: createCollectionHistoryId(),
    revision: 0,
    cards: [],
    events: [],
  }
}

export function normalizeCardCollection(value: unknown): CardCollection {
  const grouped = new Map<string, number>()
  const candidateCards = isObject(value) && Array.isArray(value.cards)
    ? value.cards
    : []
  for (const candidate of candidateCards) {
    const cardId = validCardId(candidate?.cardId)
    const count = validCount(candidate?.count)
    if (!cardId || !count) continue
    grouped.set(
      cardId,
      Math.min(
        (grouped.get(cardId) ?? 0) + count,
        MAX_COLLECTION_CARD_COUNT,
      ),
    )
  }

  const rawRevision = isObject(value) ? value.revision : undefined
  const revision =
    Number.isInteger(rawRevision) && Number(rawRevision) >= 0
      ? Number(rawRevision)
      : 0
  return {
    historyId: validHistoryId(isObject(value) ? value.historyId : undefined) ??
      createCollectionHistoryId(),
    revision,
    cards: [...grouped].map(([cardId, count]) => ({ cardId, count })),
    events: normalizeCollectionEvents(
      isObject(value) ? value.events : undefined,
      revision,
    ),
  }
}

export function loadCardCollection(storage: StorageLike | null): CardCollection {
  try {
    const raw = storage?.getItem(CARD_COLLECTION_STORAGE_KEY)
    return raw
      ? normalizeCardCollection(JSON.parse(raw))
      : createEmptyCardCollection()
  } catch {
    return createEmptyCardCollection()
  }
}

export function saveCardCollection(
  storage: StorageLike | null,
  collection: CardCollection,
) {
  storage?.setItem(
    CARD_COLLECTION_STORAGE_KEY,
    JSON.stringify({ version: 2, ...normalizeCardCollection(collection) }),
  )
}

export function getCardCollectionCount(
  collection: CardCollection | null | undefined,
  cardId: string | null | undefined,
) {
  return collection?.cards?.find((entry) => entry.cardId === cardId)?.count ?? 0
}

export function getGameplayCardCollectionCount(
  collection: CardCollection | null | undefined,
  card: DeckCard | null,
  cardsById: ReadonlyCardReferenceMap | null | undefined,
) {
  if (!card) return 0
  const gameplayKey = getGameplayCardKey(card)
  return (collection?.cards ?? []).reduce((total, entry) => {
    const ownedCard = cardsById?.get(entry.cardId)
    return ownedCard && getGameplayCardKey(ownedCard) === gameplayKey
      ? total + entry.count
      : total
  }, 0)
}

export function getCardOwnershipStatus(
  ownedCount: number,
  requiredCount: number,
): CardOwnershipStatus {
  const required = Math.max(1, requiredCount)
  const owned = Math.min(Math.max(0, ownedCount), required)
  if (owned === 0) return { kind: 'none', label: 'None owned' }
  if (owned === required) return { kind: 'all', label: 'All owned' }
  return { kind: 'partial', label: `${owned} of ${required} owned` }
}

export function setCardCollectionCount(
  collection: CardCollection,
  cardId: string,
  requestedCount: number,
  {
    source = 'manual',
    changedAt = new Date().toISOString(),
  }: CollectionMutationOptions = {},
): CardCollection {
  const normalizedId = validCardId(cardId)
  if (!normalizedId) throw new Error('The collection card ID is invalid.')
  if (!Number.isInteger(requestedCount) || requestedCount < 0) {
    throw new Error('The collection quantity must be a non-negative integer.')
  }

  const count = Math.min(requestedCount, MAX_COLLECTION_CARD_COUNT)
  const current = normalizeCardCollection(collection)
  const previousCount = getCardCollectionCount(current, normalizedId)
  if (previousCount === count) return current
  const cards = current.cards.filter((entry) => entry.cardId !== normalizedId)
  if (count > 0) cards.push({ cardId: normalizedId, count })
  const revision = current.revision + 1
  return {
    ...current,
    revision,
    cards,
    events: [
      ...current.events,
      {
        revision,
        changedAt: validTimestamp(changedAt) ?? new Date().toISOString(),
        source: validCollectionEventSource(source),
        deltas: [{ cardId: normalizedId, delta: count - previousCount }],
      },
    ].slice(-MAX_COLLECTION_EVENTS),
  }
}

export function addCardCollectionCopies(
  collection: CardCollection,
  cardId: string,
  count = 1,
  options?: CollectionMutationOptions,
) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Additions must use a positive integer quantity.')
  }
  return setCardCollectionCount(
    collection,
    cardId,
    getCardCollectionCount(collection, cardId) + count,
    options,
  )
}

export function removeCardCollectionCopies(
  collection: CardCollection,
  cardId: string,
  count = 1,
  options?: CollectionMutationOptions,
) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Removals must use a positive integer quantity.')
  }
  const available = getCardCollectionCount(collection, cardId)
  if (available < count) {
    throw new Error(
      `Cannot remove ${count} copies of ${cardId}; only ${available} are owned.`,
    )
  }
  return setCardCollectionCount(collection, cardId, available - count, options)
}

export function applyCardCollectionChange(
  collection: CardCollection,
  change: CollectionChangeInput,
  options?: CollectionMutationOptions,
): CardCollection {
  if (change?.zone !== 'collection') {
    throw new Error('The proposed change does not target the card collection.')
  }
  const cardId = change.card?.id ?? change.cardId ?? ''
  if (change.type === 'add') {
    return addCardCollectionCopies(collection, cardId, change.count, options)
  }
  if (change.type === 'remove') {
    return removeCardCollectionCopies(collection, cardId, change.count, options)
  }
  throw new Error('Collection changes support only add and remove operations.')
}

export function applyCardCollectionChanges(
  collection: CardCollection,
  changes: CollectionChangeInput[],
): CardCollection {
  const starting = normalizeCardCollection(collection)
  const changed = changes.reduce(
    (current, change) => applyCardCollectionChange(current, change, {
      source: 'assistant',
    }),
    starting,
  )
  if (changed.revision === starting.revision) return starting

  const startingCounts = new Map(
    starting.cards.map(({ cardId, count }) => [cardId, count]),
  )
  const changedCounts = new Map(
    changed.cards.map(({ cardId, count }) => [cardId, count]),
  )
  const cardIds = new Set([...startingCounts.keys(), ...changedCounts.keys()])
  const deltas = [...cardIds]
    .map((cardId) => ({
      cardId,
      delta: (changedCounts.get(cardId) ?? 0) - (startingCounts.get(cardId) ?? 0),
    }))
    .filter(({ delta }) => delta !== 0)
  const revision = starting.revision + 1

  return {
    ...starting,
    revision,
    cards: changed.cards,
    events: [
      ...starting.events,
      {
        revision,
        changedAt: new Date().toISOString(),
        source: 'assistant' as const,
        deltas,
      },
    ].slice(-MAX_COLLECTION_EVENTS),
  }
}

export function createCollectionCheckpoint(
  collection: CardCollection,
): CollectionCheckpoint {
  const normalized = normalizeCardCollection(collection)
  return {
    historyId: normalized.historyId,
    revision: normalized.revision,
  }
}

export function getCollectionChangesSince(
  collection: CardCollection,
  checkpoint: CollectionCheckpoint | null | undefined,
) {
  const normalized = normalizeCardCollection(collection)
  const requestedRevision = checkpoint?.revision
  const checkpointRevision = Number.isInteger(requestedRevision)
    ? requestedRevision ?? normalized.revision
    : normalized.revision
  const matchesHistory = checkpoint?.historyId === normalized.historyId
  const eventsSinceCheckpoint = normalized.events.filter(
    (event) => event.revision > checkpointRevision,
  )
  const historyAvailable = matchesHistory &&
    checkpointRevision <= normalized.revision &&
    normalized.revision - checkpointRevision === eventsSinceCheckpoint.length &&
    eventsSinceCheckpoint.every(
      (event, index) => event.revision === checkpointRevision + index + 1,
    )
  const grouped = new Map<string, CollectionDelta & {
    firstAddedAt?: string
    lastAddedAt?: string
    firstRemovedAt?: string
    lastRemovedAt?: string
  }>()

  if (historyAvailable && checkpointRevision < normalized.revision) {
    eventsSinceCheckpoint
      .forEach((event) => {
        event.deltas.forEach(({ cardId, delta }) => {
          const current = grouped.get(cardId) ?? {
            cardId,
            delta: 0,
          }
          current.delta += delta
          if (delta > 0) {
            current.firstAddedAt ??= event.changedAt
            current.lastAddedAt = event.changedAt
          } else {
            current.firstRemovedAt ??= event.changedAt
            current.lastRemovedAt = event.changedAt
          }
          grouped.set(cardId, current)
        })
      })
  }

  const currentCounts = new Map(
    normalized.cards.map(({ cardId, count }) => [cardId, count]),
  )
  const additions = []
  const removals = []
  for (const change of grouped.values()) {
    if (change.delta > 0) {
      additions.push({
        cardId: change.cardId,
        count: Math.min(change.delta, currentCounts.get(change.cardId) ?? 0),
        firstAddedAt: change.firstAddedAt,
        lastAddedAt: change.lastAddedAt,
      })
    } else if (change.delta < 0) {
      removals.push({
        cardId: change.cardId,
        count: Math.abs(change.delta),
        firstRemovedAt: change.firstRemovedAt,
        lastRemovedAt: change.lastRemovedAt,
      })
    }
  }

  return {
    historyId: normalized.historyId,
    fromRevision: matchesHistory ? checkpointRevision : normalized.revision,
    throughRevision: normalized.revision,
    additions: additions.filter(({ count }) => count > 0),
    removals,
    historyAvailable,
  }
}

export function getRecentCollectionEvents(
  collection: CardCollection,
  limit = RECENT_COLLECTION_EVENT_LIMIT,
) {
  const normalized = normalizeCardCollection(collection)
  const eventLimit = Number.isInteger(limit) && limit > 0
    ? Math.min(limit, RECENT_COLLECTION_EVENT_LIMIT)
    : RECENT_COLLECTION_EVENT_LIMIT

  return normalized.events.slice(-eventLimit).map((event) => ({
    revision: event.revision,
    changedAt: event.changedAt,
    source: event.source,
    additions: event.deltas
      .filter(({ delta }) => delta > 0)
      .map(({ cardId, delta }) => ({ cardId, count: delta })),
    removals: event.deltas
      .filter(({ delta }) => delta < 0)
      .map(({ cardId, delta }) => ({ cardId, count: Math.abs(delta) })),
  }))
}

function incrementCount(
  grouped: Map<string, number>,
  card: DeckCard | undefined,
  count: number,
) {
  if (!card || count <= 0) return
  const key = getGameplayCardKey(card)
  grouped.set(key, (grouped.get(key) ?? 0) + count)
}

export interface DeckCardRequirement {
  key: string
  card: DeckCard
  count: number
}

export function getDeckCardRequirements(deck: Partial<Deck>) {
  const requirements = new Map<string, DeckCardRequirement>()
  const cards = [
    deck?.leader,
    deck?.secondLeader,
    deck?.base,
    ...(deck?.drawDeck ?? []),
    ...(deck?.sideboard ?? []),
  ]

  cards.forEach((card) => {
    if (!card) return
    const key = getGameplayCardKey(card)
    const current = requirements.get(key)
    if (current) {
      current.count += 1
    } else {
      requirements.set(key, { key, card, count: 1 })
    }
  })

  return [...requirements.values()]
}

export function getCardListOwnershipSummary(
  cards: DeckCard[] | null | undefined,
  collection: CardCollection,
  cardsById: ReadonlyCardReferenceMap,
) {
  const total = cards?.length ?? 0
  const owned = getDeckCardRequirements({ drawDeck: cards ?? [] }).reduce(
    (sum, requirement) =>
      sum + Math.min(
        requirement.count,
        getGameplayCardCollectionCount(
          collection,
          requirement.card,
          cardsById,
        ),
      ),
    0,
  )
  const fullyOwned = total > 0 && owned === total

  return {
    fullyOwned,
    label: fullyOwned ? 'Fully owned' : `${owned} out of ${total} owned`,
    owned,
    total,
  }
}

export function getMissingDeckCardRequirements(
  deck: Partial<Deck>,
  collection: CardCollection | null | undefined,
  cardsById: ReadonlyCardReferenceMap | null | undefined,
) {
  const owned = new Map<string, number>()
  for (const entry of collection?.cards ?? []) {
    incrementCount(owned, cardsById?.get(entry.cardId), entry.count)
  }

  return getDeckCardRequirements(deck)
    .map((requirement) => ({
      ...requirement,
      count: Math.max(0, requirement.count - (owned.get(requirement.key) ?? 0)),
    }))
    .filter((requirement) => requirement.count > 0)
}

export function isDeckFullyOwned(
  deck: Deck | null,
  collection: CardCollection,
  cardsById: ReadonlyCardReferenceMap,
) {
  if (
    !deck?.leader ||
    !deck?.base ||
    !Array.isArray(deck.drawDeck) ||
    deck.drawDeck.length === 0 ||
    !collection?.cards?.length
  ) {
    return false
  }

  return getMissingDeckCardRequirements(deck, collection, cardsById).length === 0
}
