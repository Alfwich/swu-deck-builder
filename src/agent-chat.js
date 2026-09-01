import { serializeAgentDeckContext } from './integrations/swudb.js'
import {
  getCollectionChangesSince,
  getRecentCollectionEvents,
} from './card-collection.js'

export const AGENT_CHAT_STORAGE_KEY = 'swu-deck-builder.agent-chat.v1'
export const AGENT_CHAT_SIZE_STORAGE_KEY =
  'swu-deck-builder.agent-chat-size.v1'
export const AGENT_PROMPT_HISTORY_STORAGE_KEY =
  'swu-deck-builder.agent-prompt-history.v1'
export const AGENT_REPOSITORY_URL =
  'https://github.com/Alfwich/swu-deck-builder'
export const AGENT_CHAT_MIN_HEIGHT = 320
export const AGENT_CHAT_COMPACT_HEIGHT = 480
export const AGENT_CHAT_TOP_MARGIN = 16
export const AGENT_CHAT_TOP_BAR_CLEARANCE = 5
export const AGENT_CHAT_RESIZE_STEP = 32

const MAX_MESSAGES = 50
export const MAX_AGENT_PROMPT_HISTORY = 30
const MAX_AGENT_PROMPT_LENGTH = 4000
const MAX_AGENT_DECK_LIBRARY_SIZE = 250
const CARD_REFERENCE_PATTERN = /\b[A-Z][A-Z0-9]{1,7}_\d{1,4}\b/g

export function getAgentChatScrollKey(messages, status) {
  const messageList = Array.isArray(messages) ? messages : []
  const lastMessageId = messageList.at(-1)?.id ?? ''
  return `${messageList.length}:${lastMessageId}:${status ?? ''}`
}

export function dismissAgentProposalChange(proposal, changeId) {
  if (!proposal || !Array.isArray(proposal.changes)) return proposal

  let dismissed = false
  const changes = proposal.changes.map((change) => {
    if (change.id !== changeId || change.status !== 'pending') return change
    dismissed = true
    return { ...change, status: 'dismissed' }
  })
  if (!dismissed) return proposal

  const hasPendingChange = changes.some(
    (change) => change.status === 'pending',
  )
  const hasAppliedChange = changes.some(
    (change) => change.status === 'applied',
  )

  return {
    ...proposal,
    changes,
    status: hasPendingChange
      ? 'pending'
      : hasAppliedChange
        ? 'partial'
        : 'dismissed',
  }
}

export function getAgentChatHeightBounds({
  panelBottom,
  viewportHeight,
  minimumHeight = AGENT_CHAT_MIN_HEIGHT,
  topBoundary = AGENT_CHAT_TOP_MARGIN,
}) {
  const safeViewportHeight = Number.isFinite(viewportHeight)
    ? Math.max(0, viewportHeight)
    : 0
  const safePanelBottom = Number.isFinite(panelBottom)
    ? Math.max(0, Math.min(panelBottom, safeViewportHeight))
    : safeViewportHeight
  const safeTopBoundary = Number.isFinite(topBoundary)
    ? Math.max(0, Math.min(topBoundary, safeViewportHeight))
    : AGENT_CHAT_TOP_MARGIN
  const maxHeight = Math.max(
    0,
    Math.floor(safePanelBottom - safeTopBoundary),
  )

  return {
    minHeight: Math.min(Math.max(0, minimumHeight), maxHeight),
    maxHeight,
  }
}

export function clampAgentChatHeight({ height, ...boundsInput }) {
  const { minHeight, maxHeight } = getAgentChatHeightBounds(boundsInput)
  const nextHeight = Number.isFinite(height) ? height : minHeight
  return Math.round(Math.min(maxHeight, Math.max(minHeight, nextHeight)))
}

export function getCompactAgentChatHeight(boundsInput) {
  return clampAgentChatHeight({
    ...boundsInput,
    height: AGENT_CHAT_COMPACT_HEIGHT,
  })
}

function validAgentChatSize(value) {
  return ['small', 'large'].includes(value) ? value : null
}

export function hasSavedAgentChatSize(storage) {
  try {
    const stored = storage?.getItem(AGENT_CHAT_SIZE_STORAGE_KEY)
    if (validAgentChatSize(stored)) return true
    if (stored !== null && stored !== undefined) {
      storage?.removeItem?.(AGENT_CHAT_SIZE_STORAGE_KEY)
    }
  } catch {
    return false
  }

  return false
}

export function loadAgentChatSize(storage, defaultSize = 'large') {
  const fallback = validAgentChatSize(defaultSize) ?? 'large'

  try {
    const stored = storage?.getItem(AGENT_CHAT_SIZE_STORAGE_KEY)
    const size = validAgentChatSize(stored)
    if (size) return size
    if (stored !== null && stored !== undefined) {
      storage?.removeItem?.(AGENT_CHAT_SIZE_STORAGE_KEY)
    }
  } catch {
    return fallback
  }

  return fallback
}

