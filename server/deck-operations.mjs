import { DeckGenerationValidationError } from './deck-validation.mjs'
import { resolveCatalogCardId } from './catalog.mjs'

const EDITABLE_ZONES = new Set(['secondLeader', 'drawDeck', 'sideboard'])

function cardSummary(cardId, catalog) {
  const card = catalog.cardsById.get(cardId)

  return {
    id: cardId,
    name: card?.Name ?? cardId,
    subtitle: card?.Subtitle ?? null,
  }
}

function groupEntries(entries) {
  const grouped = new Map()

  for (const entry of entries ?? []) {
    grouped.set(entry.cardId, (grouped.get(entry.cardId) ?? 0) + entry.count)
  }

  return grouped
}

function ungroupEntries(grouped) {
  return [...grouped].flatMap(([cardId, count]) =>
    count > 0 ? [{ cardId, count }] : [],
  )
}

function requireCard(cardId, catalog, label, issues) {
  if (!catalog.cardsById.has(cardId)) {
    issues.push(`${label} references unknown card ${cardId}.`)
    return false
  }

  return true
}

function requireLeader(cardId, catalog, label, issues) {
  const card = catalog.cardsById.get(cardId)

  if (!card) {
    issues.push(`${label} references unknown card ${cardId}.`)
    return false
  }
  if (card.Type !== 'Leader') {
    issues.push(`${label} requires a Leader in secondLeader, but ${cardId} is a ${card.Type}.`)
    return false
  }

  return true
}

function removeCopies(grouped, cardId, count, label, issues) {
  const available = grouped.get(cardId) ?? 0
  if (available < count) {
    issues.push(
      `${label} removes ${count} copies of ${cardId}, but only ${available} are present.`,
    )
    return false
  }

  const remaining = available - count
  if (remaining === 0) {
    grouped.delete(cardId)
  } else {
    grouped.set(cardId, remaining)
  }
  return true
}

function reserveCards(touchedCards, zone, cardIds, label, issues) {
  const keys = [...new Set(cardIds)].map((cardId) => `${zone}:${cardId}`)
  const overlappingKey = keys.find((key) => touchedCards.has(key))

  if (overlappingKey) {
    issues.push(
      `${label} overlaps another change for ${overlappingKey.slice(zone.length + 1)} in ${zone}; combine those edits into one independent row.`,
    )
    return false
  }

  keys.forEach((key) => touchedCards.add(key))
  return true
}

function addSecondLeader(operation, context) {
  const { catalog, changes, issues, label, id, zone, count } = context

  if (!requireLeader(operation.cardId, catalog, label, issues)) {
    return
  }
  if (context.secondLeaderId) {
    issues.push(
      `${label} cannot add ${operation.cardId}; the deck already has two leaders. Use replace for the secondLeader slot.`,
    )
    return
  }

  context.secondLeaderId = operation.cardId
  changes.push({
    id,
    type: 'add',
    zone,
    count,
    card: cardSummary(operation.cardId, catalog),
  })
}

function removeSecondLeader(operation, context) {
  const { catalog, changes, issues, label, id, zone, count } = context

  if (!requireLeader(operation.cardId, catalog, label, issues)) {
    return
  }
  if (context.secondLeaderId !== operation.cardId) {
    issues.push(
      `${label} cannot remove ${operation.cardId}; that card is not the current second leader.`,
    )
    return
  }

  context.secondLeaderId = null
  changes.push({
    id,
    type: 'remove',
    zone,
    count,
    card: cardSummary(operation.cardId, catalog),
  })
}

function replaceSecondLeader(operation, context) {
  const { catalog, changes, issues, label, id, zone, count } = context
  const hasRemovedLeader = requireLeader(
    operation.removeCardId,
    catalog,
    label,
    issues,
  )
  const hasAddedLeader = requireLeader(operation.addCardId, catalog, label, issues)

  if (!hasRemovedLeader || !hasAddedLeader) {
    return
  }
  if (operation.removeCardId === operation.addCardId) {
    issues.push(`${label} must replace the second leader with a different card ID.`)
    return
  }
  if (context.secondLeaderId !== operation.removeCardId) {
    issues.push(
      `${label} cannot replace ${operation.removeCardId}; that card is not the current second leader.`,
    )
    return
  }

  context.secondLeaderId = operation.addCardId
  changes.push({
    id,
    type: 'replace',
    zone,
    count,
    from: cardSummary(operation.removeCardId, catalog),
    to: cardSummary(operation.addCardId, catalog),
  })
}

const SECOND_LEADER_HANDLERS = {
  add: addSecondLeader,
  remove: removeSecondLeader,
  replace: replaceSecondLeader,
}

function applySecondLeaderOperation(operation, context) {
  const { issues, label, count } = context

  if (count !== 1) {
    issues.push(`${label} must use count 1 for secondLeader.`)
    return
  }
  if (context.secondLeaderTouched) {
    issues.push(
      `${label} overlaps another secondLeader change; return one independent row for that slot.`,
    )
    return
  }
  context.secondLeaderTouched = true

  const handler = SECOND_LEADER_HANDLERS[operation.type]
  if (!handler) {
    issues.push(`${label} has unsupported type ${operation?.type ?? '(missing)'}.`)
    return
  }
  handler(operation, context)
}

