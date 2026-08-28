function cardCount(entries) {
  return Array.isArray(entries)
    ? entries.reduce(
        (total, entry) => total + (Number.isInteger(entry?.count) ? entry.count : 0),
        0,
      )
    : 0
}

export function serializeAgentDeckPayload(deck) {
  return JSON.stringify({
    ...deck,
    cardCounts: {
      drawDeck: cardCount(deck?.drawDeck),
      sideboard: cardCount(deck?.sideboard),
    },
  })
}
