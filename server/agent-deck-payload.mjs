function cardCount(entries) {
  return Array.isArray(entries)
    ? entries.reduce(
        (total, entry) => total + (Number.isInteger(entry?.count) ? entry.count : 0),
        0,
      )
    : 0
}

function compactCardReference(cardId) {
  const match = typeof cardId === 'string'
    ? cardId.match(/^(.+)_([0-9]+)$/)
    : null
  if (!match) return null

  const cardNumber = Number(match[2])
  return Number.isSafeInteger(cardNumber)
    ? { setCode: match[1], cardNumber }
    : null
}

function legacyCardEntries(entries) {
  return entries.map(({ cardId, count }) => ({ cardId, count }))
}

export function compactAgentCardGroups(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return {}

  const groups = new Map()
  for (const entry of entries) {
    const reference = compactCardReference(entry?.cardId)
    if (!reference || !Number.isInteger(entry?.count) || entry.count < 1) {
      return legacyCardEntries(entries)
    }

    if (!groups.has(reference.setCode)) {
      groups.set(reference.setCode, new Map())
    }
    const cards = groups.get(reference.setCode)
    cards.set(
      reference.cardNumber,
      (cards.get(reference.cardNumber) ?? 0) + entry.count,
    )
  }

  return Object.fromEntries(
    [...groups]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([setCode, cards]) => [
        setCode,
        [...cards].sort(([left], [right]) => left - right),
      ]),
  )
}

export const COMPACT_AGENT_CARD_GROUPS_INSTRUCTIONS =
  'Compact card groups are JSON objects keyed by set code whose values are [card number, quantity] tuples. Match each number to the catalog ID in that set, respecting the catalog ID\'s own padding, and always return exact full catalog IDs. A legacy [{cardId,count}] array may appear when an ID cannot be compacted. Compact groups are input-only; never use them in structured output.'

const COMPACT_AGENT_CARD_GROUPS_LEGEND =
  'Card group notation: {"SET":[[cardNumber,quantity]]}. Resolve through the catalog and output exact catalog IDs.'

function deckPayload(deck) {
  return {
    ...deck,
    drawDeck: compactAgentCardGroups(deck?.drawDeck),
    sideboard: compactAgentCardGroups(deck?.sideboard),
    cardCounts: {
      drawDeck: cardCount(deck?.drawDeck),
      sideboard: cardCount(deck?.sideboard),
    },
  }
}

export function serializeAgentDeckPayload(deck) {
  return JSON.stringify(deckPayload(deck))
}

export function serializeAgentChatTurn(
  prompt,
  currentDeck,
  deckLibrary = [],
  collection = { revision: 0, cards: [] },
  { collectionContext = null, includeCollection = true } = {},
) {
  const sections = [
    `User message: ${prompt}`,
    COMPACT_AGENT_CARD_GROUPS_LEGEND,
  ]

  if (deckLibrary.length > 0) {
    sections.push(
      `Deck library snapshots loaded at the start of this session (useful for comparison and discussion, but potentially stale after this turn):\n${JSON.stringify(
        deckLibrary.map((entry) => ({
          deckId: entry.deckId,
          deck: deckPayload(entry.deck),
        })),
      )}`,
    )
  }

  sections.push(
    `Currently visible deck (authoritative for this turn):\n${serializeAgentDeckPayload(currentDeck)}`,
  )
  sections.push(
    includeCollection
      ? `Player card collection (authoritative for this turn; quantities represent cards currently owned):\n${JSON.stringify(compactAgentCardGroups(collection?.cards))}`
      : 'Player card collection: unchanged from the most recent authoritative collection snapshot in this conversation.',
  )
  if (collectionContext) {
    sections.push(
      `Collection changes relative to each deck's most recent content change. Additions and removals are net ownership changes and include only quantities relevant at the current collection revision. Use this context when the user asks about new or recently acquired cards. A deck with no additions has no net-new owned cards since it last changed; historyAvailable=false means no trustworthy earlier comparison is available:\n${JSON.stringify(collectionContext)}`,
    )
  }
  return sections.join('\n\n')
}
