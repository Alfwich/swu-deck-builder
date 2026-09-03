import { agentChatDeckContext, createAgentGreeting } from '../agent-chat.js'
import { createEmptyCardCollection } from '../card-collection.js'

export function createChatMessageId() {
  return globalThis.crypto?.randomUUID?.() ??
    `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function createRemoteAgentSession() {
  const response = await fetch('/api/agent/session', { method: 'POST' })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error ?? 'An AI deck session could not be created.')
  }

  return payload
}

export async function restoreRemoteAgentSession(token) {
  const response = await fetch('/api/agent/session', {
    headers: { 'X-SWU-Agent-Session': token },
  })

  if (response.status === 410) {
    return null
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error ?? 'The AI deck session could not be restored.')
  }

  return payload
}

export async function sendAgentChatRequest(
  session,
  prompt,
  currentDeck,
  deckId,
  deckLibrary = [],
  collection = createEmptyCardCollection(),
  collectionContext = null,
  imageToken = null,
) {
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SWU-Agent-Session': session.token,
    },
    body: JSON.stringify({
      prompt,
      deckId,
      format: 'premier',
      currentDeck,
      collection: {
        revision: collection.revision,
        cards: collection.cards,
      },
      ...(collectionContext ? { collectionContext } : {}),
      ...(deckLibrary.length > 0 ? { deckLibrary } : {}),
      ...(imageToken ? { imageToken } : {}),
    }),
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

export async function uploadAgentImage(file, sessionToken) {
  const response = await fetch('/api/agent/images', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-SWU-Agent-Session': sessionToken,
    },
    body: file,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error ?? 'The image could not be attached.')
  }
  if (typeof payload.token !== 'string' || !payload.token) {
    throw new Error('The image attachment response was invalid.')
  }

  return payload.token
}

export async function renewAgentChatSession(contextRecord, deckName, userMessage) {
  const session = await createRemoteAgentSession()
  const activeSession = {
    token: session.token,
    expiresAt: session.expiresAt,
    hasConversation: session.hasConversation ?? false,
    ...agentChatDeckContext(contextRecord),
    messages: [],
  }
  const conversationMessages = [
    { ...createAgentGreeting(deckName), id: createChatMessageId() },
    {
      id: createChatMessageId(),
      role: 'system',
      text: 'The previous session expired, so a new conversation was started.',
    },
    userMessage,
  ]
  return { activeSession, conversationMessages }
}

export function promptForAgentChat(input, imageAttachments) {
  const prompt = input.trim()
  if (prompt) return prompt
  return imageAttachments.length > 0
    ? 'Analyze the attached image in the context of this deck.'
    : ''
}

export function handleAgentImageInputChange(event, onImagesSelected) {
  const images = [...(event.currentTarget.files ?? [])]
  if (images.length > 0) onImagesSelected(images)
  event.currentTarget.value = ''
}

export function createAgentChatUserMessage(prompt, imageAttachment) {
  const message = {
    id: createChatMessageId(),
    role: 'user',
    text: prompt,
  }
  if (imageAttachment) message.attachmentName = imageAttachment.name
  return message
}

export async function sendAgentChatWithRenewal({
  activeSession,
  contextRecord,
  currentDeck,
  collection,
  collectionContext,
  deckLibrary,
  deckName,
  imageAttachment,
  onRenewed,
  prompt,
  userMessage,
}) {
  const send = async (session) => {
    const imageToken = imageAttachment
      ? await uploadAgentImage(imageAttachment.file, session.token)
      : null
    return sendAgentChatRequest(
      session,
      prompt,
      currentDeck,
      contextRecord.id,
      session.hasConversation ? [] : deckLibrary,
      collection,
      collectionContext,
      imageToken,
    )
  }

  let conversationMessages = [...activeSession.messages, userMessage]
  let result = await send(activeSession)
  if (result.response.status !== 410) {
    return { ...result, activeSession, conversationMessages }
  }

  const renewed = await renewAgentChatSession(
    contextRecord,
    deckName,
    userMessage,
  )
  activeSession = renewed.activeSession
  conversationMessages = renewed.conversationMessages
  onRenewed(activeSession, conversationMessages)
  result = await send(activeSession)
  return { ...result, activeSession, conversationMessages }
}

export function assertAgentChatResponse(response, payload) {
  if (response.ok) {
    return
  }
  const details = Array.isArray(payload.issues) ? ` ${payload.issues.join(' ')}` : ''
  throw new Error(
    `${payload.error ?? `AI deck chat failed with HTTP ${response.status}.`}${details}`,
  )
}
