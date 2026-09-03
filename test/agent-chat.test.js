import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_CHAT_STORAGE_KEY,
  AGENT_CHAT_SIZE_STORAGE_KEY,
  AGENT_CHAT_COMPACT_HEIGHT,
  AGENT_CHAT_RIGHT_CLEARANCE,
  AGENT_CHAT_TOP_BAR_CLEARANCE,
  AGENT_PROMPT_HISTORY_STORAGE_KEY,
  AGENT_REPOSITORY_URL,
  addAgentPromptHistoryEntry,
  advanceAgentProposalBatchCollectionRevision,
  canNavigateAgentPromptHistory,
  clampAgentChatHeight,
  clampAgentChatWidth,
  clearAgentChat,
  createAgentCardReferenceMarkdownPlugin,
  createAgentCollectionContext,
  createAgentDeckLibrary,
  createAgentGreeting,
  dismissAgentProposalChange,
  getCompactAgentChatHeight,
  getAgentChatScrollKey,
  getAgentChatSizeAfterResize,
  getAgentAccessNotice,
  getAgentChatHeightBounds,
  getAgentChatWidthBounds,
  hasSavedAgentChatSize,
  loadAgentChat,
  loadAgentChatSize,
  loadAgentPromptHistory,
  navigateAgentPromptHistory,
  parseAgentCardReferences,
  saveAgentChat,
  saveAgentChatSize,
  saveAgentPromptHistory,
} from '../src/agent-chat.js'

test('proposal updates preserve the chat scroll activity key', () => {
  const messages = [
    { id: 'message-1', role: 'assistant', proposal: { status: 'pending' } },
  ]
  const updatedMessages = [
    { id: 'message-1', role: 'assistant', proposal: { status: 'applied' } },
  ]

  assert.equal(
    getAgentChatScrollKey(messages, 'idle'),
    getAgentChatScrollKey(updatedMessages, 'idle'),
  )
  assert.notEqual(
    getAgentChatScrollKey(messages, 'idle'),
    getAgentChatScrollKey(
      [...messages, { id: 'message-2', role: 'assistant' }],
      'idle',
    ),
  )
})

test('individual proposal changes can be dismissed without applying neighbors', () => {
  const proposal = {
    status: 'pending',
    changes: [
      { id: 'keep-pending', status: 'pending' },
      { id: 'dismiss-this', status: 'pending' },
      { id: 'already-applied', status: 'applied' },
    ],
  }
  const updated = dismissAgentProposalChange(proposal, 'dismiss-this')

  assert.deepEqual(
    updated.changes.map((change) => change.status),
    ['pending', 'dismissed', 'applied'],
  )
  assert.equal(updated.status, 'pending')
  assert.equal(proposal.changes[1].status, 'pending')
  assert.equal(
    dismissAgentProposalChange(updated, 'keep-pending').status,
    'partial',
  )
  assert.equal(
    dismissAgentProposalChange(
      {
        status: 'pending',
        changes: [{ id: 'only-change', status: 'pending' }],
      },
      'only-change',
    ).status,
    'dismissed',
  )
})

test('agent chat height stays usable and inside the viewport', () => {
  assert.deepEqual(
    getAgentChatHeightBounds({ panelBottom: 900, viewportHeight: 1000 }),
    { minHeight: 320, maxHeight: 884 },
  )
  assert.equal(
    clampAgentChatHeight({
      height: 1200,
      panelBottom: 900,
      viewportHeight: 1000,
    }),
    884,
  )
  assert.equal(
    clampAgentChatHeight({
      height: 100,
      panelBottom: 900,
      viewportHeight: 1000,
    }),
    320,
  )
  assert.deepEqual(
    getAgentChatHeightBounds({ panelBottom: 250, viewportHeight: 300 }),
    { minHeight: 234, maxHeight: 234 },
  )
})

