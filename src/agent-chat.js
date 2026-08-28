export const AGENT_CHAT_STORAGE_KEY = 'swu-deck-builder.agent-chat.v1'

const MAX_MESSAGES = 50

function validMessage(message) {
  return (
    message &&
    typeof message.id === 'string' &&
    ['assistant', 'user', 'system'].includes(message.role) &&
    typeof message.text === 'string'
  )
}

export function createAgentGreeting(deckName) {
  return {
    id: `greeting-${Date.now()}`,
    role: 'assistant',
    text: `What would you like to build, change, or know about ${deckName || 'this deck'}?`,
  }
}

export function loadAgentChat(storage, currentTime = Date.now()) {
  try {
    const raw = storage?.getItem(AGENT_CHAT_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const value = JSON.parse(raw)
    const expiresAt = Date.parse(value?.expiresAt)

    if (
      typeof value?.token !== 'string' ||
      !value.token ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= currentTime
    ) {
      storage?.removeItem?.(AGENT_CHAT_STORAGE_KEY)
      return null
    }

    return {
      token: value.token,
      expiresAt: new Date(expiresAt).toISOString(),
      messages: Array.isArray(value.messages)
        ? value.messages.filter(validMessage).slice(-MAX_MESSAGES)
        : [],
    }
  } catch {
    storage?.removeItem?.(AGENT_CHAT_STORAGE_KEY)
    return null
  }
}

export function saveAgentChat(storage, chat) {
  if (!chat?.token || !chat?.expiresAt) {
    storage?.removeItem?.(AGENT_CHAT_STORAGE_KEY)
    return
  }

  storage?.setItem(
    AGENT_CHAT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      token: chat.token,
      expiresAt: chat.expiresAt,
      messages: (chat.messages ?? []).filter(validMessage).slice(-MAX_MESSAGES),
    }),
  )
}

export function clearAgentChat(storage) {
  storage?.removeItem?.(AGENT_CHAT_STORAGE_KEY)
}
