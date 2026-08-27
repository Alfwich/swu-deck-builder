const UNPADDED_CARD_NUMBER_SETS = new Set(['TS26'])

function formatSwudbCardNumber(setCode, cardNumber) {
  if (UNPADDED_CARD_NUMBER_SETS.has(setCode)) {
    return cardNumber.replace(/^0+(?=\d)/, '')
  }

  return cardNumber.padStart(3, '0')
}

function toSwudbCardId(card) {
  const setCode = String(card?.setCode ?? '').trim().toUpperCase()
  const cardNumber = String(card?.cardNumber ?? '').trim()

  if (!setCode || !/^\d+$/.test(cardNumber)) {
    throw new Error(
      `Could not create a SWUDB ID for ${card?.name ?? 'an unknown card'}.`,
    )
  }

  return `${setCode}_${formatSwudbCardNumber(setCode, cardNumber)}`
}

function toSwudbEntry(card, count = 1) {
  return {
    id: toSwudbCardId(card),
    count,
  }
}

function groupDrawDeckById(cards) {
  const entries = new Map()

  cards.forEach((card) => {
    const id = toSwudbCardId(card)
    const existingEntry = entries.get(id)

    if (existingEntry) {
      existingEntry.count += 1
      return
    }

    entries.set(id, { id, count: 1 })
  })

  return [...entries.values()]
}

export function serializeSwudbDeck(deck, { name = 'Random deck' } = {}) {
  if (!deck?.leader || !deck?.base || !Array.isArray(deck.drawDeck)) {
    throw new Error('The current deck is incomplete and cannot be copied.')
  }

  if (deck.drawDeck.length !== 50) {
    throw new Error(
      `SWUDB export expected 50 draw-deck cards but found ${deck.drawDeck.length}.`,
    )
  }

  return {
    metadata: {
      name,
    },
    leader: toSwudbEntry(deck.leader),
    secondleader: null,
    base: toSwudbEntry(deck.base),
    deck: groupDrawDeckById(deck.drawDeck),
    sideboard: [],
  }
}

export function formatSwudbDeck(deck, options) {
  return `${JSON.stringify(serializeSwudbDeck(deck, options), null, 2)}\n`
}