test('agent chat height leaves five pixels below the top bar', () => {
  assert.equal(AGENT_CHAT_TOP_BAR_CLEARANCE, 5)
  assert.deepEqual(
    getAgentChatHeightBounds({
      panelBottom: 900,
      viewportHeight: 1000,
      topBoundary: 48 + AGENT_CHAT_TOP_BAR_CLEARANCE,
    }),
    { minHeight: 320, maxHeight: 847 },
  )
  assert.equal(
    clampAgentChatHeight({
      height: 1200,
      panelBottom: 900,
      viewportHeight: 1000,
      topBoundary: 48 + AGENT_CHAT_TOP_BAR_CLEARANCE,
    }),
    847,
  )
})

test('agent chat width remains usable with twenty pixels of right clearance', () => {
  assert.equal(AGENT_CHAT_RIGHT_CLEARANCE, 20)
  assert.deepEqual(
    getAgentChatWidthBounds({ panelLeft: 32, viewportWidth: 1200 }),
    { minWidth: 320, maxWidth: 1148 },
  )
  assert.equal(
    clampAgentChatWidth({
      width: 2000,
      panelLeft: 32,
      viewportWidth: 1200,
    }),
    1148,
  )
  assert.equal(
    clampAgentChatWidth({
      width: 100,
      panelLeft: 32,
      viewportWidth: 1200,
    }),
    320,
  )
  assert.deepEqual(
    getAgentChatWidthBounds({ panelLeft: 20, viewportWidth: 300 }),
    { minWidth: 260, maxWidth: 260 },
  )
})

test('compact agent chat uses its preset while respecting short viewports', () => {
  assert.equal(AGENT_CHAT_COMPACT_HEIGHT, 480)
  assert.equal(
    getCompactAgentChatHeight({ panelBottom: 900, viewportHeight: 1000 }),
    480,
  )
  assert.equal(
    getCompactAgentChatHeight({ panelBottom: 420, viewportHeight: 500 }),
    404,
  )
})

test('manual resizing preserves the selected assistant size mode', () => {
  assert.equal(getAgentChatSizeAfterResize('small'), 'small')
  assert.equal(getAgentChatSizeAfterResize('large'), 'large')
  assert.equal(getAgentChatSizeAfterResize('unsupported'), 'large')
})

test('agent sessions seed every loaded deck in recent-update order', () => {
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

  const snapshots = createAgentDeckLibrary(records)

  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.deckId),
    ['deck-7', 'deck-6', 'deck-5', 'deck-4', 'deck-3', 'deck-2', 'deck-1'],
  )
  assert.equal(snapshots[0].deck.metadata.name, 'Deck 7')
})

test('agent collection context reports additions relative to each deck', () => {
  const collection = {
    historyId: 'history-1',
    revision: 2,
    cards: [{ cardId: 'TST_001', count: 2 }],
    events: [
      {
        revision: 2,
        changedAt: '2026-09-01T10:00:00.000Z',
        source: 'manual',
        deltas: [{ cardId: 'TST_001', delta: 2 }],
      },
    ],
  }
  const reviewed = {
    id: 'reviewed',
    collectionCheckpoint: { historyId: 'history-1', revision: 2 },
  }
  const stale = {
    id: 'stale',
    collectionCheckpoint: { historyId: 'history-1', revision: 1 },
  }

  const context = createAgentCollectionContext(
    [reviewed, stale],
    stale,
    collection,
  )

  assert.deepEqual(context.recentEvents, [
    {
      revision: 2,
      changedAt: '2026-09-01T10:00:00.000Z',
      source: 'manual',
      additions: [{ cardId: 'TST_001', count: 2 }],
      removals: [],
    },
  ])
  assert.deepEqual(context.currentDeck.additions, [
    {
      cardId: 'TST_001',
      count: 2,
      firstAddedAt: '2026-09-01T10:00:00.000Z',
      lastAddedAt: '2026-09-01T10:00:00.000Z',
    },
  ])
  assert.deepEqual(context.decks[0].additions, [])
  assert.equal(context.decks[1].deckId, 'stale')
})

