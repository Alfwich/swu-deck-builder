import { getCatalogCards, toDeckCard } from '../catalog.js'

const UNPADDED_CARD_NUMBER_SETS = new Set(['TS26'])
const DRAW_DECK_CARD_TYPES = new Set(['Unit', 'Event', 'Upgrade'])

function formatSwudbCardNumber(setCode, cardNumber) {
  if (UNPADDED_CARD_NUMBER_SETS.has(setCode)) {
    return cardNumber.replace(/^0+(?=\d)/, '')
  }

  return cardNumber.padStart(3, '0')
}

function toSwudbCardId(card) {
  const setCode = String(card?.setCode ?? '').trim().toUpperCase()
  const cardNumber = String(card?.cardNumber ?? '').trim()

  if (!setCode || !/^\d+$/.test(cardNumber)) {
    throw new Error(
      `Could not create a SWUDB ID for ${card?.name ?? 'an unknown card'}.`,
    )
  }

  return `${setCode}_${formatSwudbCardNumber(setCode, cardNumber)}`
}

function normalizeSwudbCardId(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^([a-z0-9]+)_(\d+)$/i)

  if (!match) {
    throw new Error(`Invalid SWUDB card ID: ${value || '(missing)'}.`)
  }

  const setCode = match[1].toUpperCase()
  return `${setCode}_${formatSwudbCardNumber(setCode, match[2])}`
}

function createCatalogIdIndex(catalog) {
  const cardsById = new Map()

  getCatalogCards(catalog).forEach((card) => {
    const cardNumber = String(card?.Number ?? '').trim()

    if (!card?.Set || !/^\d+$/.test(cardNumber) || !card?.Type) {
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

function parseJsonSource(source) {
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

function resolveSingleton(entry, label, expectedType, cardsById) {
  if (!entry || typeof entry !== 'object') {
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

function resolveCardEntries(entries, label, cardsById) {
  if (!Array.isArray(entries)) {
    throw new Error(`${label} must be an array.`)
  }

  return entries.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${label} entry ${index + 1} is invalid.`)
    }

    if (!Number.isInteger(entry.count) || entry.count < 1) {
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

function toSwudbEntry(card, count = 1) {
  return {
    id: toSwudbCardId(card),
    count,
  }
}

function groupCardsById(cards) {
  const entries = new Map()

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

export function serializeSwudbDeck(deck, { name = 'Random deck' } = {}) {
  if (!deck?.leader || !deck?.base || !Array.isArray(deck.drawDeck)) {
    throw new Error('The current deck is incomplete and cannot be copied.')
  }

  if (deck.drawDeck.length !== 50) {
    throw new Error(
      `SWUDB export expected 50 draw-deck cards but found ${deck.drawDeck.length}.`,
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

export function parseSwudbDeck(source, catalog) {
  const payload = parseJsonSource(source)

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
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

  if (drawDeck.length !== 50) {
    throw new Error(
      `The imported draw deck contains ${drawDeck.length} cards; exactly 50 are required.`,
    )
  }

  if (sideboard.length > 10) {
    throw new Error(
      `The imported sideboard contains ${sideboard.length} cards; at most 10 are allowed.`,
    )
  }

  const metadata = {
    name:
      typeof payload.metadata?.name === 'string' && payload.metadata.name.trim()
        ? payload.metadata.name.trim().slice(0, 100)
        : 'Imported deck',
  }

  if (
    typeof payload.metadata?.author === 'string' &&
    payload.metadata.author.trim()
  ) {
    metadata.author = payload.metadata.author.trim().slice(0, 100)
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

export function formatSwudbDeck(deck, options) {
  return `${JSON.stringify(serializeSwudbDeck(deck, options), null, 2)}\n`
}
