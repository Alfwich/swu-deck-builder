import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createAgentSessionStore } from '../server/agent-session-store.mjs'
import { createAgentAccessLeaseStore } from '../server/agent-access-lease-store.mjs'
import { createApp } from '../server/app.mjs'
import { loadServerConfig } from '../server/config.mjs'
import { createDesktopImageStore } from '../server/desktop-image-store.mjs'

async function withServer(config, callback, dependencies = {}) {
  const server = createApp(config, dependencies).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const { port } = server.address()
    await callback(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
}

test('feature endpoint does not expose server secrets', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_ACCESS_ALLOWED_IPS: '203.0.113.1',
    AGENT_ACCESS_PASSWORD: 'private-access-password',
  })

  await withServer(config, async (url) => {
    const response = await fetch(`${url}/api/features`, {
      headers: { 'X-Forwarded-For': '203.0.113.1' },
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(body, {
      deckPersistence: { mode: 'browser' },
      agenticDeckGeneration: {
        authorized: true,
        enabled: true,
        available: true,
        authenticationAvailable: false,
        leaseExpiresAt: null,
      },
    })
    assert.equal(JSON.stringify(body).includes('private-test-key'), false)
    assert.equal(JSON.stringify(body).includes('private-access-password'), false)
  })
})

test('health endpoint is available without exposing configuration', async () => {
  await withServer(loadServerConfig({}), async (url) => {
    const response = await fetch(`${url}/healthz`)

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { status: 'ok' })
  })
})

test('desktop mode requires its per-launch cookie for every request', async () => {
  const config = loadServerConfig({})
  config.desktop = {
    accessToken: 'desktop-test-token',
    settingsAvailable: true,
  }
  let savedSettings = null
  let restartRequested = false
  const settingsPayload = {
    settings: {
      provider: 'auto',
      executablePath: '',
      model: '',
      reasoningEffort: '',
      webSearchEnabled: false,
    },
    effective: {
      available: false,
      enabled: false,
      executablePath: '',
      provider: '',
      unavailableReason: '',
    },
  }

  await withServer(config, async (url) => {
    const denied = await fetch(`${url}/healthz`)
    assert.equal(denied.status, 401)

    const invalidBootstrap = await fetch(
      `${url}/desktop/bootstrap?token=incorrect`,
    )
    assert.equal(invalidBootstrap.status, 401)

    const bootstrap = await fetch(
      `${url}/desktop/bootstrap?token=desktop-test-token`,
      { redirect: 'manual' },
    )
    assert.equal(bootstrap.status, 302)
    assert.equal(bootstrap.headers.get('location'), '/')
    const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0]
    assert.equal(cookie, 'swu-desktop-access=desktop-test-token')

    const allowed = await fetch(`${url}/healthz`, {
      headers: { Cookie: cookie },
    })
    assert.equal(allowed.status, 200)
    assert.match(
      allowed.headers.get('content-security-policy'),
      /frame-ancestors 'none'/,
    )

    const features = await fetch(`${url}/api/features`, {
      headers: { Cookie: cookie },
    })
    assert.deepEqual((await features.json()).desktop, {
      imageAttachmentsAvailable: false,
      settingsAvailable: true,
    })

    const loadedSettings = await fetch(`${url}/api/desktop/settings`, {
      headers: { Cookie: cookie },
    })
    assert.deepEqual(await loadedSettings.json(), settingsPayload)

    const saved = await fetch(`${url}/api/desktop/settings`, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settingsPayload.settings),
    })
    assert.equal(saved.status, 202)
    assert.deepEqual(await saved.json(), { restartRequired: true })
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(savedSettings, settingsPayload.settings)
    assert.equal(restartRequested, true)
  }, {
    desktopSettingsStore: {
      read: () => settingsPayload,
      write(settings) {
        savedSettings = settings
      },
    },
    restartDesktopApp() {
      restartRequested = true
    },
  })
})

