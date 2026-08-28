const EDITABLE_ZONES = new Set(['drawDeck', 'sideboard'])

function assertEditableZone(zone) {
  if (!EDITABLE_ZONES.has(zone)) {
    throw new Error('Cards can only be edited in the draw deck or sideboard.')
  }
}

export function addCardToDeck(deck, zone, card) {
  assertEditableZone(zone)
  return { ...deck, [zone]: [...(deck[zone] ?? []), card] }
}

export function removeCardFromDeck(deck, zone, card) {
  assertEditableZone(zone)
  const cards = deck[zone] ?? []
  const index = cards.findIndex(
    (candidate) =>
      candidate === card ||
      (candidate.id === card.id &&
        candidate.name === card.name &&
        candidate.subtitle === card.subtitle),
  )

  if (index === -1) {
    throw new Error('That card is no longer in the selected deck.')
  }

  return {
    ...deck,
    [zone]: [...cards.slice(0, index), ...cards.slice(index + 1)],
  }
}

export function addSecondLeaderToDeck(deck, card) {
  if (String(card?.type).toLocaleLowerCase() !== 'leader') {
    throw new Error('Only a leader card can be added as the second leader.')
  }
  if (deck.secondLeader) {
    throw new Error('Remove the current second leader before adding another.')
  }

  return { ...deck, secondLeader: card }
}

export function removeSecondLeaderFromDeck(deck) {
  if (!deck.secondLeader) {
    throw new Error('This deck does not have a second leader to remove.')
  }

  return { ...deck, secondLeader: null }
}

export function replaceBaseInDeck(deck, card) {
  if (String(card?.type).toLocaleLowerCase() !== 'base') {
    throw new Error('Only a base card can replace the current base.')
  }

  return { ...deck, base: card }
}
