import { getCatalogCardId } from '../catalog/catalog.js'
import {
  DECK_HISTORY_FORMAT_VERSION,
  applyDeckHistoryDelta,
  createDeckHistoryDelta,
  isCompactDeckHistorySnapshot,
} from '../../shared/deck-history-format.js'
import type { DeckCard, ReadonlyCardReferenceMap } from '../types/catalog.js'
import type { CollectionCheckpoint } from '../types/collection.js'
import type { Deck, DeckMetadata, DeckRecord, DeckZone } from '../types/deck.js'
import type {
  CompactCardGroup,
  CompactDeckHistorySnapshot,
  CompactHistoryVisual,
  DeckHistories,
  DeckHistory,
  DeckHistoryEntry,
  DeckHistoryVisualKind,
  DeckHistoryDelta,
  HistoryChangeDetails,
  HistoryChangeEntry,
  HydratedHistoryVisual,
  PersistentDeckHistory,
  PersistentDeckHistoryEntry,
} from '../types/history.js'

export const INITIAL_DECK_HISTORY_LABEL = 'Loaded deck'
const MAX_DECK_HISTORY_VISUAL_CARDS = 3
const VALID_HISTORY_KINDS = new Set<DeckHistoryVisualKind>([
  'addition',
  'mixed',
  'removal',
  'replacement',
])

type LooseRecord = Record<string, unknown>

interface PersistentEntryCandidate extends LooseRecord {
  revision?: unknown
  parentRevision?: unknown
  changedAt?: unknown
  label?: unknown
  collectionCheckpoint?: unknown
  visual?: unknown
  snapshot?: unknown
  deck?: unknown
  delta?: unknown
}

interface PersistentHistoryCandidate extends LooseRecord {
  format?: unknown
  historyId: string
  revision: number
  position: number
  entries: PersistentEntryCandidate[]
}