test('desktop Codex chat stages and removes verified image attachments', async (t) => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
  })
  config.agenticDeckGeneration.provider = 'codex-cli'
  config.desktop = {
    accessToken: 'desktop-image-access-token',
    imageAttachmentsAvailable: true,
    settingsAvailable: true,
  }
  const imageDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'swu-desktop-images-'),
  )
  const imageStore = createDesktopImageStore(imageDirectory, {
    createToken: () => 'desktop-image-token-1234',
  })
  t.after(async () => {
    await imageStore.close()
    await rm(imageDirectory, { recursive: true, force: true })
  })
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  ])
  let receivedImagePath = null
  const generator = {
    async chat(_prompt, _deck, _previousResponseId, _deckLibrary, options) {
      receivedImagePath = options.imagePath
      assert.deepEqual(await readFile(receivedImagePath), png)
      return {
        operation: 'answer',
        message: 'I inspected the image.',
        deck: null,
        changes: [],
        responseId: 'desktop-image-response',
        usage: null,
      }
    },
  }

  await withServer(config, async (url) => {
    const bootstrap = await fetch(
      `${url}/desktop/bootstrap?token=desktop-image-access-token`,
      { redirect: 'manual' },
    )
    const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0]
    const desktopHeaders = { Cookie: cookie }

    const features = await fetch(`${url}/api/features`, {
      headers: desktopHeaders,
    })
    assert.equal(
      (await features.json()).desktop.imageAttachmentsAvailable,
      true,
    )

    const spoofed = await fetch(`${url}/api/desktop/agent/images`, {
      method: 'POST',
      headers: { ...desktopHeaders, 'Content-Type': 'image/jpeg' },
      body: png,
    })
    assert.equal(spoofed.status, 415)

    const uploaded = await fetch(`${url}/api/desktop/agent/images`, {
      method: 'POST',
      headers: {
        ...desktopHeaders,
        'Content-Type': 'image/png; charset=binary',
      },
      body: png,
    })
    assert.equal(uploaded.status, 201)
    const attachment = await uploaded.json()
    assert.equal(attachment.token, 'desktop-image-token-1234')

    const created = await fetch(`${url}/api/agent/session`, {
      method: 'POST',
      headers: desktopHeaders,
    })
    const session = await created.json()
    const chat = await fetch(`${url}/api/agent/chat`, {
      method: 'POST',
      headers: {
        ...desktopHeaders,
        'Content-Type': 'application/json',
        'X-SWU-Agent-Session': session.token,
      },
      body: JSON.stringify({
        prompt: 'What is shown here?',
        deckId: 'desktop-deck',
        currentDeck: {
          metadata: { name: 'Desktop deck' },
          leader: null,
          secondleader: null,
          base: null,
          deck: [],
          sideboard: [],
        },
        imageToken: attachment.token,
      }),
    })

    assert.equal(chat.status, 200)
    assert.equal((await chat.json()).message, 'I inspected the image.')
    assert.equal(imageStore.get(attachment.token), null)
    await assert.rejects(access(receivedImagePath), { code: 'ENOENT' })
  }, { desktopImageStore: imageStore, generator })
})

test('local deck database endpoints are dev-only and revision-aware', async () => {
  const disabledConfig = loadServerConfig({
    NODE_ENV: 'production',
    LOCAL_DECK_DATABASE_PATH: 'data/local/production.sqlite',
  })
  await withServer(disabledConfig, async (url) => {
    const response = await fetch(`${url}/api/local/deck-library`)
    assert.equal(response.status, 404)
  })

  let snapshot = {
    initialized: false,
    revision: 0,
    updatedAt: null,
    decks: [],
  }
  const localDeckStore = {
    read() {
      return snapshot
    },
    replace(expectedRevision, decks) {
      if (expectedRevision !== snapshot.revision) {
        return { status: 'conflict', snapshot }
      }
      snapshot = {
        initialized: true,
        revision: snapshot.revision + 1,
        updatedAt: '2026-08-28T12:00:00.000Z',
        decks,
      }
      return { status: 'saved', snapshot }
    },
  }
  const config = loadServerConfig({
    LOCAL_DECK_DATABASE_PATH: 'data/local/test.sqlite',
  })
  const record = {
    id: 'deck-one',
    name: 'Deck one',
    kind: 'saved',
    deck: {
      leader: null,
      secondLeader: null,
      base: null,
      drawDeck: [],
      sideboard: [],
    },
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:00:00.000Z',
  }

  await withServer(config, async (url) => {
    const features = await fetch(`${url}/api/features`)
    assert.equal((await features.json()).deckPersistence.mode, 'database')

    const initial = await fetch(`${url}/api/local/deck-library`)
    assert.deepEqual(await initial.json(), snapshot)

    const saved = await fetch(`${url}/api/local/deck-library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, decks: [record] }),
    })
    assert.equal(saved.status, 200)
    assert.equal((await saved.json()).revision, 1)

    const conflict = await fetch(`${url}/api/local/deck-library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, decks: [] }),
    })
    assert.equal(conflict.status, 409)
    assert.equal((await conflict.json()).code, 'revision_conflict')
  }, { localDeckStore })
})

