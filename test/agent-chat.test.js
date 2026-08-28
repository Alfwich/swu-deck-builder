import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_CHAT_STORAGE_KEY,
  AGENT_REPOSITORY_URL,
  clearAgentChat,
  createRecentAgentDeckLibrary,
  createAgentGreeting,
  getAgentAccessNotice,
  loadAgentChat,
  parseAgentCardReferences,
  saveAgentChat,
} from '../src/agent-chat.js'

test('agent sessions seed only the five most recently updated decks', () => {
  const records = Array.from({ length: 7 }, (_, index) => ({
    id: `deck-${index + 1}`,
    name: `Deck ${index + 1}`,
    updatedAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    deck: {
      leader: null,
      secondLeader: null,
      base: null,
      drawDeck: [],
      sideboard: [],
    },
  }))

  const snapshots = createRecentAgentDeckLibrary(records)

  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.deckId),
    ['deck-7', 'deck-6', 'deck-5', 'deck-4', 'deck-3'],
  )
  assert.equal(snapshots[0].deck.metadata.name, 'Deck 7')
})

test('agent access notice directs unavailable users to the repository', () => {
  assert.equal(
    getAgentAccessNotice({ resolved: false, available: false }).title,
    'Checking AI access',
  )
  assert.equal(
    getAgentAccessNotice({ resolved: true, available: true }),
    null,
  )

  const unavailable = getAgentAccessNotice({
    resolved: true,
    available: false,
  })
  assert.match(unavailable.text, /installed Codex or Claude CLI/)
  assert.match(unavailable.text, /desktop app from GitHub/)
  assert.match(unavailable.text, /clone the repository/)
  assert.doesNotMatch(unavailable.text, /Hosted AI access/)
  assert.equal(unavailable.featureTitle, 'What you can do')
  assert.ok(unavailable.features.some((feature) => /card-by-card changes/.test(feature)))
  assert.ok(unavailable.features.some((feature) => /optional web research/.test(feature)))
  assert.equal(unavailable.link, AGENT_REPOSITORY_URL)
  assert.equal(unavailable.linkLabel, 'Get the desktop app on GitHub →')

  const desktopUnavailable = getAgentAccessNotice({
    resolved: true,
    available: false,
    desktopSettingsAvailable: true,
  })
  assert.equal(desktopUnavailable.title, 'Enable the deck assistant')
  assert.match(desktopUnavailable.text, /Desktop settings/)
  assert.equal(desktopUnavailable.action, 'open-desktop-settings')
  assert.equal(desktopUnavailable.link, undefined)

  assert.deepEqual(
    getAgentAccessNotice({
      resolved: true,
      available: false,
      authenticationAvailable: true,
    }),
    unavailable,
  )
})

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
    hasConversation: true,
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

test('non-expiring agent chat state persists without an expiration date', () => {
  const storage = memoryStorage()
  const state = {
    token: 'persistent-session-token',
    expiresAt: null,
    messages: [{ id: 'one', role: 'user', text: 'Question' }],
  }

  saveAgentChat(storage, state)

  assert.deepEqual(loadAgentChat(storage, Number.MAX_SAFE_INTEGER), state)
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

test('agent greeting presents current-deck and new-deck capabilities', () => {
  const storage = memoryStorage()
  const greeting = createAgentGreeting('Blue Control')

  assert.equal(greeting.text, 'I can help you:')
  assert.ok(greeting.features.some((feature) => /Blue Control/.test(feature)))
  assert.ok(greeting.features.some((feature) => /Build a new deck/.test(feature)))
  assert.ok(greeting.features.some((feature) => /Answer questions/.test(feature)))
  assert.equal(greeting.followup, 'What would you like to do?')
  saveAgentChat(storage, {
    token: 'token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    messages: [greeting],
  })
  clearAgentChat(storage)
  assert.equal(storage.getItem(AGENT_CHAT_STORAGE_KEY), null)
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

test('recognized card IDs become card references while unknown IDs remain text', () => {
  const card = { name: 'A Fine Addition', url: 'https://example.test/card.png' }
  const cardsById = new Map([['TWI_040', card]])

  assert.deepEqual(
    parseAgentCardReferences(
      'Add TWI_040, but leave UNKNOWN_999 alone.',
      cardsById,
    ),
    [
      { type: 'text', text: 'Add ' },
      { type: 'card', id: 'TWI_040', card },
      { type: 'text', text: ', but leave UNKNOWN_999 alone.' },
    ],
  )
})