function isObject(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function createHistoryId() {
  return globalThis.crypto?.randomUUID?.() ??
    `deck-history-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizedCheckpoint(value: unknown): CollectionCheckpoint | null {
  if (!isObject(value)) return null
  const revision = value.revision
  return typeof value.historyId === 'string' &&
    value.historyId.trim() &&
    value.historyId.length <= 160 &&
    typeof revision === 'number' &&
    Number.isInteger(revision) &&
    revision >= 0
    ? { historyId: value.historyId.trim(), revision }
    : null
}

function historyCardId(card: Partial<DeckCard> | null | undefined) {
  const catalogId = getCatalogCardId(card)
  if (catalogId) return catalogId
  return typeof card?.id === 'string' && card.id.trim()
    ? card.id.trim().slice(0, 100)
    : null
}

function compactMetadata(metadata: DeckMetadata | null | undefined) {
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

function compactCardList(cards: DeckCard[] | null | undefined): CompactCardGroup[] {
  const grouped = new Map<string, number>()
  for (const card of cards ?? []) {
    const id = historyCardId(card)
    if (!id) continue
    grouped.set(id, (grouped.get(id) ?? 0) + 1)
  }
  return [...grouped]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => ({ id, count }))
}

export function compactDeckHistorySnapshot(deck: Deck): CompactDeckHistorySnapshot {
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

function resolveHistoryCard(
  id: string | null,
  cardsById: ReadonlyCardReferenceMap,
): DeckCard | null {
  if (id === null) return null
  const card = cardsById?.get(id)
  if (!card) throw new Error(`Deck history card ${id} is not in the catalog.`)
  return card
}

function hydrateCardList(
  entries: CompactCardGroup[],
  cardsById: ReadonlyCardReferenceMap,
): DeckCard[] {
  return entries.flatMap(({ id, count }) =>
    Array.from({ length: count }, () => resolveHistoryCard(id, cardsById)!),
  )
}

export function hydrateDeckHistorySnapshot(
  snapshot: unknown,
  cardsById: ReadonlyCardReferenceMap,
): Deck {
  if (!isCompactDeckHistorySnapshot(snapshot)) {
    throw new Error('The deck history snapshot is invalid.')
  }
  const validSnapshot = snapshot as CompactDeckHistorySnapshot
  return {
    ...(validSnapshot.metadata ? { metadata: { ...validSnapshot.metadata } } : {}),
    leader: resolveHistoryCard(validSnapshot.leader, cardsById),
    secondLeader: resolveHistoryCard(validSnapshot.secondLeader, cardsById),
    base: resolveHistoryCard(validSnapshot.base, cardsById),
    drawDeck: hydrateCardList(validSnapshot.drawDeck, cardsById),
    sideboard: hydrateCardList(validSnapshot.sideboard, cardsById),
  }
}

function compactChangeEntry(
  entry: HistoryChangeEntry | null | undefined,
): HistoryChangeEntry | null {
  const id = entry?.id ?? historyCardId(entry?.card)
  if (!entry || typeof id !== 'string' || !id || id.length > 100) return null
  return {
    id,
    zone: (typeof entry.zone === 'string' ? entry.zone : 'drawDeck') as DeckZone,
    zoneLabel: typeof entry.zoneLabel === 'string'
      ? entry.zoneLabel.slice(0, 100)
      : 'Draw deck',
    count: typeof entry.count === 'number' && Number.isInteger(entry.count) && entry.count > 0 ? entry.count : 1,
    ...(entry.changeId ? { changeId: entry.changeId } : {}),
  }
}

function compactChangeDetails(
  details: HistoryChangeDetails | null | undefined,
): HistoryChangeDetails | null {
  if (!details) return null
  const compactEntries = (entries: HistoryChangeEntry[]) =>
    (Array.isArray(entries) ? entries : [])
      .map(compactChangeEntry)
      .filter((entry): entry is HistoryChangeEntry => Boolean(entry))
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
            count: typeof entry.count === 'number' && Number.isInteger(entry.count) && entry.count > 0
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

function compactHistoryVisual(visual: unknown): CompactHistoryVisual | null {
  if (!isObject(visual) || !VALID_HISTORY_KINDS.has(visual.kind as DeckHistoryVisualKind)) return null
  const visualCardId = typeof visual.cardId === 'string' &&
    visual.cardId.length <= 100
    ? visual.cardId
    : null
  const cardId = historyCardId(visual.card as Partial<DeckCard> | null) ?? visualCardId
  const cards = (Array.isArray(visual.cards) ? visual.cards : []).flatMap((entry) => {
    if (!isObject(entry)) return []
    const id = historyCardId(entry.card as Partial<DeckCard> | null) ??
      (typeof entry.cardId === 'string' ? entry.cardId : null)
    return id && VALID_HISTORY_KINDS.has(entry.kind as DeckHistoryVisualKind)
      ? [{ cardId: id, kind: entry.kind as DeckHistoryVisualKind }]
      : []
  }).slice(0, MAX_DECK_HISTORY_VISUAL_CARDS)
  if (!cardId && cards.length === 0) return null
  return {
    cardId: cardId ?? cards[0]!.cardId,
    kind: visual.kind as DeckHistoryVisualKind,
    count: typeof visual.count === 'number' && Number.isInteger(visual.count) && visual.count > 0
      ? visual.count
      : 1,
    ...(cards.length > 0 ? { cards } : {}),
    ...(visual.details ? { details: compactChangeDetails(visual.details as HistoryChangeDetails) } : {}),
  }
}

function hydrateChangeEntry(
  entry: HistoryChangeEntry,
  cardsById: ReadonlyCardReferenceMap,
): HistoryChangeEntry {
  const card = resolveHistoryCard(entry.id, cardsById)!
  return {
    ...entry,
    name: card.name,
    subtitle: card.subtitle,
    card,
  }
}

function hydrateChangeDetails(
  details: HistoryChangeDetails | null | undefined,
  cardsById: ReadonlyCardReferenceMap,
): HistoryChangeDetails | null {
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

function hydrateHistoryVisual(
  visual: CompactHistoryVisual | null | undefined,
  cardsById: ReadonlyCardReferenceMap,
): HydratedHistoryVisual | null {
  if (!visual) return null
  const card = resolveHistoryCard(visual.cardId, cardsById)!
  return {
    card,
    kind: visual.kind,
    count: visual.count,
    ...(visual.cards
      ? {
          cards: visual.cards.map((entry) => ({
            card: resolveHistoryCard(entry.cardId, cardsById)!,
            kind: entry.kind,
          })),
        }
      : {}),
    ...(visual.details
      ? { details: hydrateChangeDetails(visual.details, cardsById) }
      : {}),
  }
}

const historySnapshotsByEntries = new WeakMap<
  PersistentDeckHistoryEntry[],
  Map<number, CompactDeckHistorySnapshot>
>()

function createPersistentEntryMetadata(
  collectionCheckpoint: CollectionCheckpoint | null,
  label: string,
  revision = 0,
  parentRevision: number | null = null,
  visual: unknown = null,
  changedAt: string | null = null,
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

function cacheHistorySnapshot(
  entries: PersistentDeckHistoryEntry[],
  position: number,
  snapshot: CompactDeckHistorySnapshot,
) {
  const cache = historySnapshotsByEntries.get(entries) ?? new Map()
  cache.set(position, snapshot)
  historySnapshotsByEntries.set(entries, cache)
}

function historySnapshotAt(
  history: PersistentDeckHistory,
  requestedPosition: number,
): CompactDeckHistorySnapshot | null {
  const entries = history?.entries ?? []
  if (!isCompactDeckHistorySnapshot(entries[0]?.snapshot)) {
    throw new Error('The deck history anchor is invalid.')
  }
  const position = Math.trunc(requestedPosition)
  if (position < 0 || position >= entries.length) return null
  const anchor = entries[0]!.snapshot as CompactDeckHistorySnapshot
  const cache = historySnapshotsByEntries.get(entries) ??
    new Map<number, CompactDeckHistorySnapshot>([[0, anchor]])
  if (cache.has(position)) return cache.get(position)!
  const startingPosition = [...cache.keys()]
    .filter((candidate) => candidate < position)
    .sort((left, right) => right - left)[0] ?? 0
  let snapshot = cache.get(startingPosition) ?? anchor
  for (let index = startingPosition + 1; index <= position; index += 1) {
    snapshot = applyDeckHistoryDelta(snapshot, entries[index]!.delta) as CompactDeckHistorySnapshot
  }
  cache.set(position, snapshot)
  historySnapshotsByEntries.set(entries, cache)
  return snapshot
}

function materializeHistorySnapshots(history: PersistentDeckHistory) {
  return history.entries.map((_entry, index) => historySnapshotAt(history, index)!)
}

export function createPersistentDeckHistory(
  deck: Deck,
  collectionCheckpoint: CollectionCheckpoint | null = null,
  label = INITIAL_DECK_HISTORY_LABEL,
): PersistentDeckHistory {
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

function invalidHistory(
  message: string,
  strict: boolean,
  deck: Deck,
  checkpoint: CollectionCheckpoint | null,
): PersistentDeckHistory {
  if (strict) throw new Error(message)
  return createPersistentDeckHistory(deck, checkpoint)
}

function validPersistentHistoryHeader(
  value: unknown,
): value is PersistentHistoryCandidate {
  if (!isObject(value)) return false
  const revision = value.revision
  const position = value.position
  return typeof value.historyId === 'string' &&
    Boolean(value.historyId.trim()) &&
    value.historyId.length <= 160 &&
    typeof revision === 'number' &&
    Number.isInteger(revision) &&
    revision >= 0 &&
    typeof position === 'number' &&
    Number.isInteger(position) &&
    Array.isArray(value.entries) &&
    value.entries.length >= 1 &&
    position >= 0 &&
    position < value.entries.length
}

function normalizedChangedAt(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null
}

function normalizePersistentEntryMetadata(
  candidate: PersistentEntryCandidate,
  index: number,
  previousRevision: number,
  latestRevision: number,
) {
  const changedAt = normalizedChangedAt(candidate?.changedAt)
  const revision = candidate.revision
  const validRevision = typeof revision === 'number' &&
    Number.isInteger(revision) &&
    revision >= 0 &&
    revision > previousRevision &&
    revision <= latestRevision
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
    revision,
    parentRevision: index === 0
      ? null
      : typeof candidate.parentRevision === 'number' && Number.isInteger(candidate.parentRevision)
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
  candidate: PersistentEntryCandidate,
  index: number,
  isDeltaFormat: boolean,
  previousSnapshot: CompactDeckHistorySnapshot | undefined,
) {
  if (index === 0) {
    const snapshot = isDeltaFormat ? candidate.snapshot : candidate.deck
    if (!isCompactDeckHistorySnapshot(snapshot)) {
      throw new Error('The deck history anchor is invalid.')
    }
    return {
      content: { snapshot: snapshot as CompactDeckHistorySnapshot },
      snapshot: snapshot as CompactDeckHistorySnapshot,
    }
  }
  if (isDeltaFormat) {
    const snapshot = applyDeckHistoryDelta(
      previousSnapshot,
      candidate.delta,
    ) as CompactDeckHistorySnapshot
    if (JSON.stringify(snapshot) === JSON.stringify(previousSnapshot)) {
      throw new Error('A deck history entry does not change the deck.')
    }
    return {
      content: { delta: candidate.delta as DeckHistoryDelta },
      snapshot,
    }
  }
  if (!isCompactDeckHistorySnapshot(candidate.deck)) {
    throw new Error('A deck history snapshot is invalid.')
  }
  const validDeck = candidate.deck as CompactDeckHistorySnapshot
  const delta = createDeckHistoryDelta(
    previousSnapshot,
    validDeck,
  ) as unknown as DeckHistoryDelta
  if (Object.keys(delta).length === 0) {
    throw new Error('A deck history entry does not change the deck.')
  }
  return { content: { delta }, snapshot: validDeck }
}

function normalizePersistentEntries(
  value: PersistentHistoryCandidate,
  isDeltaFormat: boolean,
  cardsById: ReadonlyCardReferenceMap | null,
) {
  let previousRevision = -1
  const entries: PersistentDeckHistoryEntry[] = []
  const snapshots: CompactDeckHistorySnapshot[] = []
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
  value: unknown,
  currentDeck: Deck,
  currentCheckpoint: CollectionCheckpoint | null = null,
  {
    cardsById = null,
    strict = false,
  }: { cardsById?: ReadonlyCardReferenceMap | null; strict?: boolean } = {},
): PersistentDeckHistory {
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

  if (entries.at(-1)!.revision !== value.revision) {
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

  const history: PersistentDeckHistory = {
    format: DECK_HISTORY_FORMAT_VERSION,
    historyId: value.historyId.trim(),
    revision: value.revision,
    position: value.position,
    entries,
  }
  cacheHistorySnapshot(entries, 0, snapshots[0]!)
  cacheHistorySnapshot(entries, value.position, snapshots[value.position]!)
  return history
}

export function appendPersistentDeckHistory(
  history: PersistentDeckHistory,
  {
    collectionCheckpoint = null,
    label,
    nextDeck,
    previousDeck,
    visual = null,
    changedAt = new Date().toISOString(),
  }: {
    collectionCheckpoint?: CollectionCheckpoint | null
    label: string
    nextDeck: Deck
    previousDeck: Deck
    visual?: unknown
    changedAt?: string
  },
): PersistentDeckHistory {
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
  const parentRevision = current.entries[current.position]!.revision
  const delta = createDeckHistoryDelta(
    previousSnapshot,
    nextSnapshot,
  ) as unknown as DeckHistoryDelta
  const entries: PersistentDeckHistoryEntry[] = [
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
  cacheHistorySnapshot(entries, 0, historySnapshotAt(current, 0)!)
  cacheHistorySnapshot(entries, entries.length - 1, nextSnapshot)
  return result
}

export function movePersistentDeckHistory(
  history: PersistentDeckHistory,
  requestedPosition: number,
) {
  if (!history?.entries?.length) return history
  const position = Math.max(
    0,
    Math.min(Math.trunc(requestedPosition), history.entries.length - 1),
  )
  return position === history.position ? history : { ...history, position }
}

export function alignPersistentDeckHistoryCheckpoints(
  history: PersistentDeckHistory,
  checkpoint: CollectionCheckpoint,
): PersistentDeckHistory {
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

export function persistentDeckHistoryEntryAt(
  history: PersistentDeckHistory | null | undefined,
  position = history?.position ?? 0,
) {
  return history?.entries?.[position] ?? null
}

export function persistentDeckHistoryFutureCount(
  history: PersistentDeckHistory | null | undefined,
) {
  return Math.max(0, (history?.entries?.length ?? 0) - (history?.position ?? 0) - 1)
}

export function persistentDeckHistoryNeedsMigration(
  history: PersistentDeckHistory | null | undefined,
) {
  return history?.format !== DECK_HISTORY_FORMAT_VERSION
}

export function hydratePersistentDeckHistoryEntryAt(
  history: PersistentDeckHistory,
  position: number,
  cardsById: ReadonlyCardReferenceMap,
): DeckHistoryEntry | null {
  const entry = persistentDeckHistoryEntryAt(history, position)
  if (!entry) return null
  const snapshot = historySnapshotAt(history, position)
  return {
    deck: hydrateDeckHistorySnapshot(snapshot, cardsById),
    label: entry.label,
    visual: hydrateHistoryVisual(entry.visual, cardsById),
  }
}

export function hydratePersistentDeckHistory(
  history: PersistentDeckHistory,
  cardsById: ReadonlyCardReferenceMap,
): DeckHistory {
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

function hydratePersistentDeckHistoryTimeline(
  history: PersistentDeckHistory,
  cardsById: ReadonlyCardReferenceMap,
): DeckHistory {
  return {
    position: history.position,
    entries: history.entries.map((entry) => ({
      label: entry.label,
      visual: hydrateHistoryVisual(entry.visual, cardsById),
    })),
  }
}

interface HistoryVisualInput {
  card: DeckCard
  kind: DeckHistoryVisualKind
  count?: number
}

export function createDeckHistoryVisualStack(
  visuals: Array<HistoryVisualInput | null | undefined>,
): HydratedHistoryVisual | null {
  const validVisuals = (visuals ?? []).filter(
    (visual): visual is HistoryVisualInput =>
      visual != null &&
      Boolean(visual.card.url) &&
      ['addition', 'removal', 'replacement'].includes(visual.kind) === true,
  )
  if (validVisuals.length === 0) return null

  const quantities = validVisuals.map((visual) =>
    typeof visual.count === 'number' && Number.isInteger(visual.count) && visual.count > 0
      ? visual.count
      : 1,
  )
  const count = quantities.reduce((total, quantity) => total + quantity, 0)
  const cards = validVisuals
    .slice(0, MAX_DECK_HISTORY_VISUAL_CARDS)
    .map((visual) => ({ card: visual.card, kind: visual.kind }))

  validVisuals.forEach((visual, visualIndex) => {
    for (
      let copy = 1;
      copy < quantities[visualIndex]! &&
        cards.length < MAX_DECK_HISTORY_VISUAL_CARDS;
      copy += 1
    ) {
      cards.push({ card: visual.card, kind: visual.kind })
    }
  })

  const primary = cards[0]!
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

function createHistory(_deck: Deck, label = INITIAL_DECK_HISTORY_LABEL): DeckHistory {
  return {
    entries: [{ label }],
    position: 0,
  }
}

export function initializeDeckHistories(
  records: Array<Pick<DeckRecord, 'id' | 'deck' | 'history'>>,
  label = INITIAL_DECK_HISTORY_LABEL,
  cardsById: ReadonlyCardReferenceMap | null = null,
): DeckHistories {
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
  histories: DeckHistories,
  record: Pick<DeckRecord, 'id' | 'deck'>,
  label = INITIAL_DECK_HISTORY_LABEL,
): DeckHistories {
  return {
    ...histories,
    [record.id]: createHistory(record.deck, label),
  }
}

export function removeDeckHistory(histories: DeckHistories, deckId: string) {
  if (!Object.hasOwn(histories, deckId)) {
    return histories
  }

  return Object.fromEntries(
    Object.entries(histories).filter(([candidateId]) => candidateId !== deckId),
  )
}

export function decksHaveSameState(left: Deck, right: Deck) {
  return left === right ||
    JSON.stringify(compactDeckHistorySnapshot(left)) ===
      JSON.stringify(compactDeckHistorySnapshot(right))
}

export function appendDeckHistory(
  histories: DeckHistories,
  {
    deckId,
    label,
    nextDeck,
    previousDeck,
    visual = null,
  }: {
    deckId: string
    label: string
    nextDeck: Deck
    previousDeck: Deck
    visual?: HydratedHistoryVisual | null
  },
): DeckHistories {
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

export function moveDeckHistory(
  histories: DeckHistories,
  deckId: string,
  requestedPosition: number,
): DeckHistories {
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

export function deckHistoryEntryAt(
  history: DeckHistory | null | undefined,
  position = history?.position ?? 0,
) {
  return history?.entries[position] ?? null
}

export function deckHistoryShortcutDirection({
  altKey = false,
  ctrlKey = false,
  key = '',
  metaKey = false,
  shiftKey = false,
}: {
  altKey?: boolean
  ctrlKey?: boolean
  key?: string
  metaKey?: boolean
  shiftKey?: boolean
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