test('a password grants one public IP a ten-minute AI access lease', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_ACCESS_ALLOWED_IPS: '',
    AGENT_ACCESS_PASSWORD: 'shared secret',
    AGENT_ACCESS_LEASE_TTL_MS: '600000',
  })
  let currentTime = 1000
  const accessLeaseStore = createAgentAccessLeaseStore({
    password: config.agenticDeckGeneration.accessPassword,
    ttlMs: config.agenticDeckGeneration.accessLeaseTtlMs,
    now: () => currentTime,
  })
  const generator = {
    async generate() {
      return { name: 'Leased deck' }
    },
  }

  await withServer(config, async (url) => {
    const clientHeaders = { 'X-Forwarded-For': '203.0.113.80' }
    const initial = await fetch(`${url}/api/features`, {
      headers: clientHeaders,
    })
    assert.deepEqual(await initial.json(), {
      deckPersistence: { mode: 'browser' },
      agenticDeckGeneration: {
        authorized: false,
        enabled: false,
        available: false,
        authenticationAvailable: true,
        leaseExpiresAt: null,
      },
    })

    const wrong = await fetch(`${url}/api/agent/access`, {
      method: 'POST',
      headers: { ...clientHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    })
    assert.equal(wrong.status, 401)

    const granted = await fetch(`${url}/api/agent/access`, {
      method: 'POST',
      headers: { ...clientHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'shared secret' }),
    })
    assert.equal(granted.status, 201)
    assert.deepEqual(await granted.json(), {
      deckPersistence: { mode: 'browser' },
      agenticDeckGeneration: {
        authorized: true,
        enabled: true,
        available: true,
        authenticationAvailable: false,
        leaseExpiresAt: new Date(601000).toISOString(),
      },
    })

    const leased = await fetch(`${url}/api/agent/decks`, {
      method: 'POST',
      headers: { ...clientHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Build a deck.' }),
    })
    assert.equal(leased.status, 200)

    const otherClient = await fetch(`${url}/api/agent/decks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.81',
      },
      body: JSON.stringify({ prompt: 'Build a deck.' }),
    })
    assert.equal(otherClient.status, 403)

    currentTime = 601000
    const expired = await fetch(`${url}/api/features`, {
      headers: clientHeaders,
    })
    assert.equal((await expired.json()).agenticDeckGeneration.authorized, false)
  }, { accessLeaseStore, generator })
})

test('disabled agent endpoint returns not found without calling OpenAI', async () => {
  await withServer(loadServerConfig({}), async (url) => {
    const response = await fetch(`${url}/api/agent/decks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Build a deck.' }),
    })

    assert.equal(response.status, 404)
  })
})

