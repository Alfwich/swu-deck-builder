import type { ChangeEvent } from 'react'

import { agentChatDeckContext, createAgentGreeting } from './agent-chat.js'
import { createEmptyCardCollection } from '../player-database/card-collection.js'
import type {
  AgentChatResponsePayload,
  AgentChatState,
  AgentImageAttachment,
  AgentMessage,
  RemoteAgentSession,
} from '../types/assistant.js'
import type { CardCollection } from '../types/collection.js'
import type { DeckRecord } from '../types/deck.js'

type JsonObject = Record<string, unknown>

async function readJsonObject(response: Response): Promise<JsonObject> {
  const payload: unknown = await response.json().catch(() => ({}))
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as JsonObject
    : {}
}

function payloadError(payload: JsonObject, fallback: string) {
  return typeof payload.error === 'string' ? payload.error : fallback
}

export function createChatMessageId() {
  return globalThis.crypto?.randomUUID?.() ??
    `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function createRemoteAgentSession(): Promise<RemoteAgentSession> {
  const response = await fetch('/api/agent/session', { method: 'POST' })
  const payload = await readJsonObject(response)

  if (!response.ok) {
    throw new Error(payloadError(payload, 'An AI deck session could not be created.'))
  }

  return payload as unknown as RemoteAgentSession
}

export async function restoreRemoteAgentSession(
  token: string,
): Promise<RemoteAgentSession | null> {
  const response = await fetch('/api/agent/session', {
    headers: { 'X-SWU-Agent-Session': token },
  })

  if (response.status === 410) {
    return null
  }

  const payload = await readJsonObject(response)
  if (!response.ok) {
    throw new Error(payloadError(payload, 'The AI deck session could not be restored.'))
  }

  return payload as unknown as RemoteAgentSession
}

export async function sendAgentChatRequest(
  session: RemoteAgentSession,
  prompt: string,
  currentDeck: unknown,
  deckId: string,
  deckLibrary: unknown[] = [],
  collection: CardCollection = createEmptyCardCollection(),
  collectionContext: unknown = null,
  imageToken: string | null = null,
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
  const payload: unknown = await response.json().catch(() => ({}))
  return { response, payload }
}

export async function uploadAgentImage(file: File, sessionToken: string) {
  const response = await fetch('/api/agent/images', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-SWU-Agent-Session': sessionToken,
    },
    body: file,
  })
  const payload = await readJsonObject(response)

  if (!response.ok) {
    throw new Error(payloadError(payload, 'The image could not be attached.'))
  }
  if (typeof payload.token !== 'string' || !payload.token) {
    throw new Error('The image attachment response was invalid.')
  }

  return payload.token
}

export async function renewAgentChatSession(
  contextRecord: DeckRecord,
  deckName: string,
  userMessage: AgentMessage,
) {
  const session = await createRemoteAgentSession()
  const activeSession: AgentChatState = {
    token: session.token,
    expiresAt: session.expiresAt,
    hasConversation: session.hasConversation ?? false,
    ...agentChatDeckContext(contextRecord),
    messages: [],
  }
  const conversationMessages: AgentMessage[] = [
    {
      ...createAgentGreeting(deckName),
      id: createChatMessageId(),
      role: 'assistant',
    },
    {
      id: createChatMessageId(),
      role: 'system',
      text: 'The previous session expired, so a new conversation was started.',
    },
    userMessage,
  ]
  return { activeSession, conversationMessages }
}

export function promptForAgentChat(
  input: string,
  imageAttachments: AgentImageAttachment[],
) {
  const prompt = input.trim()
  if (prompt) return prompt
  return imageAttachments.length > 0
    ? 'Analyze the attached image in the context of this deck.'
    : ''
}

export function restoreAgentChatDraft(
  currentInput: string,
  submittedInput: string,
  failedPrompt: string,
) {
  return submittedInput.trim() && !currentInput.trim()
    ? failedPrompt
    : currentInput
}

export function handleAgentImageInputChange(
  event: ChangeEvent<HTMLInputElement>,
  onImagesSelected: (images: File[]) => void,
) {
  const images = [...(event.currentTarget.files ?? [])]
  if (images.length > 0) onImagesSelected(images)
  event.currentTarget.value = ''
}

export function createAgentChatUserMessage(
  prompt: string,
  imageAttachment: AgentImageAttachment | null,
): AgentMessage {
  const message: AgentMessage = {
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
}: {
  activeSession: AgentChatState
  contextRecord: DeckRecord
  currentDeck: unknown
  collection: CardCollection
  collectionContext: unknown
  deckLibrary: unknown[]
  deckName: string
  imageAttachment: AgentImageAttachment | null
  onRenewed: (session: AgentChatState, messages: AgentMessage[]) => void
  prompt: string
  userMessage: AgentMessage
}) {
  const send = async (session: AgentChatState) => {
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

export function assertAgentChatResponse(
  response: Response,
  payload: unknown,
): asserts payload is AgentChatResponsePayload {
  if (response.ok) {
    return
  }
  const objectPayload = payload && typeof payload === 'object'
    ? payload as JsonObject
    : {}
  const details = Array.isArray(objectPayload.issues)
    ? ` ${objectPayload.issues.join(' ')}`
    : ''
  throw new Error(
    `${payloadError(
      objectPayload,
      `AI deck chat failed with HTTP ${response.status}.`,
    )}${details}`,
  )
}