test('recent collection revisions preserve additions hidden by a net-zero deck comparison', () => {
  const collection = {
    historyId: 'history-1',
    revision: 266,
    cards: [
      { cardId: 'TST_001', count: 1 },
      { cardId: 'TST_002', count: 1 },
    ],
    events: [
      {
        revision: 264,
        changedAt: '2026-09-01T10:00:00.000Z',
        source: 'assistant',
        deltas: [{ cardId: 'TST_001', delta: -1 }],
      },
      {
        revision: 265,
        changedAt: '2026-09-01T10:01:00.000Z',
        source: 'assistant',
        deltas: [{ cardId: 'TST_002', delta: -1 }],
      },
      {
        revision: 266,
        changedAt: '2026-09-01T10:02:00.000Z',
        source: 'assistant',
        deltas: [
          { cardId: 'TST_001', delta: 1 },
          { cardId: 'TST_002', delta: 1 },
        ],
      },
    ],
  }
  const deck = {
    id: 'deck-one',
    collectionCheckpoint: { historyId: 'history-1', revision: 263 },
  }

  const context = createAgentCollectionContext([deck], deck, collection)

  assert.deepEqual(context.currentDeck.additions, [])
  assert.deepEqual(context.currentDeck.removals, [])
  assert.deepEqual(context.recentEvents.at(-1).additions, [
    { cardId: 'TST_001', count: 1 },
    { cardId: 'TST_002', count: 1 },
  ])
})

