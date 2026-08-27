import assert from 'node:assert/strict'
import test from 'node:test'

import { loadServerConfig, publicFeatureConfig } from '../server/config.mjs'

test('agentic generation is disabled and unavailable by default', () => {
  const config = loadServerConfig({})

  assert.deepEqual(publicFeatureConfig(config), {
    agenticDeckGeneration: { enabled: false, available: false },
  })
  assert.equal(config.agenticDeckGeneration.apiKey, '')
})

test('agentic generation is visible but unavailable without an API key', () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
  })

  assert.equal(config.agenticDeckGeneration.enabled, true)
  assert.equal(config.agenticDeckGeneration.available, false)
})

test('model and reasoning configuration remain server-only', () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    SWU_OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'gpt-5.6-terra',
    OPENAI_REASONING_EFFORT: 'high',
  })

  assert.equal(config.agenticDeckGeneration.available, true)
  assert.equal(config.agenticDeckGeneration.reasoningEffort, 'high')
  assert.deepEqual(publicFeatureConfig(config), {
    agenticDeckGeneration: { enabled: true, available: true },
  })
})
