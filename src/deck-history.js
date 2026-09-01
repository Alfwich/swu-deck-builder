export const INITIAL_DECK_HISTORY_LABEL = 'Loaded deck'

function createHistory(deck, label = INITIAL_DECK_HISTORY_LABEL) {
  return {
    entries: [{ deck, label }],
    position: 0,
  }
}

export function initializeDeckHistories(
  records,
  label = INITIAL_DECK_HISTORY_LABEL,
) {
  return Object.fromEntries(
    records.map((record) => [record.id, createHistory(record.deck, label)]),
  )
}

export function addDeckHistory(
  histories,
  record,
  label = INITIAL_DECK_HISTORY_LABEL,
) {
  return {
    ...histories,
    [record.id]: createHistory(record.deck, label),
  }
}

export function removeDeckHistory(histories, deckId) {
  if (!Object.hasOwn(histories, deckId)) {
    return histories
  }

  return Object.fromEntries(
    Object.entries(histories).filter(([candidateId]) => candidateId !== deckId),
  )
}

export function decksHaveSameState(left, right) {
  return left === right || JSON.stringify(left) === JSON.stringify(right)
}

export function appendDeckHistory(
  histories,
  { deckId, label, nextDeck, previousDeck, visual = null },
) {
  if (decksHaveSameState(previousDeck, nextDeck)) {
    return histories
  }

  const current = histories[deckId] ?? createHistory(previousDeck)
  const entries = [
    ...current.entries.slice(0, current.position + 1),
    { deck: nextDeck, label, visual },
  ]

  return {
    ...histories,
    [deckId]: {
      entries,
      position: entries.length - 1,
    },
  }
}

export function moveDeckHistory(histories, deckId, requestedPosition) {
  const current = histories[deckId]
  if (!current || current.entries.length === 0) {
    return histories
  }

  const position = Math.max(
    0,
    Math.min(Math.trunc(requestedPosition), current.entries.length - 1),
  )
  if (position === current.position) {
    return histories
  }

  return {
    ...histories,
    [deckId]: { ...current, position },
  }
}

export function deckHistoryEntryAt(history, position = history?.position) {
  return history?.entries[position] ?? null
}

export function deckHistoryShortcutDirection({
  altKey = false,
  ctrlKey = false,
  key = '',
  metaKey = false,
  shiftKey = false,
}) {
  if (altKey || (!ctrlKey && !metaKey)) {
    return 0
  }

  const normalizedKey = key.toLowerCase()
  if (normalizedKey === 'z') {
    return shiftKey ? 1 : -1
  }

  return normalizedKey === 'y' && !shiftKey ? 1 : 0
}
