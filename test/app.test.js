import assert from 'node:assert/strict'
import test from 'node:test'

import { createApp } from '../server/app.mjs'
import { loadServerConfig } from '../server/config.mjs'

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
    SWU_OPENAI_API_KEY: 'private-test-key',
    AGENT_ACCESS_ALLOWED_IPS: '203.0.113.1',
  })

  await withServer(config, async (url) => {
    const response = await fetch(`${url}/api/features`, {
      headers: { 'X-Forwarded-For': '203.0.113.1' },
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(body, {
      agenticDeckGeneration: {
        authorized: true,
        enabled: true,
        available: true,
      },
    })
    assert.equal(JSON.stringify(body).includes('private-test-key'), false)
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
        changes: { added: [], removed: [] },
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

test('AI endpoints share a proxy-aware per-IP request limit', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
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

test('AI rate limiting supports bypass and expanded-quota IPs', async () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
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
      agenticDeckGeneration: {
        authorized: false,
        enabled: false,
        available: false,
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
    SWU_OPENAI_API_KEY: 'private-test-key',
  })

  await withServer(config, async (url) => {
    const features = await fetch(`${url}/api/features`)

    assert.deepEqual(await features.json(), {
      agenticDeckGeneration: {
        authorized: true,
        enabled: true,
        available: true,
      },
    })
  })
})