test('transformation endpoint forwards the current deck to the AI service', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_ACCESS_ALLOWED_IPS: '127.0.0.1',
  })
  const currentDeck = {
    metadata: { name: 'Current deck' },
    leader: { id: 'TST_001', count: 1 },
    secondleader: null,
    base: { id: 'TST_002', count: 1 },
    deck: [],
    sideboard: [],
  }
  let received
  const generator = {
    async transform(prompt, deck) {
      received = { prompt, deck }
      return {
        name: 'Transformed deck',
        summary: 'Changed the deck.',
        deck: { leader: {}, base: {}, drawDeck: [], sideboard: [] },
        changes: [],
      }
    },
  }

  await withServer(config, async (url) => {
    const response = await fetch(`${url}/api/agent/decks/transform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Lower the cost curve.',
        format: 'premier',
        currentDeck,
      }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.name, 'Transformed deck')
    assert.deepEqual(received, {
      prompt: 'Lower the cost curve.',
      deck: currentDeck,
    })
  }, { generator })
})

test('agent chat sessions continue response context and expire', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_ACCESS_ALLOWED_IPS: '127.0.0.1',
    AGENT_RATE_LIMIT_MAX_REQUESTS: '5',
    AGENT_SESSION_TTL_MS: '1000',
  })
  let currentTime = 0
  const sessionStore = createAgentSessionStore({
    ttlMs: 1000,
    now: () => currentTime,
    createToken: () => 'session-token',
  })
  const received = []
  const generator = {
    async chat(prompt, deck, previousResponseId, deckLibrary, options) {
      received.push({
        prompt,
        deck,
        previousResponseId,
        deckLibrary,
        collection: options.collection,
      })
      return {
        operation: 'answer',
        message: 'This is a test answer.',
        deck: null,
        changes: [],
        responseId: `response-${received.length}`,
        usage: null,
      }
    },
  }
  const currentDeck = {
    metadata: { name: 'Current deck' },
    leader: { id: 'TST_001', count: 1 },
    secondleader: null,
    base: { id: 'TST_002', count: 1 },
    deck: [],
    sideboard: [],
  }

  await withServer(config, async (url) => {
    const created = await fetch(`${url}/api/agent/session`, { method: 'POST' })
    const session = await created.json()

    assert.equal(created.status, 201)
    assert.equal(session.token, 'session-token')
    assert.equal(session.hasConversation, false)

    const send = (
      prompt,
      deckId = 'deck-one',
      deckLibrary = [],
      collection = undefined,
    ) =>
      fetch(`${url}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SWU-Agent-Session': session.token,
        },
        body: JSON.stringify({
          prompt,
          deckId,
          currentDeck,
          deckLibrary,
          ...(collection ? { collection } : {}),
          format: 'premier',
        }),
      })

    const initialDeckLibrary = [
      { deckId: 'deck-one', deck: structuredClone(currentDeck) },
      {
        deckId: 'deck-two',
        deck: {
          ...structuredClone(currentDeck),
          metadata: { name: 'Other deck' },
        },
      },
    ]
    const initialCollection = {
      revision: 2,
      cards: [{ cardId: 'TST_003', count: 3 }],
    }
    const first = await send(
      'First question.',
      'deck-one',
      initialDeckLibrary,
      initialCollection,
    )
    assert.equal(first.status, 200)
    assert.equal((await first.json()).session.hasConversation, true)
    currentDeck.metadata.name = 'Renamed deck'
    assert.equal((await send('Follow-up question.')).status, 200)
    assert.equal(received[0].previousResponseId, null)
    assert.deepEqual(received[0].deckLibrary, initialDeckLibrary)
    assert.deepEqual(received[0].collection, initialCollection)
    assert.equal(received[1].previousResponseId, 'response-1')
    assert.deepEqual(received[1].deckLibrary, [])
    assert.deepEqual(received[1].deck, currentDeck)

    assert.equal((await send('Question about another deck.', 'deck-two')).status, 200)
    assert.equal(received[2].previousResponseId, 'response-2')
    assert.match(received[2].prompt, /selected a different deck/i)
    assert.match(received[2].prompt, /retain earlier deck snapshots/i)
    assert.match(received[2].prompt, /newly supplied visible deck as authoritative/i)

    assert.equal((await send('Follow up on that deck.', 'deck-two')).status, 200)
    assert.equal(received[3].previousResponseId, 'response-3')
    assert.equal(received[3].prompt, 'Follow up on that deck.')

    const oversizedLibrary = Array.from({ length: 6 }, (_, index) => ({
      deckId: `extra-${index}`,
      deck: structuredClone(currentDeck),
    }))
    const oversized = await send(
      'Load too many decks.',
      'deck-two',
      oversizedLibrary,
    )
    assert.equal(oversized.status, 400)
    assert.match((await oversized.json()).error, /no more than 5 decks/i)

    const invalidCollection = await send(
      'Invalid collection.',
      'deck-two',
      [],
      { revision: 1, cards: [{ cardId: 'TST_003', count: 0 }] },
    )
    assert.equal(invalidCollection.status, 400)
    assert.match((await invalidCollection.json()).error, /invalid quantity/i)

    currentTime = 1001
    const expired = await send('Too late.')
    assert.equal(expired.status, 410)
    assert.equal((await expired.json()).code, 'session_expired')
  }, { generator, sessionStore })
})

test('AI endpoints share a proxy-aware per-IP request limit', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_RATE_LIMIT_WINDOW_MS: '60000',
    AGENT_RATE_LIMIT_MAX_REQUESTS: '2',
    AGENT_ACCESS_ALLOWED_IPS: '203.0.113.10,203.0.113.11',
  })
  const generator = {
    async generate() {
      return { name: 'Rate-limited deck' }
    },
  }

  await withServer(config, async (url) => {
    const request = (clientIp) =>
      fetch(`${url}/api/agent/decks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': clientIp,
        },
        body: JSON.stringify({ prompt: 'Build a deck.' }),
      })

    const first = await request('203.0.113.10')
    const second = await request('203.0.113.10')
    const limited = await request('203.0.113.10')
    const otherClient = await request('203.0.113.11')

    assert.equal(first.status, 200)
    assert.equal(first.headers.get('ratelimit-limit'), '2')
    assert.equal(first.headers.get('ratelimit-remaining'), '1')
    assert.equal(second.status, 200)
    assert.equal(second.headers.get('ratelimit-remaining'), '0')
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('retry-after'), '60')
    assert.deepEqual(await limited.json(), {
      error: 'Too many AI deck requests. Please try again later.',
    })
    assert.equal(otherClient.status, 200)
  }, { generator })
})

test('local loopback AI requests bypass rate limiting', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_RATE_LIMIT_WINDOW_MS: '60000',
    AGENT_RATE_LIMIT_MAX_REQUESTS: '1',
  })
  const generator = {
    async generate() {
      return { name: 'Local deck' }
    },
  }

  await withServer(config, async (url) => {
    const request = () =>
      fetch(`${url}/api/agent/decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Build a deck.' }),
      })

    const first = await request()
    const second = await request()

    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(first.headers.get('ratelimit-limit'), null)
    assert.equal(second.headers.get('ratelimit-limit'), null)
  }, { generator })
})

