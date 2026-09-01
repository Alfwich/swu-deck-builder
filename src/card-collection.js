import { getGameplayCardKey } from './catalog.js'

export const CARD_COLLECTION_STORAGE_KEY =
  'swu-deck-builder.card-collection.v1'
export const MAX_COLLECTION_CARD_COUNT = 999
export const MAX_COLLECTION_EVENTS = 10000

const VALID_COLLECTION_EVENT_SOURCES = new Set([
  'assistant',
  'manual',
])

function createCollectionHistoryId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `collection-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function validHistoryId(value) {
  return typeof value === 'string' && value.trim() && value.length <= 160
    ? value.trim()
    : null
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function normalizeCollectionEvents(value, revision) {
  const events = []
  const revisions = new Set()
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
      .map((delta) => ({
        cardId: validCardId(delta?.cardId),
        delta: Number.isInteger(delta?.delta) && delta.delta !== 0
          ? Math.max(
              -MAX_COLLECTION_CARD_COUNT,
              Math.min(delta.delta, MAX_COLLECTION_CARD_COUNT),
            )
          : null,
      }))
      .filter((delta) => delta.cardId && delta.delta)
    if (deltas.length === 0) continue
    events.push({
      revision: candidate.revision,
      changedAt,
      deltas,
      source: VALID_COLLECTION_EVENT_SOURCES.has(candidate.source)
        ? candidate.source
        : 'manual',
    })
  }

  return events
    .sort((left, right) => left.revision - right.revision)
    .slice(-MAX_COLLECTION_EVENTS)
}

function validCardId(value) {
  const cardId = typeof value === 'string' ? value.trim() : ''
  return cardId && cardId.length <= 100 ? cardId : null
}

function validCount(value) {
  return Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_COLLECTION_CARD_COUNT)
    : null
}

export function createEmptyCardCollection() {
  return {
    historyId: createCollectionHistoryId(),
    revision: 0,
    cards: [],
    events: [],
  }
}

export function normalizeCardCollection(value) {
  const grouped = new Map()
  for (const candidate of value?.cards ?? []) {
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

  const revision =
    Number.isInteger(value?.revision) && value.revision >= 0
      ? value.revision
      : 0
  return {
    historyId: validHistoryId(value?.historyId) ?? createCollectionHistoryId(),
    revision,
    cards: [...grouped].map(([cardId, count]) => ({ cardId, count })),
    events: normalizeCollectionEvents(value?.events, revision),
  }
}

export function loadCardCollection(storage) {
  try {
    const raw = storage?.getItem(CARD_COLLECTION_STORAGE_KEY)
    return raw
      ? normalizeCardCollection(JSON.parse(raw))
      : createEmptyCardCollection()
  } catch {
    return createEmptyCardCollection()
  }
}

export function saveCardCollection(storage, collection) {
  storage?.setItem(
    CARD_COLLECTION_STORAGE_KEY,
    JSON.stringify({ version: 2, ...normalizeCardCollection(collection) }),
  )
}

export function getCardCollectionCount(collection, cardId) {
  return collection?.cards?.find((entry) => entry.cardId === cardId)?.count ?? 0
}

export function getGameplayCardCollectionCount(collection, card, cardsById) {
  if (!card) return 0
  const gameplayKey = getGameplayCardKey(card)
  return (collection?.cards ?? []).reduce((total, entry) => {
    const ownedCard = cardsById?.get(entry.cardId)
    return ownedCard && getGameplayCardKey(ownedCard) === gameplayKey
      ? total + entry.count
      : total
  }, 0)
}

export function getCardOwnershipStatus(ownedCount, requiredCount) {
  const required = Math.max(1, requiredCount)
  const owned = Math.min(Math.max(0, ownedCount), required)
  if (owned === 0) return { kind: 'none', label: 'None owned' }
  if (owned === required) return { kind: 'all', label: 'All owned' }
  return { kind: 'partial', label: `${owned} of ${required} owned` }
}

export function setCardCollectionCount(
  collection,
  cardId,
  requestedCount,
  { source = 'manual', changedAt = new Date().toISOString() } = {},
) {
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
        source: VALID_COLLECTION_EVENT_SOURCES.has(source) ? source : 'manual',
        deltas: [{ cardId: normalizedId, delta: count - previousCount }],
      },
    ].slice(-MAX_COLLECTION_EVENTS),
  }
}

export function addCardCollectionCopies(
  collection,
  cardId,
  count = 1,
  options,
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
  collection,
  cardId,
  count = 1,
  options,
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

export function applyCardCollectionChange(collection, change, options) {
  if (change?.zone !== 'collection') {
    throw new Error('The proposed change does not target the card collection.')
  }
  const cardId = change.card?.id ?? change.cardId
  if (change.type === 'add') {
    return addCardCollectionCopies(collection, cardId, change.count, options)
  }
  if (change.type === 'remove') {
    return removeCardCollectionCopies(collection, cardId, change.count, options)
  }
  throw new Error('Collection changes support only add and remove operations.')
}

export function applyCardCollectionChanges(collection, changes) {
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
        source: 'assistant',
        deltas,
      },
    ].slice(-MAX_COLLECTION_EVENTS),
  }
}

export function createCollectionCheckpoint(collection) {
  const normalized = normalizeCardCollection(collection)
  return {
    historyId: normalized.historyId,
    revision: normalized.revision,
  }
}

export function getCollectionChangesSince(collection, checkpoint) {
  const normalized = normalizeCardCollection(collection)
  const checkpointRevision = Number.isInteger(checkpoint?.revision)
    ? checkpoint.revision
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
  const grouped = new Map()

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

function incrementCount(grouped, card, count) {
  if (!card || count <= 0) return
  const key = getGameplayCardKey(card)
  grouped.set(key, (grouped.get(key) ?? 0) + count)
}

export function getDeckCardRequirements(deck) {
  const requirements = new Map()
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

export function getCardListOwnershipSummary(cards, collection, cardsById) {
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

export function getMissingDeckCardRequirements(deck, collection, cardsById) {
  const owned = new Map()
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

export function isDeckFullyOwned(deck, collection, cardsById) {
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
