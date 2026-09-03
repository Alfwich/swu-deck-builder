import {
  canonicalGameplayKey,
  cardCopyLimit,
  catalogCardId,
  isDrawDeckCard,
  resolveCatalogCardId,
  toDeckCard,
} from './catalog.js'

export class DeckGenerationValidationError extends Error {
  issues: string[]

  constructor(
    issues: string[],
    message = 'The generated deck did not pass validation.',
  ) {
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

interface DeckValidationOptions {
  requiredSideboardCount?: number | null
  drawDeckSizeRule?: Readonly<{ minimum: number; maximum: number | null }>
  maximumSideboardCount?: number | null
  enforceCopyLimits?: boolean
  allowSecondLeader?: boolean
  allowMissingIdentities?: boolean
}

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

    const resolvedCardId = resolveCatalogCardId(catalog, cardId)
    const card = catalog.cardsById.get(resolvedCardId)
    if (!card) {
      issues.push(`${zone}[${index}] references unknown card ${cardId}.`)
      return
    }

    if (!isDrawDeckCard(card)) {
      issues.push(`${cardId} is a ${card.Type} and cannot appear in ${zone}.`)
      return
    }

    const current = groupedEntries.get(resolvedCardId)
    if (current) {
      current.count += count
    } else {
      groupedEntries.set(resolvedCardId, {
        cardId: resolvedCardId,
        count,
        card,
      })
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

function normalizeModelEntries(entries, catalog) {
  const grouped = new Map()

  for (const entry of entries) {
    const cardId = resolveCatalogCardId(catalog, entry.cardId)
    grouped.set(cardId, (grouped.get(cardId) ?? 0) + entry.count)
  }

  return [...grouped].map(([cardId, count]) => ({ cardId, count }))
}

function normalizedDeckName(name) {
  return typeof name === 'string' && name.trim()
    ? name.trim().slice(0, 100)
    : 'Agentic deck'
}

function validatePrimaryIdentity(
  cardId,
  expectedType,
  label,
  catalog,
  allowMissingIdentities,
  issues,
) {
  const card = cardId
    ? catalog.cardsById.get(resolveCatalogCardId(catalog, cardId))
    : null
  if (
    (!cardId && !allowMissingIdentities) ||
    (cardId && (!card || card.Type !== expectedType))
  ) {
    issues.push(`${cardId ?? `Missing ${label}Id`} is not a valid ${label}.`)
  }

  return card
}

function validateSecondLeader(payload, catalog, allowSecondLeader, issues) {
  const secondLeader = payload.secondLeaderId
    ? catalog.cardsById.get(
        resolveCatalogCardId(catalog, payload.secondLeaderId),
      )
    : null

  if (payload.secondLeaderId && !payload.leaderId) {
    issues.push('A second leader requires a primary leader.')
  }
  if (payload.secondLeaderId && !allowSecondLeader) {
    issues.push('Premier generation requires secondLeaderId to be null.')
  } else if (
    payload.secondLeaderId &&
    (!secondLeader || secondLeader.Type !== 'Leader')
  ) {
    issues.push(
      `${payload.secondLeaderId ?? 'Missing secondLeaderId'} is not a valid second leader.`,
    )
  }

  return secondLeader
}

function validateDeckIdentities(
  payload,
  catalog,
  allowSecondLeader,
  allowMissingIdentities,
  issues,
) {
  const leader = validatePrimaryIdentity(
    payload.leaderId,
    'Leader',
    'leader',
    catalog,
    allowMissingIdentities,
    issues,
  )
  const base = validatePrimaryIdentity(
    payload.baseId,
    'Base',
    'base',
    catalog,
    allowMissingIdentities,
    issues,
  )
  const secondLeader = validateSecondLeader(
    payload,
    catalog,
    allowSecondLeader,
    issues,
  )

  return { leader, secondLeader, base }
}

function validateSingletonCount(entry, label, required, issues) {
  if (!entry) {
    if (required) {
      issues.push(`The current ${label} count must be 1.`)
    }
    return
  }

  if (entry.count !== 1) {
    issues.push(`The current ${label} count must be 1.`)
  }
}

function validateSwudbIdentityCounts(
  payload,
  allowMissingIdentities,
  issues,
) {
  validateSingletonCount(
    payload.leader,
    'leader',
    !allowMissingIdentities,
    issues,
  )
  validateSingletonCount(
    payload.base,
    'base',
    !allowMissingIdentities,
    issues,
  )
  validateSingletonCount(payload.secondleader, 'second leader', false, issues)
}

function validateDeckCounts(
  drawDeckCount,
  sideboardCount,
  { drawDeckSizeRule, requiredSideboardCount, maximumSideboardCount },
  issues,
) {
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
    allowMissingIdentities = false,
  }: DeckValidationOptions = {},
) {
  const issues = []

  if (!payload || typeof payload !== 'object') {
    throw new DeckGenerationValidationError(['The response must be an object.'])
  }

  const name = normalizedDeckName(payload.name)
  const summary =
    typeof payload.summary === 'string' ? payload.summary.trim() : ''
  const { leader, secondLeader, base } = validateDeckIdentities(
    payload,
    catalog,
    allowSecondLeader,
    allowMissingIdentities,
    issues,
  )

  const drawDeck = validateEntries(payload.drawDeck, 'drawDeck', catalog, issues)
  const sideboard = validateEntries(payload.sideboard, 'sideboard', catalog, issues)
  const drawDeckCount = drawDeck.reduce((total, entry) => total + entry.count, 0)
  const sideboardCount = sideboard.reduce((total, entry) => total + entry.count, 0)

  validateDeckCounts(
    drawDeckCount,
    sideboardCount,
    { drawDeckSizeRule, requiredSideboardCount, maximumSideboardCount },
    issues,
  )

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
      leader: leader ? toDeckCard(leader) : null,
      secondLeader: secondLeader ? toDeckCard(secondLeader) : null,
      base: base ? toDeckCard(base) : null,
      drawDeck: expandEntries(drawDeck),
      sideboard: expandEntries(sideboard),
    },
  }
}

