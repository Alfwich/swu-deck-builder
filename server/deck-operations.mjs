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
  let secondLeaderTouched = false

  function reserveCards(zone, cardIds, label) {
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

  normalizedOperations.forEach((operation, index) => {
    const label = `changes[${index}]`
    const zone = operation?.zone
    const count = operation?.count

    if (!EDITABLE_ZONES.has(zone)) {
      issues.push(`${label} must target secondLeader, drawDeck, or sideboard.`)
      return
    }
    if (!Number.isInteger(count) || count < 1) {
      issues.push(`${label} must use a positive integer count.`)
      return
    }

    const id = `change-${index + 1}`

    if (zone === 'secondLeader') {
      if (count !== 1) {
        issues.push(`${label} must use count 1 for secondLeader.`)
        return
      }
      if (secondLeaderTouched) {
        issues.push(
          `${label} overlaps another secondLeader change; return one independent row for that slot.`,
        )
        return
      }
      secondLeaderTouched = true

      if (operation.type === 'add') {
        if (!requireLeader(operation.cardId, catalog, label, issues)) {
          return
        }
        if (secondLeaderId) {
          issues.push(
            `${label} cannot add ${operation.cardId}; the deck already has two leaders. Use replace for the secondLeader slot.`,
          )
          return
        }
        secondLeaderId = operation.cardId
        changes.push({
          id,
          type: 'add',
          zone,
          count,
          card: cardSummary(operation.cardId, catalog),
        })
        return
      }

      if (operation.type === 'remove') {
        if (!requireLeader(operation.cardId, catalog, label, issues)) {
          return
        }
        if (secondLeaderId !== operation.cardId) {
          issues.push(
            `${label} cannot remove ${operation.cardId}; that card is not the current second leader.`,
          )
          return
        }
        secondLeaderId = null
        changes.push({
          id,
          type: 'remove',
          zone,
          count,
          card: cardSummary(operation.cardId, catalog),
        })
        return
      }

      if (operation.type === 'replace') {
        const hasRemovedLeader = requireLeader(
          operation.removeCardId,
          catalog,
          label,
          issues,
        )
        const hasAddedLeader = requireLeader(
          operation.addCardId,
          catalog,
          label,
          issues,
        )
        if (!hasRemovedLeader || !hasAddedLeader) {
          return
        }
        if (operation.removeCardId === operation.addCardId) {
          issues.push(`${label} must replace the second leader with a different card ID.`)
          return
        }
        if (secondLeaderId !== operation.removeCardId) {
          issues.push(
            `${label} cannot replace ${operation.removeCardId}; that card is not the current second leader.`,
          )
          return
        }
        secondLeaderId = operation.addCardId
        changes.push({
          id,
          type: 'replace',
          zone,
          count,
          from: cardSummary(operation.removeCardId, catalog),
          to: cardSummary(operation.addCardId, catalog),
        })
        return
      }

      issues.push(`${label} has unsupported type ${operation?.type ?? '(missing)'}.`)
      return
    }

    const grouped = zones[zone]

    if (operation.type === 'add') {
      if (
        !requireCard(operation.cardId, catalog, label, issues) ||
        !reserveCards(zone, [operation.cardId], label)
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
      return
    }

    if (operation.type === 'remove') {
      if (
        !requireCard(operation.cardId, catalog, label, issues) ||
        !reserveCards(zone, [operation.cardId], label)
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
      return
    }

    if (operation.type === 'replace') {
      if (operation.removeCardId === operation.addCardId) {
        issues.push(`${label} must replace a card with a different card ID.`)
        return
      }
      const hasRemovedCard = requireCard(
        operation.removeCardId,
        catalog,
        label,
        issues,
      )
      const hasAddedCard = requireCard(
        operation.addCardId,
        catalog,
        label,
        issues,
      )
      if (
        !hasRemovedCard ||
        !hasAddedCard ||
        !reserveCards(
          zone,
          [operation.removeCardId, operation.addCardId],
          label,
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
      return
    }

    issues.push(`${label} has unsupported type ${operation?.type ?? '(missing)'}.`)
  })

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
