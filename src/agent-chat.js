import { serializeAgentDeckContext } from './integrations/swudb.js'

export const AGENT_CHAT_STORAGE_KEY = 'swu-deck-builder.agent-chat.v1'
export const AGENT_REPOSITORY_URL =
  'https://github.com/Alfwich/swu-deck-builder'

const MAX_MESSAGES = 50
const MAX_INITIAL_DECK_LIBRARY_SIZE = 5
const CARD_REFERENCE_PATTERN = /\b[A-Z][A-Z0-9]{1,7}_\d{1,4}\b/g

function updatedTime(record) {
  const timestamp = Date.parse(record?.updatedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function createRecentAgentDeckLibrary(records) {
  return [...(records ?? [])]
    .map((record, index) => ({ record, index }))
    .sort(
      (left, right) =>
        updatedTime(right.record) - updatedTime(left.record) ||
        right.index - left.index,
    )
    .slice(0, MAX_INITIAL_DECK_LIBRARY_SIZE)
    .map(({ record }) => ({
      deckId: record.id,
      deck: serializeAgentDeckContext(record.deck, { name: record.name }),
    }))
}

export function getAgentAccessNotice({
  resolved,
  available,
  desktopSettingsAvailable = false,
}) {
  if (!resolved) {
    return {
      title: 'Checking AI access',
      text: 'Checking whether the hosted deck assistant is available for this connection.',
    }
  }

  if (available) {
    return null
  }

  if (desktopSettingsAvailable) {
    return {
      title: 'Enable the deck assistant',
      text: 'Choose a local Codex or Claude CLI in Desktop settings. The app uses the CLI authentication for your operating-system user.',
      featureTitle: 'What you can do',
      features: [
        'Build complete decks around your preferred leader or strategy.',
        'Ask about strategy, matchups, legality, and the visible deck.',
        'Review validated card-by-card changes before applying them.',
        'Use optional web research for current policy and metagame context.',
      ],
      action: 'open-desktop-settings',
      actionLabel: 'Open desktop settings',
    }
  }

  return {
    title: 'Run the deck assistant locally',
    text: 'Download and run this tool locally to connect the Deck Assistant to an installed Codex or Claude CLI.',
    featureTitle: 'What you can do',
    features: [
      'Build complete decks around your preferred leader or strategy.',
      'Ask about strategy, matchups, legality, and the visible deck.',
      'Review validated card-by-card changes before applying them.',
      'Use optional web research for current policy and metagame context.',
    ],
    link: AGENT_REPOSITORY_URL,
    linkLabel: 'Clone the repository →',
    externalLink: true,
  }
}

function validMessage(message) {
  return (
    message &&
    typeof message.id === 'string' &&
    ['assistant', 'user', 'system'].includes(message.role) &&
    typeof message.text === 'string'
  )
}

export function createAgentGreeting(deckName) {
  const currentDeck = deckName || 'the current deck'

  return {
    id: `greeting-${Date.now()}`,
    role: 'assistant',
    text: 'I can help you:',
    features: [
      `Modify or improve ${currentDeck}`,
      'Build a new deck around a leader, strategy, or play style',
      'Answer questions about cards, matchups, legality, or deck-building',
    ],
    followup: 'What would you like to do?',
  }
}

export function agentChatDeckContext(record) {
  return {
    deckId: record?.id ?? null,
    deckName: record?.name ?? '',
    deckUpdatedAt: record?.updatedAt ?? null,
  }
}

export function parseAgentCardReferences(text, cardsById) {
  const value = String(text ?? '')
  const segments = []
  let cursor = 0

  for (const match of value.matchAll(CARD_REFERENCE_PATTERN)) {
    const card = cardsById?.get(match[0])
    if (!card) {
      continue
    }

    if (match.index > cursor) {
      segments.push({ type: 'text', text: value.slice(cursor, match.index) })
    }
    segments.push({ type: 'card', id: match[0], card })
    cursor = match.index + match[0].length
  }

  if (cursor < value.length) {
    segments.push({ type: 'text', text: value.slice(cursor) })
  }

  return segments.length > 0 ? segments : [{ type: 'text', text: value }]
}

export function loadAgentChat(storage, currentTime = Date.now()) {
  try {
    const raw = storage?.getItem(AGENT_CHAT_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const value = JSON.parse(raw)
    const neverExpires = value?.expiresAt === null
    const expiresAt = neverExpires ? null : Date.parse(value?.expiresAt)

    if (
      typeof value?.token !== 'string' ||
      !value.token ||
      (!neverExpires &&
        (!Number.isFinite(expiresAt) || expiresAt <= currentTime))
    ) {
      storage?.removeItem?.(AGENT_CHAT_STORAGE_KEY)
      return null
    }

    const context = {}
    if (typeof value.deckId === 'string') {
      context.deckId = value.deckId
    }
    if (typeof value.deckName === 'string') {
      context.deckName = value.deckName
    }
    if (typeof value.deckUpdatedAt === 'string') {
      context.deckUpdatedAt = value.deckUpdatedAt
    }
    if (typeof value.hasConversation === 'boolean') {
      context.hasConversation = value.hasConversation
    }

    return {
      token: value.token,
      expiresAt: neverExpires ? null : new Date(expiresAt).toISOString(),
      messages: Array.isArray(value.messages)
        ? value.messages.filter(validMessage).slice(-MAX_MESSAGES)
        : [],
      ...context,
    }
  } catch {
    storage?.removeItem?.(AGENT_CHAT_STORAGE_KEY)
    return null
  }
}

export function saveAgentChat(storage, chat) {
  if (!chat?.token) {
    storage?.removeItem?.(AGENT_CHAT_STORAGE_KEY)
    return
  }

  storage?.setItem(
    AGENT_CHAT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      token: chat.token,
      expiresAt: chat.expiresAt,
      deckId: chat.deckId,
      deckName: chat.deckName,
      deckUpdatedAt: chat.deckUpdatedAt,
      hasConversation: chat.hasConversation,
      messages: (chat.messages ?? []).filter(validMessage).slice(-MAX_MESSAGES),
    }),
  )
}

export function clearAgentChat(storage) {
  storage?.removeItem?.(AGENT_CHAT_STORAGE_KEY)
}
