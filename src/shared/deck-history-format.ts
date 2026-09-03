import type {
  CompactCardGroup,
  CompactDeckHistorySnapshot,
  DeckHistoryDelta,
} from './deck-history-types.js'

export const DECK_HISTORY_FORMAT_VERSION = 2

const MAX_DECK_ZONE_CARDS = 1000
const IDENTITY_FIELDS = ['leader', 'secondLeader', 'base'] as const
const DELTA_FIELDS = new Set<string>([
  'metadata',
  ...IDENTITY_FIELDS,
  'drawDeck',
  'sideboard',
])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validIdentity(value: unknown): value is string | null {
  return value === null || (
    typeof value === 'string' && value.length > 0 && value.length <= 100
  )
}

function validMetadata(
  value: unknown,
): value is CompactDeckHistorySnapshot['metadata'] {
  return value === undefined || (
    isObject(value) &&
    ['name', 'author'].every((key) =>
      value[key] === undefined || (
        typeof value[key] === 'string' && value[key].length <= 100
      ),
    )
  )
}

function validCardList(value: unknown): value is CompactCardGroup[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  let total = 0
  for (const entry of value) {
    if (
      !isObject(entry) ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      entry.id.length > 100 ||
      ids.has(entry.id) ||
      typeof entry.count !== 'number' ||
      !Number.isInteger(entry.count) ||
      entry.count < 1
    ) {
      return false
    }
    ids.add(entry.id)
    total += entry.count
  }
  return total <= MAX_DECK_ZONE_CARDS
}

export function isCompactDeckHistorySnapshot(
  value: unknown,
): value is CompactDeckHistorySnapshot {
  return Boolean(
    isObject(value) &&
    IDENTITY_FIELDS.every((field) => validIdentity(value[field])) &&
    validCardList(value.drawDeck) &&
    validCardList(value.sideboard) &&
    validMetadata(value.metadata),
  )
}

function cardCountMap(entries: CompactCardGroup[]) {
  return new Map(entries.map(({ id, count }) => [id, count]))
}

function createCardListDelta(
  previousEntries: CompactCardGroup[],
  nextEntries: CompactCardGroup[],
): Array<[string, number]> {
  const previous = cardCountMap(previousEntries)
  const next = cardCountMap(nextEntries)
  return [...new Set([...previous.keys(), ...next.keys()])]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((id) => {
      const count = (next.get(id) ?? 0) - (previous.get(id) ?? 0)
      return count === 0 ? [] : [[id, count]]
    })
}

export function createDeckHistoryDelta(
  previous: unknown,
  next: unknown,
): DeckHistoryDelta {
  if (!isCompactDeckHistorySnapshot(previous) || !isCompactDeckHistorySnapshot(next)) {
    throw new TypeError('Cannot create a delta from an invalid deck snapshot.')
  }

  const delta: DeckHistoryDelta = {}
  if (JSON.stringify(previous.metadata) !== JSON.stringify(next.metadata)) {
    delta.metadata = next.metadata ? { ...next.metadata } : null
  }
  for (const field of IDENTITY_FIELDS) {
    if (previous[field] !== next[field]) delta[field] = next[field]
  }
  for (const field of ['drawDeck', 'sideboard'] as const) {
    const changes = createCardListDelta(previous[field], next[field])
    if (changes.length > 0) delta[field] = changes
  }
  return delta
}

function validCardListDelta(value: unknown): value is Array<[string, number]> {
  if (!Array.isArray(value) || value.length === 0) return false
  const ids = new Set<string>()
  return value.every((entry) => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      !entry[0].trim() ||
      entry[0].length > 100 ||
      ids.has(entry[0]) ||
      !Number.isInteger(entry[1]) ||
      entry[1] === 0 ||
      Math.abs(entry[1]) > MAX_DECK_ZONE_CARDS
    ) {
      return false
    }
    ids.add(entry[0])
    return true
  })
}

function validDeckHistoryDelta(delta: unknown): delta is DeckHistoryDelta {
  if (!isObject(delta)) return false
  const keys = Object.keys(delta)
  if (keys.length === 0 || keys.some((key) => !DELTA_FIELDS.has(key))) return false
  if (
    Object.hasOwn(delta, 'metadata') &&
    delta.metadata !== null &&
    !validMetadata(delta.metadata)
  ) {
    return false
  }
  if (
    IDENTITY_FIELDS.some((field) =>
      Object.hasOwn(delta, field) && !validIdentity(delta[field]),
    )
  ) {
    return false
  }
  return ['drawDeck', 'sideboard'].every(
    (field) => !Object.hasOwn(delta, field) || validCardListDelta(delta[field]),
  )
}

function applyCardListDelta(
  entries: CompactCardGroup[],
  changes: Array<[string, number]>,
): CompactCardGroup[] {
  const counts = cardCountMap(entries)
  for (const [id, change] of changes ?? []) {
    const count = (counts.get(id) ?? 0) + change
    if (count < 0) throw new TypeError(`Deck history removes too many copies of ${id}.`)
    if (count === 0) counts.delete(id)
    else counts.set(id, count)
  }
  const result = [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => ({ id, count }))
  if (!validCardList(result)) {
    throw new TypeError('Deck history produces an invalid card list.')
  }
  return result
}

function applyScalarDeckDelta(
  snapshot: CompactDeckHistorySnapshot,
  delta: DeckHistoryDelta,
): CompactDeckHistorySnapshot {
  const next: CompactDeckHistorySnapshot = {
    ...snapshot,
    ...(snapshot.metadata ? { metadata: { ...snapshot.metadata } } : {}),
  }
  if (Object.hasOwn(delta, 'metadata')) {
    if (validMetadata(delta.metadata)) next.metadata = { ...delta.metadata }
    else delete next.metadata
  }
  for (const field of IDENTITY_FIELDS) {
    if (Object.hasOwn(delta, field) && validIdentity(delta[field])) {
      next[field] = delta[field]
    }
  }
  return next
}

export function applyDeckHistoryDelta(snapshot: unknown, delta: unknown) {
  if (!isCompactDeckHistorySnapshot(snapshot) || !validDeckHistoryDelta(delta)) {
    throw new TypeError('The deck history delta is invalid.')
  }

  const next = {
    ...applyScalarDeckDelta(snapshot, delta),
    drawDeck: snapshot.drawDeck.map((entry) => ({ ...entry })),
    sideboard: snapshot.sideboard.map((entry) => ({ ...entry })),
  }
  for (const field of ['drawDeck', 'sideboard'] as const) {
    if (Object.hasOwn(delta, field) && validCardListDelta(delta[field])) {
      next[field] = applyCardListDelta(next[field], delta[field])
    }
  }
  if (!isCompactDeckHistorySnapshot(next)) {
    throw new TypeError('The deck history delta produces an invalid deck snapshot.')
  }
  return next
}
