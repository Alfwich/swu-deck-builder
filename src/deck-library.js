export const DECK_LIBRARY_STORAGE_KEY = 'swu-deck-builder.deck-library.v1'

const MAX_DECK_NAME_LENGTH = 100
const VALID_KINDS = new Set(['ai', 'imported', 'saved'])

function createDeckId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `deck-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isPersistableDeck(deck) {
  return Boolean(
    deck &&
      Array.isArray(deck.drawDeck) &&
      Array.isArray(deck.sideboard),
  )
}

export function createEmptyDeck() {
  return {
    leader: null,
    secondLeader: null,
    base: null,
    drawDeck: [],
    sideboard: [],
  }
}

export function normalizeDeckName(value, fallback = 'Untitled deck') {
  const name = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')

  return (name || fallback).slice(0, MAX_DECK_NAME_LENGTH)
}

function normalizedNameKey(value) {
  return normalizeDeckName(value).toLocaleLowerCase()
}

export function isDeckNameAvailable(records, name, excludedId = null) {
  const key = normalizedNameKey(name)
  return !records.some(
    (record) => record.id !== excludedId && normalizedNameKey(record.name) === key,
  )
}

export function createUniqueDeckName(records, requestedName, excludedId = null) {
  const baseName = normalizeDeckName(requestedName)

  if (isDeckNameAvailable(records, baseName, excludedId)) {
    return baseName
  }

  let suffix = 2
  while (!isDeckNameAvailable(records, `${baseName} (${suffix})`, excludedId)) {
    suffix += 1
  }

  return `${baseName} (${suffix})`
}

export function addDeckRecord(records, { deck, name, kind = 'saved' }) {
  const timestamp = new Date().toISOString()
  const record = {
    id: createDeckId(),
    name: createUniqueDeckName(records, name),
    kind: VALID_KINDS.has(kind) ? kind : 'saved',
    deck,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return { records: [...records, record], record }
}

export function updateDeckRecord(records, id, deck) {
  const existing = records.find((record) => record.id === id)

  if (!existing) {
    throw new Error('The selected deck is no longer in the deck library.')
  }

  const record = {
    ...existing,
    deck,
    updatedAt: new Date().toISOString(),
  }

  return {
    records: records.map((candidate) =>
      candidate.id === id ? record : candidate,
    ),
    record,
  }
}

export function renameDeckRecord(records, id, requestedName) {
  const name = normalizeDeckName(requestedName, '')

  if (!name) {
    throw new Error('Deck names cannot be empty.')
  }

  if (!isDeckNameAvailable(records, name, id)) {
    throw new Error(`A deck named “${name}” already exists.`)
  }

  const existing = records.find((record) => record.id === id)
  if (!existing) {
    throw new Error('The selected deck is no longer in the deck library.')
  }

  return records.map((record) =>
    record.id === id
      ? { ...record, name, updatedAt: new Date().toISOString() }
      : record,
  )
}

export function deleteDeckRecord(records, id, selectedId) {
  const deletedIndex = records.findIndex((record) => record.id === id)

  if (deletedIndex === -1) {
    throw new Error('The selected deck is no longer in the deck library.')
  }

  const nextRecords = records.filter((record) => record.id !== id)
  const nextSelectedId =
    selectedId === id
      ? nextRecords[Math.min(deletedIndex, nextRecords.length - 1)]?.id ?? null
      : selectedId

  return { records: nextRecords, selectedId: nextSelectedId }
}

export function loadDeckLibrary(storage) {
  try {
    const raw = storage?.getItem(DECK_LIBRARY_STORAGE_KEY)
    if (!raw) {
      return { records: [], selectedId: null }
    }

    const payload = JSON.parse(raw)
    if (!Array.isArray(payload?.decks)) {
      return { records: [], selectedId: null }
    }

    const records = []
    const ids = new Set()
    payload.decks.forEach((candidate) => {
      if (!candidate || !isPersistableDeck(candidate.deck)) {
        return
      }

      const kind = VALID_KINDS.has(candidate.kind) ? candidate.kind : 'saved'

      const id =
        typeof candidate.id === 'string' && candidate.id && !ids.has(candidate.id)
          ? candidate.id
          : createDeckId()
      const name = createUniqueDeckName(records, candidate.name)
      const timestamp = new Date().toISOString()

      records.push({
        id,
        name,
        kind,
        deck: {
          ...candidate.deck,
          leader: candidate.deck.leader ?? null,
          secondLeader: candidate.deck.secondLeader ?? null,
          base: candidate.deck.base ?? null,
        },
        createdAt: candidate.createdAt || timestamp,
        updatedAt: candidate.updatedAt || timestamp,
      })
      ids.add(id)
    })

    const selectedId = records.some((record) => record.id === payload.selectedId)
      ? payload.selectedId
      : records[0]?.id ?? null

    return { records, selectedId }
  } catch {
    return { records: [], selectedId: null }
  }
}

export function saveDeckLibrary(storage, records, selectedId) {
  storage?.setItem(
    DECK_LIBRARY_STORAGE_KEY,
    JSON.stringify({ version: 2, selectedId, decks: records }),
  )
}