export function saveAgentChatSize(storage, size) {
  const normalized = validAgentChatSize(size)
  if (!normalized) return

  try {
    storage?.setItem(AGENT_CHAT_SIZE_STORAGE_KEY, normalized)
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function getAgentChatSizeAfterResize(size) {
  return validAgentChatSize(size) ?? 'large'
}

function updatedTime(record) {
  const timestamp = Date.parse(record?.updatedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function createAgentDeckLibrary(records) {
  return [...(records ?? [])]
    .map((record, index) => ({ record, index }))
    .sort(
      (left, right) =>
        updatedTime(right.record) - updatedTime(left.record) ||
        right.index - left.index,
    )
    .slice(0, MAX_AGENT_DECK_LIBRARY_SIZE)
    .map(({ record }) => ({
      deckId: record.id,
      deck: serializeAgentDeckContext(record.deck, { name: record.name }),
    }))
}

export function createAgentCollectionContext(
  records,
  selectedRecord,
  collection,
) {
  const changesFor = (record) =>
    getCollectionChangesSince(collection, record?.collectionCheckpoint)

  return {
    recentEvents: getRecentCollectionEvents(collection),
    currentDeck: changesFor(selectedRecord),
    decks: (records ?? []).slice(0, MAX_AGENT_DECK_LIBRARY_SIZE).map(
      (record) => ({
        deckId: record.id,
        ...changesFor(record),
      }),
    ),
  }
}

export function advanceAgentProposalBatchCollectionRevision(
  messages,
  { batchId, fromRevision, toRevision },
) {
  if (
    !batchId ||
    !Number.isInteger(fromRevision) ||
    !Number.isInteger(toRevision) ||
    fromRevision === toRevision
  ) {
    return messages
  }

  return messages.map((message) => {
    const proposal = message.proposal
    const hasPendingCollectionChange = proposal?.changes?.some(
      (change) =>
        change.zone === 'collection' && change.status === 'pending',
    )

    if (
      proposal?.status !== 'pending' ||
      proposal.batchId !== batchId ||
      proposal.targetCollectionRevision !== fromRevision ||
      !hasPendingCollectionChange
    ) {
      return message
    }

    return {
      ...message,
      proposal: {
        ...proposal,
        targetCollectionRevision: toRevision,
      },
    }
  })
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
    title: 'Use the deck assistant locally',
    text: 'Get the desktop app from GitHub to connect the Deck Assistant to an installed Codex or Claude CLI. Developers can also clone the repository and run it locally.',
    featureTitle: 'What you can do',
    features: [
      'Build complete decks around your preferred leader or strategy.',
      'Ask about strategy, matchups, legality, and the visible deck.',
      'Review validated card-by-card changes before applying them.',
      'Use optional web research for current policy and metagame context.',
    ],
    link: AGENT_REPOSITORY_URL,
    linkLabel: 'Get the desktop app on GitHub →',
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

export function normalizeAgentPromptHistory(value) {
  if (!Array.isArray(value)) return []

  return value
    .map((prompt) =>
      typeof prompt === 'string'
        ? prompt.trim().slice(0, MAX_AGENT_PROMPT_LENGTH)
        : '',
    )
    .filter(Boolean)
    .slice(-MAX_AGENT_PROMPT_HISTORY)
}

export function addAgentPromptHistoryEntry(history, prompt) {
  return normalizeAgentPromptHistory([...(history ?? []), prompt])
}

export function loadAgentPromptHistory(storage) {
  try {
    const raw = storage?.getItem(AGENT_PROMPT_HISTORY_STORAGE_KEY)
    return raw ? normalizeAgentPromptHistory(JSON.parse(raw)) : []
  } catch {
    storage?.removeItem?.(AGENT_PROMPT_HISTORY_STORAGE_KEY)
    return []
  }
}

export function saveAgentPromptHistory(storage, history) {
  storage?.setItem(
    AGENT_PROMPT_HISTORY_STORAGE_KEY,
    JSON.stringify(normalizeAgentPromptHistory(history)),
  )
}

export function canNavigateAgentPromptHistory({
  altKey = false,
  ctrlKey = false,
  key,
  metaKey = false,
  selectionEnd,
  selectionStart,
  shiftKey = false,
  value = '',
}) {
  if (
    !['ArrowUp', 'ArrowDown'].includes(key) ||
    altKey ||
    ctrlKey ||
    metaKey ||
    shiftKey ||
    selectionStart !== selectionEnd
  ) {
    return false
  }

  return key === 'ArrowUp'
    ? !value.slice(0, selectionStart).includes('\n')
    : !value.slice(selectionEnd).includes('\n')
}

export function navigateAgentPromptHistory({
  direction,
  draft = '',
  history,
  index = null,
  input = '',
}) {
  const prompts = normalizeAgentPromptHistory(history)
  if (prompts.length === 0) return null

  if (direction === 'up') {
    const nextIndex = index === null
      ? prompts.length - 1
      : Math.max(0, index - 1)
    return {
      draft: index === null ? input : draft,
      index: nextIndex,
      input: prompts[nextIndex],
    }
  }

  if (direction !== 'down' || index === null) return null
  if (index < prompts.length - 1) {
    const nextIndex = index + 1
    return { draft, index: nextIndex, input: prompts[nextIndex] }
  }

  return { draft, index: null, input: draft }
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
      'Add or remove cards from your collection when you explicitly ask',
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
