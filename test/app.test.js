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
  })

  await withServer(config, async (url) => {
    const response = await fetch(`${url}/api/features`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      agenticDeckGeneration: { enabled: true, available: true },
    })
    assert.equal(JSON.stringify(body).includes('private-test-key'), false)
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
