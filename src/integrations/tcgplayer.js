import {
  getDeckCardRequirements,
  getMissingDeckCardRequirements,
} from '../card-collection.js'

export const TCGPLAYER_MASS_ENTRY_URL =
  'https://www.tcgplayer.com/massentry?productline=Star%20Wars%20Unlimited'

function normalizePart(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function formatMassEntryLine({ card, count }) {
  const name = [normalizePart(card?.name), normalizePart(card?.subtitle)]
    .filter(Boolean)
    .join(' - ')
  const setCode = normalizePart(card?.setCode).toUpperCase()
  const identifier = setCode ? ` [${setCode}]` : ''

  return `${count} ${name || 'Unknown card'}${identifier}`
}

function getPurchaseDeck(deck, additionalDecks = []) {
  const decks = [deck, ...additionalDecks]

  return {
    leader: null,
    secondLeader: null,
    base: null,
    drawDeck: decks.flatMap((candidate) => candidate?.drawDeck ?? []),
    sideboard: decks.flatMap((candidate) => candidate?.sideboard ?? []),
  }
}

function compareMassEntryRequirements(left, right) {
  const leftName = [left.card?.name, left.card?.subtitle]
    .map(normalizePart)
    .filter(Boolean)
    .join(' - ')
  const rightName = [right.card?.name, right.card?.subtitle]
    .map(normalizePart)
    .filter(Boolean)
    .join(' - ')

  return leftName.localeCompare(rightName, 'en', { sensitivity: 'base' })
}

export function createTcgplayerMassEntry(
  deck,
  {
    additionalDecks = [],
    collection,
    cardsById,
    missingOnly = false,
  } = {},
) {
  const purchaseDeck = getPurchaseDeck(deck, additionalDecks)
  const requirements = missingOnly
    ? getMissingDeckCardRequirements(purchaseDeck, collection, cardsById)
    : getDeckCardRequirements(purchaseDeck)

  return [...requirements]
    .sort(compareMassEntryRequirements)
    .map(formatMassEntryLine)
    .join('\n')
}