function addCard(operation, context) {
  const { catalog, changes, issues, label, id, zone, count, grouped, touchedCards } =
    context
  if (
    !requireCard(operation.cardId, catalog, label, issues) ||
    !reserveCards(touchedCards, zone, [operation.cardId], label, issues)
  ) {
    return
  }

  grouped.set(operation.cardId, (grouped.get(operation.cardId) ?? 0) + count)
  changes.push({
    id,
    type: 'add',
    zone,
    count,
    card: cardSummary(operation.cardId, catalog),
  })
}

function removeCard(operation, context) {
  const { catalog, changes, issues, label, id, zone, count, grouped, touchedCards } =
    context
  if (
    !requireCard(operation.cardId, catalog, label, issues) ||
    !reserveCards(touchedCards, zone, [operation.cardId], label, issues)
  ) {
    return
  }
  if (!removeCopies(grouped, operation.cardId, count, label, issues)) {
    return
  }

  changes.push({
    id,
    type: 'remove',
    zone,
    count,
    card: cardSummary(operation.cardId, catalog),
  })
}

function replaceCard(operation, context) {
  const { catalog, changes, issues, label, id, zone, count, grouped, touchedCards } =
    context
  if (operation.removeCardId === operation.addCardId) {
    issues.push(`${label} must replace a card with a different card ID.`)
    return
  }

  const hasRemovedCard = requireCard(operation.removeCardId, catalog, label, issues)
  const hasAddedCard = requireCard(operation.addCardId, catalog, label, issues)
  if (!hasRemovedCard || !hasAddedCard) {
    return
  }
  if (
    !reserveCards(
    touchedCards,
    zone,
    [operation.removeCardId, operation.addCardId],
    label,
    issues,
    ) ||
    !removeCopies(grouped, operation.removeCardId, count, label, issues)
  ) {
    return
  }

  grouped.set(
    operation.addCardId,
    (grouped.get(operation.addCardId) ?? 0) + count,
  )
  changes.push({
    id,
    type: 'replace',
    zone,
    count,
    from: cardSummary(operation.removeCardId, catalog),
    to: cardSummary(operation.addCardId, catalog),
  })
}

const CARD_OPERATION_HANDLERS = {
  add: addCard,
  remove: removeCard,
  replace: replaceCard,
}

function applyCardOperation(operation, context) {
  const handler = CARD_OPERATION_HANDLERS[operation.type]
  if (!handler) {
    context.issues.push(
      `${context.label} has unsupported type ${operation?.type ?? '(missing)'}.`,
    )
    return
  }
  handler(operation, context)
}

function applyOperation(operation, index, context) {
  const zone = operation?.zone
  const count = operation?.count
  const operationContext = {
    ...context,
    label: `changes[${index}]`,
    id: `change-${index + 1}`,
    zone,
    count,
  }

  if (!EDITABLE_ZONES.has(zone)) {
    context.issues.push(
      `${operationContext.label} must target secondLeader, drawDeck, or sideboard.`,
    )
    return
  }
  if (!Number.isInteger(count) || count < 1) {
    context.issues.push(`${operationContext.label} must use a positive integer count.`)
    return
  }
  if (zone === 'secondLeader') {
    applySecondLeaderOperation(operation, operationContext)
    context.secondLeaderId = operationContext.secondLeaderId
    context.secondLeaderTouched = operationContext.secondLeaderTouched
    return
  }

  applyCardOperation(operation, {
    ...operationContext,
    grouped: context.zones[zone],
  })
}

export function applyDeckOperations(currentDeck, operations, catalog) {
  if (!Array.isArray(operations)) {
    throw new DeckGenerationValidationError([
      'A modify response must contain a changes array.',
    ])
  }

  const normalizedOperations = operations.map((operation) => ({
    ...operation,
    ...(typeof operation?.cardId === 'string'
      ? { cardId: resolveCatalogCardId(catalog, operation.cardId) }
      : {}),
    ...(typeof operation?.removeCardId === 'string'
      ? {
          removeCardId: resolveCatalogCardId(
            catalog,
            operation.removeCardId,
          ),
        }
      : {}),
    ...(typeof operation?.addCardId === 'string'
      ? {
          addCardId: resolveCatalogCardId(catalog, operation.addCardId),
        }
      : {}),
  }))
  const issues = []
  const zones = {
    drawDeck: groupEntries(currentDeck.drawDeck),
    sideboard: groupEntries(currentDeck.sideboard),
  }
  const changes = []
  const touchedCards = new Set()
  let secondLeaderId = currentDeck.secondLeaderId ?? null
  const secondLeaderTouched = false

  const context = {
    catalog,
    issues,
    changes,
    zones,
    touchedCards,
    secondLeaderId,
    secondLeaderTouched,
  }
  normalizedOperations.forEach((operation, index) => {
    applyOperation(operation, index, context)
  })
  secondLeaderId = context.secondLeaderId

  if (issues.length > 0) {
    throw new DeckGenerationValidationError(
      issues,
      'The proposed deck changes did not pass validation.',
    )
  }

  return {
    deck: {
      ...currentDeck,
      secondLeaderId,
      drawDeck: ungroupEntries(zones.drawDeck),
      sideboard: ungroupEntries(zones.sideboard),
    },
    changes,
  }
}
