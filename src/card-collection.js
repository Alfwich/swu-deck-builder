import { getGameplayCardKey } from './catalog.js'

export const CARD_COLLECTION_STORAGE_KEY =
  'swu-deck-builder.card-collection.v1'
export const MAX_COLLECTION_CARD_COUNT = 999

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
  return { revision: 0, cards: [] }
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

  return {
    revision:
      Number.isInteger(value?.revision) && value.revision >= 0
        ? value.revision
        : 0,
    cards: [...grouped].map(([cardId, count]) => ({ cardId, count })),
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
    JSON.stringify({ version: 1, ...normalizeCardCollection(collection) }),
  )
}

export function getCardCollectionCount(collection, cardId) {
  return collection?.cards?.find((entry) => entry.cardId === cardId)?.count ?? 0
}

export function setCardCollectionCount(collection, cardId, requestedCount) {
  const normalizedId = validCardId(cardId)
  if (!normalizedId) throw new Error('The collection card ID is invalid.')
  if (!Number.isInteger(requestedCount) || requestedCount < 0) {
    throw new Error('The collection quantity must be a non-negative integer.')
  }

  const count = Math.min(requestedCount, MAX_COLLECTION_CARD_COUNT)
  const current = normalizeCardCollection(collection)
  const cards = current.cards.filter((entry) => entry.cardId !== normalizedId)
  if (count > 0) cards.push({ cardId: normalizedId, count })
  if (getCardCollectionCount(current, normalizedId) === count) return current
  return { revision: current.revision + 1, cards }
}

export function addCardCollectionCopies(collection, cardId, count = 1) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Additions must use a positive integer quantity.')
  }
  return setCardCollectionCount(
    collection,
    cardId,
    getCardCollectionCount(collection, cardId) + count,
  )
}

export function removeCardCollectionCopies(collection, cardId, count = 1) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Removals must use a positive integer quantity.')
  }
  const available = getCardCollectionCount(collection, cardId)
  if (available < count) {
    throw new Error(
      `Cannot remove ${count} copies of ${cardId}; only ${available} are owned.`,
    )
  }
  return setCardCollectionCount(collection, cardId, available - count)
}

export function applyCardCollectionChange(collection, change) {
  if (change?.zone !== 'collection') {
    throw new Error('The proposed change does not target the card collection.')
  }
  const cardId = change.card?.id ?? change.cardId
  if (change.type === 'add') {
    return addCardCollectionCopies(collection, cardId, change.count)
  }
  if (change.type === 'remove') {
    return removeCardCollectionCopies(collection, cardId, change.count)
  }
  throw new Error('Collection changes support only add and remove operations.')
}

export function applyCardCollectionChanges(collection, changes) {
  return changes.reduce(
    (current, change) => applyCardCollectionChange(current, change),
    collection,
  )
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
