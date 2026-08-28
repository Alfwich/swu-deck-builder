function cardCount(entries) {
  return Array.isArray(entries)
    ? entries.reduce(
        (total, entry) => total + (Number.isInteger(entry?.count) ? entry.count : 0),
        0,
      )
    : 0
}

function deckPayload(deck) {
  return {
    ...deck,
    cardCounts: {
      drawDeck: cardCount(deck?.drawDeck),
      sideboard: cardCount(deck?.sideboard),
    },
  }
}

export function serializeAgentDeckPayload(deck) {
  return JSON.stringify(deckPayload(deck))
}

export function serializeAgentChatTurn(
  prompt,
  currentDeck,
  deckLibrary = [],
  collection = { revision: 0, cards: [] },
) {
  const sections = [`User message: ${prompt}`]

  if (deckLibrary.length > 0) {
    sections.push(
      `Deck library snapshots loaded at the start of this session (useful for comparison and discussion, but potentially stale after this turn):\n${JSON.stringify(
        deckLibrary.map((entry) => ({
          deckId: entry.deckId,
          deck: deckPayload(entry.deck),
        })),
      )}`,
    )
  }

  sections.push(
    `Currently visible deck (authoritative for this turn):\n${serializeAgentDeckPayload(currentDeck)}`,
  )
  sections.push(
    `Player card collection (authoritative for this turn; quantities represent cards currently owned):\n${JSON.stringify(collection)}`,
  )
  return sections.join('\n\n')
}
