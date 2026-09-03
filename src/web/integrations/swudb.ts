import { getCatalogCards, toDeckCard } from '../catalog/catalog.js'
import type {
  Catalog,
  DeckCard,
  PlayableRawCatalogCard,
  RawCatalogCard,
} from '../types/catalog.js'
import type { Deck } from '../types/deck.js'

const UNPADDED_CARD_NUMBER_SETS = new Set(['TS26'])
const DRAW_DECK_CARD_TYPES = new Set(['Unit', 'Event', 'Upgrade'])
const STRUCTURAL_DRAW_DECK_MINIMUM = 30

interface SwudbEntry {
  id: string
  count: number
}

interface SerializeSwudbOptions {
  name?: string
  minimumDrawDeckSize?: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPlayableCard(card: RawCatalogCard): card is PlayableRawCatalogCard {
  return typeof card.Set === 'string' &&
    Boolean(card.Set) &&
    Boolean(card.Number) &&
    typeof card.Type === 'string'
}

function formatSwudbCardNumber(setCode: string, cardNumber: string) {
  if (UNPADDED_CARD_NUMBER_SETS.has(setCode)) {
    return cardNumber.replace(/^0+(?=\d)/, '')
  }

  return cardNumber.padStart(3, '0')
}

function toSwudbCardId(card: DeckCard) {
  const setCode = String(card?.setCode ?? '').trim().toUpperCase()
  const cardNumber = String(card?.cardNumber ?? '').trim()

  if (!setCode || !/^\d+$/.test(cardNumber)) {
    throw new Error(
      `Could not create a SWUDB ID for ${card?.name ?? 'an unknown card'}.`,
    )
  }

  return `${setCode}_${formatSwudbCardNumber(setCode, cardNumber)}`
}

function normalizeSwudbCardId(value: unknown) {
  const match = String(value ?? '')
    .trim()
    .match(/^([a-z0-9]+)_(\d+)$/i)

  if (!match) {
    throw new Error(`Invalid SWUDB card ID: ${value || '(missing)'}.`)
  }

  const setCode = match[1]?.toUpperCase() ?? ''
  const cardNumber = match[2] ?? ''
  return `${setCode}_${formatSwudbCardNumber(setCode, cardNumber)}`
}

function createCatalogIdIndex(catalog: Catalog) {
  const cardsById = new Map<string, PlayableRawCatalogCard>()

  getCatalogCards(catalog).forEach((card) => {
    const cardNumber = String(card?.Number ?? '').trim()

    if (!isPlayableCard(card) || !/^\d+$/.test(cardNumber)) {
      return
    }

    const id = normalizeSwudbCardId(`${card.Set}_${cardNumber}`)
    const existing = cardsById.get(id)
    const isNormal = !card.VariantType || card.VariantType === 'Normal'
    const existingIsNormal =
      existing && (!existing.VariantType || existing.VariantType === 'Normal')

    if (!existing || (isNormal && !existingIsNormal)) {
      cardsById.set(id, card)
    }
  })

  return cardsById
}

function parseJsonSource(source: unknown): unknown {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('Paste an SWUDB JSON deck definition first.')
  }

  const trimmed = source.trim()
  const json = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed

  try {
    return JSON.parse(json)
  } catch (error) {
    throw new Error(
      `The pasted deck is not valid JSON${
        error instanceof Error ? `: ${error.message}` : '.'
      }`,
    )
  }
}

function resolveSingleton(
  entry: unknown,
  label: string,
  expectedType: 'Leader' | 'Base',
  cardsById: ReadonlyMap<string, PlayableRawCatalogCard>,
) {
  if (!isObject(entry)) {
    throw new Error(`The deck is missing its ${label}.`)
  }

  if (entry.count !== undefined && entry.count !== 1) {
    throw new Error(`The ${label} count must be 1.`)
  }

  const id = normalizeSwudbCardId(entry.id)
  const card = cardsById.get(id)

  if (!card) {
    throw new Error(`Unable to find card ${id} in the local catalog.`)
  }

  if (card.Type !== expectedType) {
    throw new Error(`${id} is a ${card.Type}, not a ${expectedType}.`)
  }

  return toDeckCard(card)
}

function resolveCardEntries(
  entries: unknown,
  label: string,
  cardsById: ReadonlyMap<string, PlayableRawCatalogCard>,
): DeckCard[] {
  if (!Array.isArray(entries)) {
    throw new Error(`${label} must be an array.`)
  }

  return entries.flatMap((entry: unknown, index) => {
    if (!isObject(entry)) {
      throw new Error(`${label} entry ${index + 1} is invalid.`)
    }

    if (
      typeof entry.count !== 'number' ||
      !Number.isInteger(entry.count) ||
      entry.count < 1
    ) {
      throw new Error(`${label} entry ${index + 1} must have a positive count.`)
    }

    const id = normalizeSwudbCardId(entry.id)
    const card = cardsById.get(id)

    if (!card) {
      throw new Error(`Unable to find card ${id} in the local catalog.`)
    }

    if (!DRAW_DECK_CARD_TYPES.has(card.Type)) {
      throw new Error(`${id} is a ${card.Type} and cannot appear in ${label}.`)
    }

    return Array.from({ length: entry.count }, () => toDeckCard(card))
  })
}

