const CARD_TYPE_CATEGORIES = [
  { id: 'units', label: 'Units' },
  { id: 'events', label: 'Events' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'other', label: 'Other' },
]

function getCardTypeCategory(type) {
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

export function getCardTypeDistribution(cards) {
  const counts = Object.fromEntries(
    CARD_TYPE_CATEGORIES.map((category) => [category.id, 0]),
  )

  cards.forEach((card) => {
    counts[getCardTypeCategory(card?.type)] += 1
  })

  return CARD_TYPE_CATEGORIES.map((category) => ({
    ...category,
    count: counts[category.id],
  }))
}

export function analyzeDeck(deck) {
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
    costBuckets[bucketIndex].count += 1
    totalCost += card.cost
    cardsWithCost += 1
  })

  const allCards = [
    deck.leader,
    deck.secondLeader,
    deck.base,
    ...deck.drawDeck,
    ...(deck.sideboard ?? []),
  ].filter(Boolean)
  const pricedCards = allCards.filter((card) => card.nominalPrice !== null)

  return {
    cardTypeDistribution: getCardTypeDistribution(deck.drawDeck),
    costBuckets,
    averageCost: cardsWithCost > 0 ? totalCost / cardsWithCost : null,
    nominalValue: pricedCards.reduce(
      (total, card) => total + card.nominalPrice,
      0,
    ),
  }
}
