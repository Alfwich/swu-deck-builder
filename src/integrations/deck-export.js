export function getDeckExportDisabledReason(deck) {
  if (!deck?.leader || !deck?.base) {
    return 'Choose a leader and base first'
  }
  if (deck.drawDeck.length < 30) {
    return 'Add at least 30 draw-deck cards first'
  }
  return null
}
