import {
  getDeckCardRequirements,
  getMissingDeckCardRequirements,
} from '../card-collection.js'

export const TCGPLAYER_MASS_ENTRY_URL = 'https://www.tcgplayer.com/massentry'

function normalizePart(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function formatMassEntryLine({ card, count }) {
  const name = [normalizePart(card?.name), normalizePart(card?.subtitle)]
    .filter(Boolean)
    .join(' - ')
  const setCode = normalizePart(card?.setCode).toUpperCase()
  const cardNumber = normalizePart(card?.cardNumber)
  const identifier = setCode && cardNumber ? ` [${setCode}] ${cardNumber}` : ''

  return `${count} ${name || 'Unknown card'}${identifier}`
}

export function createTcgplayerMassEntry(
  deck,
  { collection, cardsById, missingOnly = false } = {},
) {
  const requirements = missingOnly
    ? getMissingDeckCardRequirements(deck, collection, cardsById)
    : getDeckCardRequirements(deck)

  return requirements.map(formatMassEntryLine).join('\n')
}
