import { getCatalogCardId } from './catalog.js'
import {
  DECK_HISTORY_FORMAT_VERSION,
  applyDeckHistoryDelta,
  createDeckHistoryDelta,
  isCompactDeckHistorySnapshot,
} from '../shared/deck-history-format.mjs'

export const INITIAL_DECK_HISTORY_LABEL = 'Loaded deck'
const MAX_DECK_HISTORY_VISUAL_CARDS = 3
const VALID_HISTORY_KINDS = new Set([
  'addition',
  'mixed',
  'removal',
  'replacement',
])

function createHistoryId() {
  return globalThis.crypto?.randomUUID?.() ??
    `deck-history-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizedCheckpoint(value) {
  return typeof value?.historyId === 'string' &&
    value.historyId.trim() &&
    value.historyId.length <= 160 &&
    Number.isInteger(value.revision) &&
    value.revision >= 0
    ? { historyId: value.historyId.trim(), revision: value.revision }
    : null
}

function historyCardId(card) {
  const catalogId = getCatalogCardId(card)
  if (catalogId) return catalogId
  return typeof card?.id === 'string' && card.id.trim()
    ? card.id.trim().slice(0, 100)
    : null
}

function compactMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined
  }
  const name = typeof metadata.name === 'string'
    ? metadata.name.slice(0, 100)
    : ''
  const author = typeof metadata.author === 'string'
    ? metadata.author.slice(0, 100)
    : ''
  return name || author
    ? { ...(name ? { name } : {}), ...(author ? { author } : {}) }
    : undefined
}

function compactCardList(cards) {
  const grouped = new Map()
  for (const card of cards ?? []) {
    const id = historyCardId(card)
    if (!id) continue
    grouped.set(id, (grouped.get(id) ?? 0) + 1)
  }
  return [...grouped]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => ({ id, count }))
}

export function compactDeckHistorySnapshot(deck) {
  const metadata = compactMetadata(deck?.metadata)
  return {
    ...(metadata ? { metadata } : {}),
    leader: historyCardId(deck?.leader),
    secondLeader: historyCardId(deck?.secondLeader),
    base: historyCardId(deck?.base),
    drawDeck: compactCardList(deck?.drawDeck),
    sideboard: compactCardList(deck?.sideboard),
  }
}

function resolveHistoryCard(id, cardsById) {
  if (id === null) return null
  const card = cardsById?.get(id)
  if (!card) throw new Error(`Deck history card ${id} is not in the catalog.`)
  return card
}

function hydrateCardList(entries, cardsById) {
  return entries.flatMap(({ id, count }) =>
    Array.from({ length: count }, () => resolveHistoryCard(id, cardsById)),
  )
}

export function hydrateDeckHistorySnapshot(snapshot, cardsById) {
  if (!isCompactDeckHistorySnapshot(snapshot)) {
    throw new Error('The deck history snapshot is invalid.')
  }
  return {
    ...(snapshot.metadata ? { metadata: { ...snapshot.metadata } } : {}),
    leader: resolveHistoryCard(snapshot.leader, cardsById),
    secondLeader: resolveHistoryCard(snapshot.secondLeader, cardsById),
    base: resolveHistoryCard(snapshot.base, cardsById),
    drawDeck: hydrateCardList(snapshot.drawDeck, cardsById),
    sideboard: hydrateCardList(snapshot.sideboard, cardsById),
  }
}

function compactChangeEntry(entry) {
  const id = entry?.id ?? historyCardId(entry?.card)
  if (typeof id !== 'string' || !id || id.length > 100) return null
  return {
    id,
    zone: typeof entry.zone === 'string' ? entry.zone : 'drawDeck',
    zoneLabel: typeof entry.zoneLabel === 'string'
      ? entry.zoneLabel.slice(0, 100)
      : 'Draw deck',
    count: Number.isInteger(entry.count) && entry.count > 0 ? entry.count : 1,
    ...(entry.changeId ? { changeId: entry.changeId } : {}),
  }
}

function compactChangeDetails(details) {
  if (!details) return null
  const compactEntries = (entries) =>
    (Array.isArray(entries) ? entries : [])
      .map(compactChangeEntry)
      .filter(Boolean)
  return {
    name: typeof details.name === 'string' ? details.name : null,
    additions: compactEntries(details.additions),
    removals: compactEntries(details.removals),
    replacements: (Array.isArray(details.replacements)
      ? details.replacements
      : []).flatMap((entry) => {
      const from = compactChangeEntry(entry.from)
      const to = compactChangeEntry(entry.to)
      return from && to
        ? [{
            zone: entry.zone,
            zoneLabel: entry.zoneLabel,
            count: Number.isInteger(entry.count) && entry.count > 0
              ? entry.count
              : 1,
            ...(entry.changeId ? { changeId: entry.changeId } : {}),
            from,
            to,
          }]
        : []
    }),
  }
}

function compactHistoryVisual(visual) {
  if (!visual || !VALID_HISTORY_KINDS.has(visual.kind)) return null
  const visualCardId = typeof visual.cardId === 'string' &&
    visual.cardId.length <= 100
    ? visual.cardId
    : null
  const cardId = historyCardId(visual.card) ?? visualCardId
  const cards = (Array.isArray(visual.cards) ? visual.cards : []).flatMap((entry) => {
    const id = historyCardId(entry.card) ?? entry.cardId ?? null
    return id && VALID_HISTORY_KINDS.has(entry.kind)
      ? [{ cardId: id, kind: entry.kind }]
      : []
  }).slice(0, MAX_DECK_HISTORY_VISUAL_CARDS)
  if (!cardId && cards.length === 0) return null
  return {
    cardId: cardId ?? cards[0].cardId,
    kind: visual.kind,
    count: Number.isInteger(visual.count) && visual.count > 0
      ? visual.count
      : 1,
    ...(cards.length > 0 ? { cards } : {}),
    ...(visual.details ? { details: compactChangeDetails(visual.details) } : {}),
  }
}

function hydrateChangeEntry(entry, cardsById) {
  const card = resolveHistoryCard(entry.id, cardsById)
  return {
    ...entry,
    name: card.name,
    subtitle: card.subtitle,
    card,
  }
}

function hydrateChangeDetails(details, cardsById) {
  if (!details) return null
  return {
    name: details.name ?? null,
    additions: (details.additions ?? []).map((entry) =>
      hydrateChangeEntry(entry, cardsById),
    ),
    removals: (details.removals ?? []).map((entry) =>
      hydrateChangeEntry(entry, cardsById),
    ),
    replacements: (details.replacements ?? []).map((entry) => ({
      ...entry,
      from: hydrateChangeEntry(entry.from, cardsById),
      to: hydrateChangeEntry(entry.to, cardsById),
    })),
  }
}

function hydrateHistoryVisual(visual, cardsById) {
  if (!visual) return null
  const card = resolveHistoryCard(visual.cardId, cardsById)
  return {
    card,
    kind: visual.kind,
    count: visual.count,
    ...(visual.cards
      ? {
          cards: visual.cards.map((entry) => ({
            card: resolveHistoryCard(entry.cardId, cardsById),
            kind: entry.kind,
          })),
        }
      : {}),
    ...(visual.details
      ? { details: hydrateChangeDetails(visual.details, cardsById) }
      : {}),
  }
}

const historySnapshotsByEntries = new WeakMap()

function createPersistentEntryMetadata(
  collectionCheckpoint,
  label,
  revision = 0,
  parentRevision = null,
  visual = null,
  changedAt = null,
) {
  return {
    revision,
    parentRevision,
    changedAt,
    label,
    collectionCheckpoint: normalizedCheckpoint(collectionCheckpoint),
    visual: compactHistoryVisual(visual),
  }
}

function cacheHistorySnapshot(entries, position, snapshot) {
  const cache = historySnapshotsByEntries.get(entries) ?? new Map()
  cache.set(position, snapshot)
  historySnapshotsByEntries.set(entries, cache)
}

function historySnapshotAt(history, requestedPosition) {
  const entries = history?.entries ?? []
  if (!isCompactDeckHistorySnapshot(entries[0]?.snapshot)) {
    throw new Error('The deck history anchor is invalid.')
  }
  const position = Math.trunc(requestedPosition)
  if (position < 0 || position >= entries.length) return null
  const cache = historySnapshotsByEntries.get(entries) ?? new Map([[0, entries[0].snapshot]])
  if (cache.has(position)) return cache.get(position)
  const startingPosition = [...cache.keys()]
    .filter((candidate) => candidate < position)
    .sort((left, right) => right - left)[0] ?? 0
  let snapshot = cache.get(startingPosition) ?? entries[0].snapshot
  for (let index = startingPosition + 1; index <= position; index += 1) {
    snapshot = applyDeckHistoryDelta(snapshot, entries[index].delta)
  }
  cache.set(position, snapshot)
  historySnapshotsByEntries.set(entries, cache)
  return snapshot
}

function materializeHistorySnapshots(history) {
  return history.entries.map((_entry, index) => historySnapshotAt(history, index))
}

export function createPersistentDeckHistory(
  deck,
  collectionCheckpoint = null,
  label = INITIAL_DECK_HISTORY_LABEL,
) {
  const snapshot = compactDeckHistorySnapshot(deck)
  const entries = [{
    ...createPersistentEntryMetadata(collectionCheckpoint, label),
    snapshot,
  }]
  cacheHistorySnapshot(entries, 0, snapshot)
  return {
    format: DECK_HISTORY_FORMAT_VERSION,
    historyId: createHistoryId(),
    revision: 0,
    position: 0,
    entries,
  }
}

function invalidHistory(message, strict, deck, checkpoint) {
  if (strict) throw new Error(message)
  return createPersistentDeckHistory(deck, checkpoint)
}

function validPersistentHistoryHeader(value) {
  return typeof value?.historyId === 'string' &&
    Boolean(value.historyId.trim()) &&
    value.historyId.length <= 160 &&
    Number.isInteger(value.revision) &&
    value.revision >= 0 &&
    Number.isInteger(value.position) &&
    Array.isArray(value.entries) &&
    value.entries.length >= 1 &&
    value.position >= 0 &&
    value.position < value.entries.length
}

function normalizedChangedAt(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null
}

function normalizePersistentEntryMetadata(
  candidate,
  index,
  previousRevision,
  latestRevision,
) {
  const changedAt = normalizedChangedAt(candidate?.changedAt)
  const validRevision = Number.isInteger(candidate?.revision) &&
    candidate.revision >= 0 &&
    candidate.revision > previousRevision &&
    candidate.revision <= latestRevision
  const validParent = index === 0
    ? candidate?.parentRevision === null || candidate?.parentRevision === undefined
    : candidate?.parentRevision === previousRevision
  if (
    !validRevision || !validParent || (index > 0 && !changedAt)
  ) {
    return null
  }
  const visual = compactHistoryVisual(candidate.visual)
  return {
    revision: candidate.revision,
    parentRevision: index === 0
      ? null
      : Number.isInteger(candidate.parentRevision)
        ? candidate.parentRevision
        : previousRevision,
    changedAt,
    label: typeof candidate.label === 'string' && candidate.label.trim()
      ? candidate.label.trim().slice(0, 240)
      : 'Deck changed',
    collectionCheckpoint: normalizedCheckpoint(candidate.collectionCheckpoint),
    visual,
  }
}

function normalizePersistentEntryContent(
  candidate,
  index,
  isDeltaFormat,
  previousSnapshot,
) {
  if (index === 0) {
    const snapshot = isDeltaFormat ? candidate.snapshot : candidate.deck
    if (!isCompactDeckHistorySnapshot(snapshot)) {
      throw new Error('The deck history anchor is invalid.')
    }
    return { content: { snapshot }, snapshot }
  }
  if (isDeltaFormat) {
    const snapshot = applyDeckHistoryDelta(previousSnapshot, candidate.delta)
    if (JSON.stringify(snapshot) === JSON.stringify(previousSnapshot)) {
      throw new Error('A deck history entry does not change the deck.')
    }
    return {
      content: { delta: candidate.delta },
      snapshot,
    }
  }
  if (!isCompactDeckHistorySnapshot(candidate.deck)) {
    throw new Error('A deck history snapshot is invalid.')
  }
  const delta = createDeckHistoryDelta(previousSnapshot, candidate.deck)
  if (Object.keys(delta).length === 0) {
    throw new Error('A deck history entry does not change the deck.')
  }
  return { content: { delta }, snapshot: candidate.deck }
}

function normalizePersistentEntries(value, isDeltaFormat, cardsById) {
  let previousRevision = -1
  const entries = []
  const snapshots = []
  for (const [index, candidate] of value.entries.entries()) {
    const metadata = normalizePersistentEntryMetadata(
      candidate,
      index,
      previousRevision,
      value.revision,
    )
    if (!metadata) throw new Error('A deck history entry is invalid.')
    const { content, snapshot } = normalizePersistentEntryContent(
      candidate,
      index,
      isDeltaFormat,
      snapshots[index - 1],
    )
    if (cardsById) {
      hydrateDeckHistorySnapshot(snapshot, cardsById)
      hydrateHistoryVisual(metadata.visual, cardsById)
    }
    entries.push({ ...metadata, ...content })
    snapshots.push(snapshot)
    previousRevision = metadata.revision
  }
  return { entries, previousRevision, snapshots }
}

export function normalizePersistentDeckHistory(
  value,
  currentDeck,
  currentCheckpoint = null,
  { cardsById = null, strict = false } = {},
) {
  if (!validPersistentHistoryHeader(value)) {
    return invalidHistory(
      'The deck history is invalid.',
      strict,
      currentDeck,
      currentCheckpoint,
    )
  }

  const isDeltaFormat = value.format === DECK_HISTORY_FORMAT_VERSION
  if (value.format !== undefined && !isDeltaFormat) {
    return invalidHistory(
      'The deck history format is not supported.',
      strict,
      currentDeck,
      currentCheckpoint,
    )
  }

  let normalized
  try {
    normalized = normalizePersistentEntries(value, isDeltaFormat, cardsById)
  } catch (error) {
    if (strict) throw error
    return createPersistentDeckHistory(currentDeck, currentCheckpoint)
  }
  const { entries, snapshots } = normalized

  if (entries.at(-1).revision !== value.revision) {
    return invalidHistory(
      'The deck history revision is invalid.',
      strict,
      currentDeck,
      currentCheckpoint,
    )
  }

  const currentSnapshot = compactDeckHistorySnapshot(currentDeck)
  if (JSON.stringify(snapshots[value.position]) !== JSON.stringify(currentSnapshot)) {
    return invalidHistory(
      'The current deck does not match its history position.',
      strict,
      currentDeck,
      currentCheckpoint,
    )
  }

  const history = {
    format: DECK_HISTORY_FORMAT_VERSION,
    historyId: value.historyId.trim(),
    revision: value.revision,
    position: value.position,
    entries,
  }
  cacheHistorySnapshot(entries, 0, snapshots[0])
  cacheHistorySnapshot(entries, value.position, snapshots[value.position])
  return history
}

export function appendPersistentDeckHistory(
  history,
  {
    collectionCheckpoint = null,
    label,
    nextDeck,
    previousDeck,
    visual = null,
    changedAt = new Date().toISOString(),
  },
) {
  const current = normalizePersistentDeckHistory(
    history,
    previousDeck,
    collectionCheckpoint,
  )
  const previousSnapshot = historySnapshotAt(current, current.position)
  const nextSnapshot = compactDeckHistorySnapshot(nextDeck)
  if (JSON.stringify(previousSnapshot) === JSON.stringify(nextSnapshot)) {
    return current
  }

  const revision = current.revision + 1
  const parentRevision = current.entries[current.position].revision
  const delta = createDeckHistoryDelta(previousSnapshot, nextSnapshot)
  const entries = [
    ...current.entries.slice(0, current.position + 1),
    {
      ...createPersistentEntryMetadata(
        collectionCheckpoint,
        label,
        revision,
        parentRevision,
        visual,
        changedAt,
      ),
      delta,
    },
  ]
  const result = {
    ...current,
    revision,
    position: entries.length - 1,
    entries,
  }
  cacheHistorySnapshot(entries, 0, historySnapshotAt(current, 0))
  cacheHistorySnapshot(entries, entries.length - 1, nextSnapshot)
  return result
}

export function movePersistentDeckHistory(history, requestedPosition) {
  if (!history?.entries?.length) return history
  const position = Math.max(
    0,
    Math.min(Math.trunc(requestedPosition), history.entries.length - 1),
  )
  return position === history.position ? history : { ...history, position }
}

export function alignPersistentDeckHistoryCheckpoints(history, checkpoint) {
  const current = normalizedCheckpoint(checkpoint)
  if (!current || !history?.entries) return history
  return {
    ...history,
    entries: history.entries.map((entry) => {
      const existing = normalizedCheckpoint(entry.collectionCheckpoint)
      return {
        ...entry,
        collectionCheckpoint:
          existing?.historyId === current.historyId &&
          existing.revision <= current.revision
            ? existing
            : current,
      }
    }),
  }
}

export function persistentDeckHistoryEntryAt(history, position = history?.position) {
  return history?.entries?.[position] ?? null
}

export function persistentDeckHistoryFutureCount(history) {
  return Math.max(0, (history?.entries?.length ?? 0) - (history?.position ?? 0) - 1)
}

export function persistentDeckHistoryNeedsMigration(history) {
  return history?.format !== DECK_HISTORY_FORMAT_VERSION
}

export function hydratePersistentDeckHistoryEntryAt(
  history,
  position,
  cardsById,
) {
  const entry = persistentDeckHistoryEntryAt(history, position)
  if (!entry) return null
  const snapshot = historySnapshotAt(history, position)
  return {
    deck: hydrateDeckHistorySnapshot(snapshot, cardsById),
    label: entry.label,
    visual: hydrateHistoryVisual(entry.visual, cardsById),
  }
}

export function hydratePersistentDeckHistory(history, cardsById) {
  const snapshots = materializeHistorySnapshots(history)
  return {
    position: history.position,
    entries: history.entries.map((entry, index) => ({
      deck: hydrateDeckHistorySnapshot(snapshots[index], cardsById),
      label: entry.label,
      visual: hydrateHistoryVisual(entry.visual, cardsById),
    })),
  }
}

function hydratePersistentDeckHistoryTimeline(history, cardsById) {
  return {
    position: history.position,
    entries: history.entries.map((entry) => ({
      label: entry.label,
      visual: hydrateHistoryVisual(entry.visual, cardsById),
    })),
  }
}

export function createDeckHistoryVisualStack(visuals) {
  const validVisuals = (visuals ?? []).filter(
    (visual) =>
      visual?.card?.url &&
      ['addition', 'removal', 'replacement'].includes(visual.kind),
  )
  if (validVisuals.length === 0) return null

  const quantities = validVisuals.map((visual) =>
    Number.isInteger(visual.count) && visual.count > 0 ? visual.count : 1,
  )
  const count = quantities.reduce((total, quantity) => total + quantity, 0)
  const cards = validVisuals
    .slice(0, MAX_DECK_HISTORY_VISUAL_CARDS)
    .map((visual) => ({ card: visual.card, kind: visual.kind }))

  validVisuals.forEach((visual, visualIndex) => {
    for (
      let copy = 1;
      copy < quantities[visualIndex] &&
        cards.length < MAX_DECK_HISTORY_VISUAL_CARDS;
      copy += 1
    ) {
      cards.push({ card: visual.card, kind: visual.kind })
    }
  })

  const primary = cards[0]
  if (count === 1) return primary

  return {
    ...primary,
    kind: cards.every(({ kind }) => kind === primary.kind)
      ? primary.kind
      : 'mixed',
    cards,
    count,
  }
}

function createHistory(_deck, label = INITIAL_DECK_HISTORY_LABEL) {
  return {
    entries: [{ label }],
    position: 0,
  }
}

export function initializeDeckHistories(
  records,
  label = INITIAL_DECK_HISTORY_LABEL,
  cardsById = null,
) {
  return Object.fromEntries(
    records.map((record) => [
      record.id,
      record.history && cardsById
        ? hydratePersistentDeckHistoryTimeline(record.history, cardsById)
        : createHistory(record.deck, label),
    ]),
  )
}

export function addDeckHistory(
  histories,
  record,
  label = INITIAL_DECK_HISTORY_LABEL,
) {
  return {
    ...histories,
    [record.id]: createHistory(record.deck, label),
  }
}

export function removeDeckHistory(histories, deckId) {
  if (!Object.hasOwn(histories, deckId)) {
    return histories
  }

  return Object.fromEntries(
    Object.entries(histories).filter(([candidateId]) => candidateId !== deckId),
  )
}

export function decksHaveSameState(left, right) {
  return left === right ||
    JSON.stringify(compactDeckHistorySnapshot(left)) ===
      JSON.stringify(compactDeckHistorySnapshot(right))
}

export function appendDeckHistory(
  histories,
  { deckId, label, nextDeck, previousDeck, visual = null },
) {
  if (decksHaveSameState(previousDeck, nextDeck)) {
    return histories
  }

  const current = histories[deckId] ?? createHistory(previousDeck)
  const entries = [
    ...current.entries.slice(0, current.position + 1),
    { label, visual },
  ]

  return {
    ...histories,
    [deckId]: {
      entries,
      position: entries.length - 1,
    },
  }
}

export function moveDeckHistory(histories, deckId, requestedPosition) {
  const current = histories[deckId]
  if (!current || current.entries.length === 0) {
    return histories
  }

  const position = Math.max(
    0,
    Math.min(Math.trunc(requestedPosition), current.entries.length - 1),
  )
  if (position === current.position) {
    return histories
  }

  return {
    ...histories,
    [deckId]: { ...current, position },
  }
}

export function deckHistoryEntryAt(history, position = history?.position) {
  return history?.entries[position] ?? null
}

export function deckHistoryShortcutDirection({
  altKey = false,
  ctrlKey = false,
  key = '',
  metaKey = false,
  shiftKey = false,
}) {
  if (altKey || (!ctrlKey && !metaKey)) {
    return 0
  }

  const normalizedKey = key.toLowerCase()
  if (normalizedKey === 'z') {
    return shiftKey ? 1 : -1
  }

  return normalizedKey === 'y' && !shiftKey ? 1 : 0
}
