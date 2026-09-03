import type { DeckCard } from '../types/catalog.js'
import type { Deck } from '../types/deck.js'

const DRAW_DECK_CARD_TYPES = new Set(['unit', 'event', 'upgrade'])

export interface DeckFormat {
  id: 'premier' | 'eternal' | 'trilogy' | 'sealed' | 'draft' | 'twin-suns'
  name: string
  leaders: number
  minimumDrawDeck: number
  maximumDrawDeck: number | null
  copyLimit: number | null
  maximumSideboard: number
  unknownReason: string
}

export interface DeckFormatEvaluation extends DeckFormat {
  status: 'illegal' | 'indeterminate'
  issues: string[]
}

export const DECK_FORMATS: readonly Readonly<DeckFormat>[] = Object.freeze([
  Object.freeze({
    id: 'premier',
    name: 'Premier',
    leaders: 1,
    minimumDrawDeck: 50,
    maximumDrawDeck: null,
    copyLimit: 3,
    maximumSideboard: 10,
    unknownReason: 'Rotation and suspension snapshot not loaded.',
  }),
  Object.freeze({
    id: 'eternal',
    name: 'Eternal',
    leaders: 1,
    minimumDrawDeck: 50,
    maximumDrawDeck: null,
    copyLimit: 3,
    maximumSideboard: 10,
    unknownReason: 'Suspension snapshot not loaded.',
  }),
  Object.freeze({
    id: 'trilogy',
    name: 'Trilogy',
    leaders: 1,
    minimumDrawDeck: 50,
    maximumDrawDeck: null,
    copyLimit: 3,
    maximumSideboard: 0,
    unknownReason: 'Requires the complete three-deck package and a legality policy.',
  }),
  Object.freeze({
    id: 'sealed',
    name: 'Sealed',
    leaders: 1,
    minimumDrawDeck: 30,
    maximumDrawDeck: null,
    copyLimit: null,
    maximumSideboard: 0,
    unknownReason: 'Sealed pool and event policy not loaded.',
  }),
  Object.freeze({
    id: 'draft',
    name: 'Draft',
    leaders: 1,
    minimumDrawDeck: 30,
    maximumDrawDeck: null,
    copyLimit: null,
    maximumSideboard: 0,
    unknownReason: 'Draft pool and event policy not loaded.',
  }),
  Object.freeze({
    id: 'twin-suns',
    name: 'Twin Suns',
    leaders: 2,
    minimumDrawDeck: 80,
    maximumDrawDeck: null,
    copyLimit: 1,
    maximumSideboard: 0,
    unknownReason: 'Release and suspension policy not loaded.',
  }),
])

function definitionKey(card: DeckCard | null | undefined) {
  return [card?.type, card?.name, card?.subtitle ?? '']
    .map((value) => String(value ?? '').trim().toLocaleLowerCase())
    .join('\u0000')
}

interface DefinitionCount {
  name: string
  count: number
  maximum: number
}

