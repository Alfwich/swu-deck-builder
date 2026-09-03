import {
  getDeckCardRequirements,
  getMissingDeckCardRequirements,
} from '../player-database/card-collection.js'
import type { DeckCard, ReadonlyCardReferenceMap } from '../types/catalog.js'
import type { CardCollection } from '../types/collection.js'
import type { Deck } from '../types/deck.js'

export const TCGPLAYER_MASS_ENTRY_URL =
  'https://www.tcgplayer.com/massentry?productline=Star%20Wars%20Unlimited'

interface MassEntryRequirement {
  card: DeckCard
  count: number
}

interface TcgplayerMassEntryOptions {
  additionalDecks?: Deck[]
  collection?: CardCollection
  cardsById?: ReadonlyCardReferenceMap
  missingOnly?: boolean
}

function normalizePart(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function formatMassEntryLine({ card, count }: MassEntryRequirement) {
  const name = [normalizePart(card?.name), normalizePart(card?.subtitle)]
    .filter(Boolean)
    .join(' - ')
  const setCode = normalizePart(card?.setCode).toUpperCase()
  const identifier = setCode ? ` [${setCode}]` : ''

  return `${count} ${name || 'Unknown card'}${identifier}`
}

function getPurchaseDeck(deck: Deck, additionalDecks: Deck[] = []): Deck {
  const decks = [deck, ...additionalDecks]

  return {
    leader: null,
    secondLeader: null,
    base: null,
    drawDeck: decks.flatMap((candidate) => candidate?.drawDeck ?? []),
    sideboard: decks.flatMap((candidate) => candidate?.sideboard ?? []),
  }
}

function compareMassEntryRequirements(
  left: MassEntryRequirement,
  right: MassEntryRequirement,
) {
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
  deck: Deck,
  {
    additionalDecks = [],
    collection,
    cardsById,
    missingOnly = false,
  }: TcgplayerMassEntryOptions = {},
) {
  const purchaseDeck = getPurchaseDeck(deck, additionalDecks)
  const requirements = missingOnly
    ? getMissingDeckCardRequirements(purchaseDeck, collection, cardsById)
    : getDeckCardRequirements(purchaseDeck)

  return ([...requirements] as MassEntryRequirement[])
    .sort(compareMassEntryRequirements)
    .map(formatMassEntryLine)
    .join('\n')
}