function toSwudbEntry(card: DeckCard, count = 1): SwudbEntry {
  return {
    id: toSwudbCardId(card),
    count,
  }
}

function groupCardsById(cards: DeckCard[]) {
  const entries = new Map<string, SwudbEntry>()

  cards.forEach((card) => {
    const id = toSwudbCardId(card)
    const existingEntry = entries.get(id)

    if (existingEntry) {
      existingEntry.count += 1
      return
    }

    entries.set(id, { id, count: 1 })
  })

  return [...entries.values()]
}

export function serializeSwudbDeck(
  deck: Deck,
  {
    name = 'Untitled deck',
    minimumDrawDeckSize = STRUCTURAL_DRAW_DECK_MINIMUM,
  }: SerializeSwudbOptions = {},
) {
  if (!deck?.leader || !deck?.base || !Array.isArray(deck.drawDeck)) {
    throw new Error('The current deck is incomplete and cannot be copied.')
  }

  if (deck.drawDeck.length < minimumDrawDeckSize) {
    throw new Error(
      `SWUDB export requires at least ${minimumDrawDeckSize} draw-deck cards but found ${deck.drawDeck.length}.`,
    )
  }

  return {
    metadata: {
      ...(deck.metadata ?? {}),
      name,
    },
    leader: toSwudbEntry(deck.leader),
    secondleader: deck.secondLeader
      ? toSwudbEntry(deck.secondLeader)
      : null,
    base: toSwudbEntry(deck.base),
    deck: groupCardsById(deck.drawDeck),
    sideboard: groupCardsById(deck.sideboard ?? []),
  }
}

export function serializeAgentDeckContext(
  deck: Deck,
  { name = 'Untitled deck' }: { name?: string } = {},
) {
  if (
    !deck ||
    !Array.isArray(deck.drawDeck) ||
    !Array.isArray(deck.sideboard)
  ) {
    throw new Error('The current deck cannot be sent to the deck assistant.')
  }

  return {
    metadata: {
      ...(deck.metadata ?? {}),
      name,
    },
    leader: deck.leader ? toSwudbEntry(deck.leader) : null,
    secondleader: deck.secondLeader
      ? toSwudbEntry(deck.secondLeader)
      : null,
    base: deck.base ? toSwudbEntry(deck.base) : null,
    deck: groupCardsById(deck.drawDeck),
    sideboard: groupCardsById(deck.sideboard),
  }
}

export function parseSwudbDeck(source: unknown, catalog: Catalog) {
  const payload = parseJsonSource(source)

  if (!isObject(payload)) {
    throw new Error('The SWUDB deck definition must be a JSON object.')
  }

  const cardsById = createCatalogIdIndex(catalog)
  const leader = resolveSingleton(payload.leader, 'leader', 'Leader', cardsById)
  const secondLeader = payload.secondleader
    ? resolveSingleton(
        payload.secondleader,
        'second leader',
        'Leader',
        cardsById,
      )
    : null
  const base = resolveSingleton(payload.base, 'base', 'Base', cardsById)
  const drawDeck = resolveCardEntries(payload.deck, 'draw deck', cardsById)
  const sideboard = resolveCardEntries(
    payload.sideboard ?? [],
    'sideboard',
    cardsById,
  )

  if (drawDeck.length < STRUCTURAL_DRAW_DECK_MINIMUM) {
    throw new Error(
      `The imported draw deck contains ${drawDeck.length} cards; at least ${STRUCTURAL_DRAW_DECK_MINIMUM} are required.`,
    )
  }

  if (sideboard.length > 10) {
    throw new Error(
      `The imported sideboard contains ${sideboard.length} cards; at most 10 are allowed.`,
    )
  }

  const rawMetadata = isObject(payload.metadata) ? payload.metadata : {}
  const metadata: { name: string; author?: string } = {
    name:
      typeof rawMetadata.name === 'string' && rawMetadata.name.trim()
        ? rawMetadata.name.trim().slice(0, 100)
        : 'Imported deck',
  }

  if (
    typeof rawMetadata.author === 'string' &&
    rawMetadata.author.trim()
  ) {
    metadata.author = rawMetadata.author.trim().slice(0, 100)
  }

  return {
    name: metadata.name,
    deck: {
      metadata,
      leader,
      secondLeader,
      base,
      drawDeck,
      sideboard,
    },
  }
}

export function formatSwudbDeck(deck: Deck, options?: SerializeSwudbOptions) {
  return `${JSON.stringify(serializeSwudbDeck(deck, options), null, 2)}\n`
}
