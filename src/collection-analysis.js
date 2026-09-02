import {
  getCatalogCardId,
  getCatalogCards,
  getGameplayCardKey,
} from './catalog.js'

const COLLECTION_CARD_TYPES = new Set([
  'unit',
  'event',
  'upgrade',
  'leader',
  'base',
])

function setCodeFromId(cardId) {
  return String(cardId ?? '').split('_')[0].trim().toUpperCase()
}

function uniqueCardsById(cards) {
  return [...new Map(cards.map((card) => [getCatalogCardId(card), card])).values()]
}

export function analyzeCardCollection({
  cardsById,
  catalog,
  collection,
}) {
  const entries = collection?.cards ?? []
  const ownedIds = new Set(entries.map(({ cardId }) => cardId))
  const resolvedEntries = entries.map((entry) => ({
    ...entry,
    card: cardsById.get(entry.cardId) ?? null,
  }))
  const representedSetCodes = new Set(
    resolvedEntries
      .map(({ card, cardId }) => card?.setCode ?? setCodeFromId(cardId))
      .filter(Boolean),
  )
  const gameplayKeys = new Set(
    resolvedEntries.map(({ card, cardId }) =>
      card ? getGameplayCardKey(card) : `unresolved\u0000${cardId}`,
    ),
  )
  const cardsBySet = new Map()

  for (const card of catalog ? getCatalogCards(catalog) : []) {
    const setCode = String(card?.Set ?? '').trim().toUpperCase()
    if (
      !representedSetCodes.has(setCode) ||
      !card?.FrontArt ||
      !COLLECTION_CARD_TYPES.has(String(card.Type).toLocaleLowerCase())
    ) {
      continue
    }
    const setCards = cardsBySet.get(setCode) ?? []
    setCards.push(card)
    cardsBySet.set(setCode, setCards)
  }

  const setProgress = [...representedSetCodes]
    .map((setCode) => {
      const allCards = uniqueCardsById(cardsBySet.get(setCode) ?? [])
      const normalCards = allCards.filter(
        (card) => !card.VariantType || card.VariantType === 'Normal',
      )
      const checklist = normalCards.length > 0 ? normalCards : allCards
      const owned = checklist.reduce(
        (sum, card) => sum + (ownedIds.has(getCatalogCardId(card)) ? 1 : 0),
        0,
      )
      const copies = resolvedEntries
        .filter(
          ({ card, cardId }) =>
            (card?.setCode ?? setCodeFromId(cardId)) === setCode,
        )
        .reduce((sum, entry) => sum + entry.count, 0)
      const printings = resolvedEntries.filter(
        ({ card, cardId }) =>
          (card?.setCode ?? setCodeFromId(cardId)) === setCode,
      ).length

      return {
        checklistKind: normalCards.length > 0 ? 'standard' : 'set',
        copies,
        owned,
        percentage:
          checklist.length > 0
            ? Math.round((owned / checklist.length) * 100)
            : 0,
        printings,
        setCode,
        total: checklist.length,
      }
    })
    .sort((left, right) => left.setCode.localeCompare(right.setCode))

  return {
    distinctCards: gameplayKeys.size,
    distinctPrintings: entries.length,
    resolvedEntries,
    setProgress,
    setsRepresented: representedSetCodes.size,
    totalCopies: entries.reduce((sum, entry) => sum + entry.count, 0),
  }
}