function countDefinitions(cards: DeckCard[]) {
  const counts = new Map<string, DefinitionCount>()

  for (const card of cards) {
    const key = definitionKey(card)
    const current = counts.get(key)
    if (current) {
      current.count += 1
      current.maximum = Math.max(
        current.maximum,
        Number.isInteger(card?.maxCopies) ? card.maxCopies : 3,
      )
    } else {
      counts.set(key, {
        name: [card?.name, card?.subtitle].filter(Boolean).join(' — ') || 'Unknown card',
        count: 1,
        maximum: Number.isInteger(card?.maxCopies) ? card.maxCopies : 3,
      })
    }
  }

  return [...counts.values()]
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function validateDeckStructure(
  deck: Deck | null,
  format: Readonly<DeckFormat>,
  leaders: DeckCard[],
  drawDeck: DeckCard[],
  sideboard: DeckCard[],
  issues: string[],
) {
  if (leaders.length !== format.leaders) {
    issues.push(
      `${format.name} requires ${pluralize(format.leaders, 'leader')}; ${leaders.length} selected.`,
    )
  }

  if (!deck?.base) {
    issues.push(`${format.name} requires exactly one base.`)
  }

  if (drawDeck.length < format.minimumDrawDeck) {
    issues.push(
      `Draw deck needs ${format.minimumDrawDeck - drawDeck.length} more card${format.minimumDrawDeck - drawDeck.length === 1 ? '' : 's'}.`,
    )
  }

  if (
    format.maximumDrawDeck !== null &&
    drawDeck.length > format.maximumDrawDeck
  ) {
    issues.push(`Draw deck exceeds the ${format.maximumDrawDeck}-card maximum.`)
  }

  const invalidDrawCard = drawDeck.find(
    (card) => !DRAW_DECK_CARD_TYPES.has(String(card?.type).toLowerCase()),
  )
  if (invalidDrawCard) {
    issues.push(`${invalidDrawCard.name} cannot appear in the draw deck.`)
  }

  const invalidSideboardCard = sideboard.find(
    (card) => !DRAW_DECK_CARD_TYPES.has(String(card?.type).toLowerCase()),
  )
  if (invalidSideboardCard) {
    issues.push(`${invalidSideboardCard.name} cannot appear in the sideboard.`)
  }

  if (sideboard.length > format.maximumSideboard) {
    issues.push(
      format.maximumSideboard === 0
        ? `${format.name} does not use a constructed sideboard.`
        : `Sideboard exceeds the ${format.maximumSideboard}-card maximum.`,
    )
  }
}

function formatCopyLimit(entry: DefinitionCount, copyLimit: number) {
  if (copyLimit === 1) {
    return Math.max(1, entry.maximum === 3 ? 1 : entry.maximum)
  }
  return Math.max(copyLimit, entry.maximum)
}

function validateCopyLimit(
  drawDeck: DeckCard[],
  format: Readonly<DeckFormat>,
  issues: string[],
) {
  const copyLimit = format.copyLimit
  if (copyLimit === null) {
    return
  }
  const overLimit = countDefinitions(drawDeck).find(
    (entry) => entry.count > formatCopyLimit(entry, copyLimit),
  )
  if (overLimit) {
    issues.push(`${overLimit.name} has ${overLimit.count} copies.`)
  }
}

function validateTwinSunsLeaders(
  leaders: DeckCard[],
  format: Readonly<DeckFormat>,
  issues: string[],
) {
  if (format.id !== 'twin-suns' || leaders.length !== 2) {
    return
  }
  const [firstLeader, secondLeader] = leaders
  if (
    firstLeader &&
    secondLeader &&
    definitionKey(firstLeader) === definitionKey(secondLeader)
  ) {
    issues.push('Twin Suns leaders must be different card definitions.')
  }

  const aspects = new Set(
    leaders.flatMap((leader) =>
      (leader.aspects ?? []).map((aspect) => String(aspect).toLowerCase()),
    )
  )
  if (aspects.has('heroism') && aspects.has('villainy')) {
    issues.push('Twin Suns leaders cannot collectively provide Heroism and Villainy.')
  }
}

function evaluateFormat(
  deck: Deck | null,
  format: Readonly<DeckFormat>,
): DeckFormatEvaluation {
  const issues: string[] = []
  const leaders = [deck?.leader, deck?.secondLeader].filter(
    (card): card is DeckCard => card != null,
  )
  const drawDeck = Array.isArray(deck?.drawDeck) ? deck.drawDeck : []
  const sideboard = Array.isArray(deck?.sideboard) ? deck.sideboard : []

  validateDeckStructure(deck, format, leaders, drawDeck, sideboard, issues)
  validateCopyLimit(drawDeck, format, issues)
  validateTwinSunsLeaders(leaders, format, issues)

  return {
    ...format,
    status: issues.length > 0 ? 'illegal' : 'indeterminate',
    issues,
  }
}

export function evaluateDeckFormats(deck: Deck | null) {
  return DECK_FORMATS.map((format) => evaluateFormat(deck, format))
}