test('AI rate limiting supports bypass and expanded-quota IPs', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_RATE_LIMIT_WINDOW_MS: '60000',
    AGENT_RATE_LIMIT_MAX_REQUESTS: '1',
    AGENT_ACCESS_ALLOWED_IPS:
      '203.0.113.20,203.0.113.21,203.0.113.22',
    AGENT_RATE_LIMIT_BYPASS_IPS: '203.0.113.20',
    AGENT_RATE_LIMIT_EXPANDED_IPS: '203.0.113.21',
    AGENT_RATE_LIMIT_EXPANDED_MAX_REQUESTS: '2',
  })
  const generator = {
    async generate() {
      return { name: 'Allowed deck' }
    },
  }

  await withServer(config, async (url) => {
    const request = (clientIp) =>
      fetch(`${url}/api/agent/decks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': clientIp,
        },
        body: JSON.stringify({ prompt: 'Build a deck.' }),
      })

    assert.equal((await request('203.0.113.20')).status, 200)
    assert.equal((await request('203.0.113.20')).status, 200)

    const expandedFirst = await request('203.0.113.21')
    const expandedSecond = await request('203.0.113.21')
    const expandedLimited = await request('203.0.113.21')
    assert.equal(expandedFirst.status, 200)
    assert.equal(expandedFirst.headers.get('ratelimit-limit'), '2')
    assert.equal(expandedSecond.status, 200)
    assert.equal(expandedLimited.status, 429)

    assert.equal((await request('203.0.113.22')).status, 200)
    assert.equal((await request('203.0.113.22')).status, 429)
  }, { generator })
})

test('AI feature discovery and endpoints deny clients outside the allowlist', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_ACCESS_ALLOWED_IPS: '203.0.113.30',
  })
  let calls = 0
  const generator = {
    async generate() {
      calls += 1
      return { name: 'Should not be generated' }
    },
  }

  await withServer(config, async (url) => {
    const features = await fetch(`${url}/api/features`, {
      headers: { 'X-Forwarded-For': '203.0.113.31' },
    })
    assert.deepEqual(await features.json(), {
      deckPersistence: { mode: 'browser' },
      agenticDeckGeneration: {
        authorized: false,
        enabled: false,
        available: false,
        authenticationAvailable: false,
        leaseExpiresAt: null,
      },
    })

    const denied = await fetch(`${url}/api/agent/decks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.31',
      },
      body: JSON.stringify({ prompt: 'Build a deck.' }),
    })

    assert.equal(denied.status, 403)
    assert.deepEqual(await denied.json(), {
      error: 'AI deck tools are not available from this IP address.',
    })
    assert.equal(calls, 0)
  }, { generator })
})

test('AI access fails closed when the allowlist is empty', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_ACCESS_ALLOWED_IPS: '',
  })

  await withServer(config, async (url) => {
    const features = await fetch(`${url}/api/features`)
    const denied = await fetch(`${url}/api/agent/decks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Build a deck.' }),
    })

    assert.equal((await features.json()).agenticDeckGeneration.authorized, false)
    assert.equal(denied.status, 403)
  }, { generator: { async generate() {} } })
})

test('AI access allows local loopback when the allowlist is not configured', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'private-test-key',
  })

  await withServer(config, async (url) => {
    const features = await fetch(`${url}/api/features`)

    assert.deepEqual(await features.json(), {
      deckPersistence: { mode: 'browser' },
      agenticDeckGeneration: {
        authorized: true,
        enabled: true,
        available: true,
        authenticationAvailable: false,
        leaseExpiresAt: null,
      },
    })
  })
})
