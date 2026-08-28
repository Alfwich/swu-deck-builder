import {
  canonicalGameplayKey,
  cardCopyLimit,
  isDrawDeckCard,
  toDeckCard,
} from './catalog.mjs'

export class DeckGenerationValidationError extends Error {
  constructor(issues, message = 'The generated deck did not pass validation.') {
    super(message)
    this.name = 'DeckGenerationValidationError'
    this.issues = issues
  }
}

export const DRAW_DECK_SIZE_RULES = Object.freeze({
  unrestricted: Object.freeze({ minimum: 0, maximum: null }),
  structural: Object.freeze({ minimum: 30, maximum: null }),
  premier: Object.freeze({ minimum: 50, maximum: null }),
  eternal: Object.freeze({ minimum: 50, maximum: null }),
  trilogy: Object.freeze({ minimum: 50, maximum: null }),
  limited: Object.freeze({ minimum: 30, maximum: null }),
  twinSuns: Object.freeze({ minimum: 80, maximum: null }),
})

function toModelEntries(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        cardId: entry?.id,
        count: entry?.count,
      }))
    : entries
}

function validateEntries(entries, zone, catalog, issues) {
  if (!Array.isArray(entries)) {
    issues.push(`${zone} must be an array.`)
    return []
  }

  const groupedEntries = new Map()

  entries.forEach((entry, index) => {
    const cardId = typeof entry?.cardId === 'string' ? entry.cardId : ''
    const count = entry?.count

    if (!cardId || !Number.isInteger(count) || count < 1) {
      issues.push(`${zone}[${index}] must contain a cardId and positive integer count.`)
      return
    }

    const card = catalog.cardsById.get(cardId)
    if (!card) {
      issues.push(`${zone}[${index}] references unknown card ${cardId}.`)
      return
    }

    if (!isDrawDeckCard(card)) {
      issues.push(`${cardId} is a ${card.Type} and cannot appear in ${zone}.`)
      return
    }

    const current = groupedEntries.get(cardId)
    if (current) {
      current.count += count
    } else {
      groupedEntries.set(cardId, { cardId, count, card })
    }
  })

  return [...groupedEntries.values()]
}

function validateCopyLimits(entries, issues) {
  const copiesByGameplayCard = new Map()

  for (const entry of entries) {
    const key = canonicalGameplayKey(entry.card)
    const existing = copiesByGameplayCard.get(key)

    if (existing) {
      existing.count += entry.count
      existing.ids.push(entry.cardId)
      existing.limit = Math.max(existing.limit, cardCopyLimit(entry.card))
    } else {
      copiesByGameplayCard.set(key, {
        card: entry.card,
        count: entry.count,
        ids: [entry.cardId],
        limit: cardCopyLimit(entry.card),
      })
    }
  }

  for (const group of copiesByGameplayCard.values()) {
    if (group.count > group.limit) {
      issues.push(
        `${group.card.Name} has ${group.count} copies; the maximum is ${group.limit}.`,
      )
    }
  }
}

function expandEntries(entries) {
  return entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => toDeckCard(entry.card)),
  )
}

