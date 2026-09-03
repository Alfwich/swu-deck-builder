import { createHash } from 'node:crypto'

import { DeckGenerationValidationError } from './deck-validation.js'
import { resolveCatalogCardId } from './catalog.js'

export const MAX_COLLECTION_ENTRIES = 5000
export const MAX_COLLECTION_CARD_COUNT = 999
export const MAX_COLLECTION_EVENTS = 10000

const VALID_COLLECTION_EVENT_SOURCES = new Set(['assistant', 'manual'])

function normalizeCollectionEvents(value, revision) {
  if (value === undefined) return null
  if (!Array.isArray(value) || value.length > MAX_COLLECTION_EVENTS) {
    throw new TypeError(
      `The card collection must contain no more than ${MAX_COLLECTION_EVENTS} history events.`,
    )
  }

  const revisions = new Set()
  return value.map((event, eventIndex) => {
    if (
      !Number.isInteger(event?.revision) ||
      event.revision < 1 ||
      event.revision > revision ||
      revisions.has(event.revision) ||
      !Array.isArray(event.deltas) ||
      event.deltas.length < 1 ||
      event.deltas.length > MAX_COLLECTION_ENTRIES ||
      typeof event.changedAt !== 'string' ||
      !Number.isFinite(Date.parse(event.changedAt))
    ) {
      throw new TypeError(`Card collection history event ${eventIndex + 1} is invalid.`)
    }
    revisions.add(event.revision)
    return {
      revision: event.revision,
      changedAt: new Date(event.changedAt).toISOString(),
      source: VALID_COLLECTION_EVENT_SOURCES.has(event.source)
        ? event.source
        : 'manual',
      deltas: event.deltas.map((delta, deltaIndex) => {
        const cardId = typeof delta?.cardId === 'string'
          ? delta.cardId.trim()
          : ''
        if (
          !cardId ||
          cardId.length > 100 ||
          !Number.isInteger(delta.delta) ||
          delta.delta === 0 ||
          Math.abs(delta.delta) > MAX_COLLECTION_CARD_COUNT
        ) {
          throw new TypeError(
            `Card collection history event ${eventIndex + 1} delta ${deltaIndex + 1} is invalid.`,
          )
        }
        return { cardId, delta: delta.delta }
      }),
    }
  })
}

export function normalizeAgentCardCollection(value) {
  const revision = value?.revision ?? 0
  const cards = value?.cards ?? []
  if (!Number.isInteger(revision) || revision < 0) {
    throw new TypeError('The card collection revision is invalid.')
  }
  if (!Array.isArray(cards) || cards.length > MAX_COLLECTION_ENTRIES) {
    throw new TypeError(
      `The card collection must contain no more than ${MAX_COLLECTION_ENTRIES} entries.`,
    )
  }

  const ids = new Set()
  const normalizedCards = cards.map((entry, index) => {
    const cardId = typeof entry?.cardId === 'string' ? entry.cardId.trim() : ''
    if (!cardId || cardId.length > 100 || ids.has(cardId)) {
      throw new TypeError(
        `Card collection entry ${index + 1} has an invalid or duplicate card ID.`,
      )
    }
    if (
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > MAX_COLLECTION_CARD_COUNT
    ) {
      throw new TypeError(
        `Card collection entry ${index + 1} has an invalid quantity.`,
      )
    }
    ids.add(cardId)
    return { cardId, count: entry.count }
  })

  const historyId = typeof value?.historyId === 'string'
    ? value.historyId.trim()
    : ''
  if (historyId && historyId.length > 160) {
    throw new TypeError('The card collection history ID is invalid.')
  }
  const events = normalizeCollectionEvents(value?.events, revision)

  return {
    ...(historyId ? { historyId } : {}),
    revision,
    cards: normalizedCards,
    ...(events ? { events } : {}),
  }
}

export function fingerprintAgentCardCollection(value) {
  const collection = normalizeAgentCardCollection(value)
  const canonicalCollection = {
    revision: collection.revision,
    cards: [...collection.cards].sort((left, right) =>
      left.cardId.localeCompare(right.cardId),
    ),
  }

  return createHash('sha256')
    .update(JSON.stringify(canonicalCollection))
    .digest('base64url')
}

function cardSummary(cardId, catalog) {
  const card = catalog.cardsById.get(cardId)
  return {
    id: cardId,
    name: card?.Name ?? cardId,
    subtitle: card?.Subtitle ?? null,
  }
}

export function applyCollectionOperations(
  collection,
  operations,
  catalog,
  changeIndexes = null,
) {
  const normalized = normalizeAgentCardCollection(collection)
  const grouped = new Map()
  normalized.cards.forEach(({ cardId, count }) => {
    const resolved = resolveCatalogCardId(catalog, cardId)
    grouped.set(resolved, (grouped.get(resolved) ?? 0) + count)
  })
  const issues = []
  const touched = new Set()
  const changes = []

  operations.forEach((operation, index) => {
    const changeIndex = changeIndexes?.[index] ?? index
    const label = `changes[${changeIndex}]`
    const count = operation?.count
    if (!['add', 'remove'].includes(operation?.type)) {
      issues.push(`${label} supports only add or remove in collection.`)
      return
    }
    const cardId = resolveCatalogCardId(catalog, operation?.cardId)
    if (!catalog.cardsById.has(cardId)) {
      issues.push(`${label} references unknown card ${operation?.cardId}.`)
      return
    }
    if (!Number.isInteger(count) || count < 1) {
      issues.push(`${label} must use a positive integer count.`)
      return
    }
    if (touched.has(cardId)) {
      issues.push(`${label} overlaps another collection change for ${cardId}.`)
      return
    }
    touched.add(cardId)

    const available = grouped.get(cardId) ?? 0
    if (operation.type === 'remove' && available < count) {
      issues.push(
        `${label} removes ${count} copies of ${cardId}, but only ${available} are owned.`,
      )
      return
    }
    const nextCount = operation.type === 'add'
      ? available + count
      : available - count
    if (nextCount > MAX_COLLECTION_CARD_COUNT) {
      issues.push(`${label} would exceed the maximum collection quantity.`)
      return
    }
    if (nextCount === 0) grouped.delete(cardId)
    else grouped.set(cardId, nextCount)
    changes.push({
      id: `change-${changeIndex + 1}`,
      type: operation.type,
      zone: 'collection',
      count,
      card: cardSummary(cardId, catalog),
    })
  })

  if (issues.length > 0) {
    throw new DeckGenerationValidationError(
      issues,
      'The proposed card collection changes did not pass validation.',
    )
  }

  return {
    collection: {
      ...normalized,
      cards: [...grouped].map(([cardId, count]) => ({ cardId, count })),
    },
    changes,
  }
}