export function validateAndHydrateSwudbDeck(
  payload,
  catalog,
  validationOptions: DeckValidationOptions = {
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

  const allowMissingIdentities = Boolean(
    validationOptions.allowMissingIdentities,
  )

  validateSwudbIdentityCounts(payload, allowMissingIdentities, issues)

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
    leaderId: payload.leader?.id ?? null,
    secondLeaderId: payload.secondleader?.id ?? null,
    baseId: payload.base?.id ?? null,
    drawDeck: toModelEntries(payload.deck),
    sideboard: toModelEntries(payload.sideboard ?? []),
    summary: '',
  }

  try {
    const validated = validateAndHydrateDeck(
      modelDeck,
      catalog,
      validationOptions,
    )

    return {
      ...validated,
      modelDeck: {
        ...modelDeck,
        name: validated.name,
        leaderId: modelDeck.leaderId
          ? catalogCardId(
              catalog.cardsById.get(
                resolveCatalogCardId(catalog, modelDeck.leaderId),
              ),
            )
          : null,
        secondLeaderId: modelDeck.secondLeaderId
          ? catalogCardId(
              catalog.cardsById.get(
                resolveCatalogCardId(catalog, modelDeck.secondLeaderId),
              ),
            )
          : null,
        baseId: modelDeck.baseId
          ? catalogCardId(
              catalog.cardsById.get(
                resolveCatalogCardId(catalog, modelDeck.baseId),
              ),
            )
          : null,
        drawDeck: normalizeModelEntries(modelDeck.drawDeck, catalog),
        sideboard: normalizeModelEntries(modelDeck.sideboard, catalog),
      },
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

export function validateAndHydrateSwudbDeckLibrary(
  entries,
  catalog,
  validationOptions,
) {
  if (!Array.isArray(entries)) {
    throw new DeckGenerationValidationError([
      'The deck library must be an array.',
    ])
  }

  return entries.map((entry, index) => {
    const deckId = typeof entry?.deckId === 'string'
      ? entry.deckId.trim().slice(0, 160)
      : ''
    if (!deckId || !entry?.deck || typeof entry.deck !== 'object') {
      throw new DeckGenerationValidationError([
        `Deck library entry ${index + 1} is invalid.`,
      ])
    }

    return {
      deckId,
      deck: validateAndHydrateSwudbDeck(
        entry.deck,
        catalog,
        validationOptions,
      ).modelDeck,
    }
  })
}
