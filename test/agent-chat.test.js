import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_CHAT_STORAGE_KEY,
  agentChatDeckContext,
  clearAgentChat,
  createAgentGreeting,
  isAgentChatForDeck,
  loadAgentChat,
  saveAgentChat,
} from '../src/agent-chat.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

test('agent chat state persists while its session remains active', () => {
  const storage = memoryStorage()
  const state = {
    token: 'session-token',
    expiresAt: '2026-08-27T12:10:00.000Z',
    messages: [
      { id: 'one', role: 'user', text: 'Question' },
      { id: 'two', role: 'assistant', text: 'Answer' },
    ],
  }

  saveAgentChat(storage, state)

  assert.deepEqual(
    loadAgentChat(storage, Date.parse('2026-08-27T12:05:00.000Z')),
    state,
  )
})

test('expired and malformed chat state is discarded', () => {
  const expired = memoryStorage()
  saveAgentChat(expired, {
    token: 'expired',
    expiresAt: '2026-08-27T12:00:00.000Z',
    messages: [],
  })
  assert.equal(
    loadAgentChat(expired, Date.parse('2026-08-27T12:00:01.000Z')),
    null,
  )
  assert.equal(expired.getItem(AGENT_CHAT_STORAGE_KEY), null)

  const malformed = memoryStorage()
  malformed.setItem(AGENT_CHAT_STORAGE_KEY, '{bad-json')
  assert.equal(loadAgentChat(malformed), null)
})

test('agent greeting names the currently visible deck and state can be cleared', () => {
  const storage = memoryStorage()
  const greeting = createAgentGreeting('Blue Control')

  assert.match(greeting.text, /Blue Control/)
  saveAgentChat(storage, {
    token: 'token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    messages: [greeting],
  })
  clearAgentChat(storage)
  assert.equal(storage.getItem(AGENT_CHAT_STORAGE_KEY), null)
})

test('chat context is bound to the selected deck identity and version', () => {
  const record = {
    id: 'deck-one',
    name: 'Blue Control',
    updatedAt: '2026-08-27T12:00:00.000Z',
  }
  const chat = {
    token: 'token',
    ...agentChatDeckContext(record),
  }

  assert.equal(isAgentChatForDeck(chat, record), true)
  assert.equal(isAgentChatForDeck(chat, { ...record, id: 'deck-two' }), false)
  assert.equal(isAgentChatForDeck(chat, { ...record, name: 'Renamed' }), false)
  assert.equal(
    isAgentChatForDeck(chat, {
      ...record,
      updatedAt: '2026-08-27T12:01:00.000Z',
    }),
    false,
  )
  assert.equal(isAgentChatForDeck({ token: 'legacy' }, record), false)
})

test('chat storage preserves its bound deck context', () => {
  const storage = memoryStorage()
  const state = {
    token: 'session-token',
    expiresAt: '2026-08-27T12:10:00.000Z',
    deckId: 'deck-one',
    deckName: 'Blue Control',
    deckUpdatedAt: '2026-08-27T12:00:00.000Z',
    messages: [],
  }

  saveAgentChat(storage, state)
  assert.deepEqual(
    loadAgentChat(storage, Date.parse('2026-08-27T12:05:00.000Z')),
    state,
  )
})
