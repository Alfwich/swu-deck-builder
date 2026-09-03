import type { DeckCard } from '../types/catalog.js'
import type { Deck } from '../types/deck.js'

type CardTypeCategory = 'units' | 'events' | 'equipment' | 'other'

const CARD_TYPE_CATEGORIES: Array<{ id: CardTypeCategory; label: string }> = [
  { id: 'units', label: 'Units' },
  { id: 'events', label: 'Events' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'other', label: 'Other' },
]

function getCardTypeCategory(type: unknown): CardTypeCategory {
  switch (String(type ?? '').toLocaleLowerCase()) {
    case 'unit':
      return 'units'
    case 'event':
      return 'events'
    case 'equipment':
    case 'upgrade':
      return 'equipment'
    default:
      return 'other'
  }
}

export function getCardTypeDistribution(cards: DeckCard[]) {
  const counts: Record<CardTypeCategory, number> = {
    units: 0,
    events: 0,
    equipment: 0,
    other: 0,
  }

  cards.forEach((card) => {
    counts[getCardTypeCategory(card?.type)] += 1
  })

  return CARD_TYPE_CATEGORIES.map((category) => ({
    ...category,
    count: counts[category.id],
  }))
}

export function getSetDistribution(cards: DeckCard[]) {
  const counts = new Map<string, number>()

  cards.forEach((card) => {
    const setCode = String(card?.setCode ?? '').trim().toUpperCase() || 'Unknown'
    counts.set(setCode, (counts.get(setCode) ?? 0) + 1)
  })

  return [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([setCode, count]) => ({
      id: setCode.toLocaleLowerCase(),
      label: setCode,
      count,
    }))
}

export function analyzeDeck(deck: Deck) {
  const costBuckets = Array.from({ length: 10 }, (_, cost) => ({
    label: cost === 9 ? '9+' : String(cost),
    count: 0,
  }))
  let totalCost = 0
  let cardsWithCost = 0

  deck.drawDeck.forEach((card) => {
    if (card.cost === null) {
      return
    }

    const bucketIndex = Math.min(Math.max(Math.floor(card.cost), 0), 9)
    const bucket = costBuckets[bucketIndex]
    if (bucket) bucket.count += 1
    totalCost += card.cost
    cardsWithCost += 1
  })

  const allCards = [
    deck.leader,
    deck.secondLeader,
    deck.base,
    ...deck.drawDeck,
    ...(deck.sideboard ?? []),
  ].filter((card): card is DeckCard => card !== null)
  const pricedCards = allCards.filter((card) => card.nominalPrice !== null)

  return {
    cardTypeDistribution: getCardTypeDistribution(deck.drawDeck),
    setDistribution: getSetDistribution(deck.drawDeck),
    costBuckets,
    averageCost: cardsWithCost > 0 ? totalCost / cardsWithCost : null,
    nominalValue: pricedCards.reduce(
      (total, card) => total + (card.nominalPrice ?? 0),
      0,
    ),
  }
}