test('applying one collection proposal advances untouched proposals from the same image batch', () => {
  const pendingProposal = (batchId, targetCollectionRevision) => ({
    batchId,
    status: 'pending',
    targetCollectionRevision,
    changes: [
      { id: `${batchId}-change`, zone: 'collection', status: 'pending' },
    ],
  })
  const messages = [
    { id: 'first', proposal: pendingProposal('image-batch', 4) },
    { id: 'second', proposal: pendingProposal('image-batch', 4) },
    { id: 'other-batch', proposal: pendingProposal('other-batch', 4) },
    { id: 'already-stale', proposal: pendingProposal('image-batch', 3) },
  ]

  const advanced = advanceAgentProposalBatchCollectionRevision(messages, {
    batchId: 'image-batch',
    fromRevision: 4,
    toRevision: 5,
  })

  assert.equal(advanced[0].proposal.targetCollectionRevision, 5)
  assert.equal(advanced[1].proposal.targetCollectionRevision, 5)
  assert.equal(advanced[2].proposal.targetCollectionRevision, 4)
  assert.equal(advanced[3].proposal.targetCollectionRevision, 3)
  assert.equal(messages[0].proposal.targetCollectionRevision, 4)
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

test('agent chat size persists while preserving platform defaults', () => {
  const storage = memoryStorage()

  assert.equal(hasSavedAgentChatSize(storage), false)
  assert.equal(loadAgentChatSize(storage), 'large')
  assert.equal(loadAgentChatSize(storage, 'small'), 'small')

  saveAgentChatSize(storage, 'small')
  assert.equal(hasSavedAgentChatSize(storage), true)
  assert.equal(loadAgentChatSize(storage), 'small')

  saveAgentChatSize(storage, 'large')
  assert.equal(loadAgentChatSize(storage, 'small'), 'large')

  storage.setItem(AGENT_CHAT_SIZE_STORAGE_KEY, 'oversized')
  assert.equal(loadAgentChatSize(storage), 'large')
  assert.equal(storage.getItem(AGENT_CHAT_SIZE_STORAGE_KEY), null)
})

test('agent prompt history persists only the 30 latest valid prompts', () => {
  const storage = memoryStorage()
  const prompts = Array.from({ length: 32 }, (_, index) => ` Prompt ${index + 1} `)

  saveAgentPromptHistory(storage, [...prompts, null, '   '])

  const loaded = loadAgentPromptHistory(storage)
  assert.equal(loaded.length, 30)
  assert.equal(loaded[0], 'Prompt 3')
  assert.equal(loaded.at(-1), 'Prompt 32')
  assert.deepEqual(addAgentPromptHistoryEntry(loaded, 'Newest'), [
    ...loaded.slice(1),
    'Newest',
  ])

  storage.setItem(AGENT_PROMPT_HISTORY_STORAGE_KEY, '{bad-json')
  assert.deepEqual(loadAgentPromptHistory(storage), [])
  assert.equal(storage.getItem(AGENT_PROMPT_HISTORY_STORAGE_KEY), null)
})

test('agent prompt history navigation restores the current draft', () => {
  const history = ['First', 'Second', 'Third']
  const latest = navigateAgentPromptHistory({
    direction: 'up',
    history,
    input: 'Unsaved draft',
  })
  assert.deepEqual(latest, {
    draft: 'Unsaved draft',
    index: 2,
    input: 'Third',
  })

  const previous = navigateAgentPromptHistory({
    direction: 'up',
    history,
    ...latest,
  })
  assert.equal(previous.index, 1)
  assert.equal(previous.input, 'Second')

  const next = navigateAgentPromptHistory({
    direction: 'down',
    history,
    ...previous,
  })
  assert.equal(next.index, 2)
  assert.equal(next.input, 'Third')
  assert.deepEqual(
    navigateAgentPromptHistory({
      direction: 'down',
      history,
      ...next,
    }),
    { draft: 'Unsaved draft', index: null, input: 'Unsaved draft' },
  )
  assert.equal(
    navigateAgentPromptHistory({ direction: 'down', history, input: '' }),
    null,
  )
})

test('agent prompt history keys preserve multiline cursor navigation', () => {
  const event = {
    key: 'ArrowUp',
    selectionStart: 7,
    selectionEnd: 7,
    value: 'First\nSecond',
  }
  assert.equal(canNavigateAgentPromptHistory(event), false)
  assert.equal(
    canNavigateAgentPromptHistory({
      ...event,
      selectionStart: 3,
      selectionEnd: 3,
    }),
    true,
  )
  assert.equal(
    canNavigateAgentPromptHistory({
      ...event,
      key: 'ArrowDown',
      selectionStart: 3,
      selectionEnd: 3,
    }),
    false,
  )
  assert.equal(
    canNavigateAgentPromptHistory({
      ...event,
      key: 'ArrowDown',
      selectionStart: 9,
      selectionEnd: 9,
    }),
    true,
  )
})

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

test('agent greeting presents deck and collection capabilities', () => {
  const storage = memoryStorage()
  const greeting = createAgentGreeting('Blue Control')

  assert.equal(greeting.text, 'I can help you:')
  assert.ok(greeting.features.some((feature) => /Blue Control/.test(feature)))
  assert.ok(greeting.features.some((feature) => /Build a new deck/.test(feature)))
  assert.ok(greeting.features.some((feature) => /cards from your collection/.test(feature)))
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
  const paddedCard = {
    name: 'Wipe Them Out',
    url: 'https://example.test/padded-card.png',
  }
  const cardsById = new Map([
    ['TWI_040', card],
    ['ASH_137', paddedCard],
  ])

  assert.deepEqual(
    parseAgentCardReferences(
      'Add TWI_040 and ASH_0137, but leave UNKNOWN_999 alone.',
      cardsById,
    ),
    [
      { type: 'text', text: 'Add ' },
      { type: 'card', id: 'TWI_040', card },
      { type: 'text', text: ' and ' },
      { type: 'card', id: 'ASH_137', card: paddedCard },
      { type: 'text', text: ', but leave UNKNOWN_999 alone.' },
    ],
  )
})

test('markdown card references preserve emphasis and literal code', () => {
  const cardsById = new Map([
    ['ASH_137', { name: 'Wipe Them Out' }],
  ])
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'strong',
            children: [{ type: 'text', value: 'ASH_0137' }],
          },
          { type: 'text', value: ' or ' },
          { type: 'inlineCode', value: 'ASH_0137' },
        ],
      },
    ],
  }

  createAgentCardReferenceMarkdownPlugin(cardsById)()(tree)

  assert.deepEqual(tree.children[0].children, [
    {
      type: 'strong',
      children: [
        {
          type: 'text',
          value: 'ASH_137',
          data: {
            hName: 'swu-card',
            hProperties: { cardId: 'ASH_137' },
          },
        },
      ],
    },
    { type: 'text', value: ' or ' },
    { type: 'inlineCode', value: 'ASH_0137' },
  ])
})