export function validateAndHydrateDeck(
  payload,
  catalog,
  {
    requiredSideboardCount = null,
    drawDeckSizeRule = DRAW_DECK_SIZE_RULES.structural,
    maximumSideboardCount = 10,
    enforceCopyLimits = true,
    allowSecondLeader = false,
  } = {},
) {
  const issues = []

  if (!payload || typeof payload !== 'object') {
    throw new DeckGenerationValidationError(['The response must be an object.'])
  }

  const name =
    typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim().slice(0, 100)
      : 'Agentic deck'
  const summary =
    typeof payload.summary === 'string' ? payload.summary.trim() : ''
  const leader = catalog.cardsById.get(payload.leaderId)
  const secondLeader = payload.secondLeaderId
    ? catalog.cardsById.get(payload.secondLeaderId)
    : null
  const base = catalog.cardsById.get(payload.baseId)

  if (!leader || leader.Type !== 'Leader') {
    issues.push(`${payload.leaderId ?? 'Missing leaderId'} is not a valid leader.`)
  }

  if (!base || base.Type !== 'Base') {
    issues.push(`${payload.baseId ?? 'Missing baseId'} is not a valid base.`)
  }

  if (payload.secondLeaderId !== null && !allowSecondLeader) {
    issues.push('Premier generation requires secondLeaderId to be null.')
  } else if (
    payload.secondLeaderId !== null &&
    (!secondLeader || secondLeader.Type !== 'Leader')
  ) {
    issues.push(
      `${payload.secondLeaderId ?? 'Missing secondLeaderId'} is not a valid second leader.`,
    )
  }

  const drawDeck = validateEntries(payload.drawDeck, 'drawDeck', catalog, issues)
  const sideboard = validateEntries(payload.sideboard, 'sideboard', catalog, issues)
  const drawDeckCount = drawDeck.reduce((total, entry) => total + entry.count, 0)
  const sideboardCount = sideboard.reduce((total, entry) => total + entry.count, 0)

  if (drawDeckCount < drawDeckSizeRule.minimum) {
    issues.push(
      `The draw deck contains ${drawDeckCount} cards; at least ${drawDeckSizeRule.minimum} are required.`,
    )
  }

  if (
    drawDeckSizeRule.maximum !== null &&
    drawDeckCount > drawDeckSizeRule.maximum
  ) {
    issues.push(
      `The draw deck contains ${drawDeckCount} cards; at most ${drawDeckSizeRule.maximum} are allowed.`,
    )
  }

  if (
    requiredSideboardCount !== null &&
    sideboardCount !== requiredSideboardCount
  ) {
    issues.push(
      `The sideboard contains ${sideboardCount} cards; exactly ${requiredSideboardCount} are required.`,
    )
  } else if (
    maximumSideboardCount !== null &&
    sideboardCount > maximumSideboardCount
  ) {
    issues.push(
      `The sideboard contains ${sideboardCount} cards; at most ${maximumSideboardCount} are allowed.`,
    )
  }

  if (enforceCopyLimits) {
    validateCopyLimits([...drawDeck, ...sideboard], issues)
  }

  if (issues.length > 0) {
    throw new DeckGenerationValidationError(issues)
  }

  return {
    name,
    summary,
    deck: {
      leader: toDeckCard(leader),
      secondLeader: secondLeader ? toDeckCard(secondLeader) : null,
      base: toDeckCard(base),
      drawDeck: expandEntries(drawDeck),
      sideboard: expandEntries(sideboard),
    },
  }
}

export function validateAndHydrateSwudbDeck(
  payload,
  catalog,
  validationOptions = {
    drawDeckSizeRule: DRAW_DECK_SIZE_RULES.premier,
  },
) {
  const issues = []

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new DeckGenerationValidationError(
      ['The current deck must be an SWUDB JSON object.'],
      'The current deck did not pass validation.',
    )
  }

  if (payload.leader?.count !== 1) {
    issues.push('The current leader count must be 1.')
  }

  if (payload.base?.count !== 1) {
    issues.push('The current base count must be 1.')
  }

  if (
    payload.secondleader !== null &&
    payload.secondleader !== undefined &&
    payload.secondleader?.count !== 1
  ) {
    issues.push('The current second leader count must be 1.')
  }

  if (issues.length > 0) {
    throw new DeckGenerationValidationError(
      issues,
      'The current deck did not pass validation.',
    )
  }

  const modelDeck = {
    name:
      typeof payload.metadata?.name === 'string'
        ? payload.metadata.name
        : 'Current deck',
    leaderId: payload.leader?.id,
    secondLeaderId: payload.secondleader?.id ?? null,
    baseId: payload.base?.id,
    drawDeck: toModelEntries(payload.deck),
    sideboard: toModelEntries(payload.sideboard ?? []),
    summary: '',
  }

  try {
    return {
      ...validateAndHydrateDeck(modelDeck, catalog, validationOptions),
      modelDeck,
    }
  } catch (error) {
    if (error instanceof DeckGenerationValidationError) {
      throw new DeckGenerationValidationError(
        error.issues,
        'The current deck did not pass validation.',
      )
    }

    throw error
  }
}
