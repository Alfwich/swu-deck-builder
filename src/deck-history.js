export const INITIAL_DECK_HISTORY_LABEL = 'Loaded deck'
const MAX_DECK_HISTORY_VISUAL_CARDS = 3

export function createDeckHistoryVisualStack(visuals) {
  const validVisuals = (visuals ?? []).filter(
    (visual) =>
      visual?.card?.url &&
      ['addition', 'removal', 'replacement'].includes(visual.kind),
  )
  if (validVisuals.length === 0) return null

  const quantities = validVisuals.map((visual) =>
    Number.isInteger(visual.count) && visual.count > 0 ? visual.count : 1,
  )
  const count = quantities.reduce((total, quantity) => total + quantity, 0)
  const cards = validVisuals
    .slice(0, MAX_DECK_HISTORY_VISUAL_CARDS)
    .map((visual) => ({ card: visual.card, kind: visual.kind }))

  validVisuals.forEach((visual, visualIndex) => {
    for (
      let copy = 1;
      copy < quantities[visualIndex] &&
        cards.length < MAX_DECK_HISTORY_VISUAL_CARDS;
      copy += 1
    ) {
      cards.push({ card: visual.card, kind: visual.kind })
    }
  })

  const primary = cards[0]
  if (count === 1) return primary

  return {
    ...primary,
    kind: cards.every(({ kind }) => kind === primary.kind)
      ? primary.kind
      : 'mixed',
    cards,
    count,
  }
}

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
