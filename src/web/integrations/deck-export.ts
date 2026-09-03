import type { Deck } from '../types/deck.js'

export function getDeckExportDisabledReason(deck: Deck | null) {
  if (!deck?.leader || !deck?.base) {
    return 'Choose a leader and base first'
  }
  if (deck.drawDeck.length < 30) {
    return 'Add at least 30 draw-deck cards first'
  }
  return null
}
