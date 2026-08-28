import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { loadServerConfig, publicFeatureConfig } from '../server/config.mjs'

test('agentic generation is disabled and unavailable by default', () => {
  const config = loadServerConfig({})

  assert.deepEqual(publicFeatureConfig(config), {
    agenticDeckGeneration: {
      authorized: false,
      enabled: false,
      available: false,
    },
  })
  assert.equal(config.agenticDeckGeneration.apiKey, '')
  assert.equal(config.distPath, path.resolve('dist'))
  assert.equal(
    config.agenticDeckGeneration.fileCachePath,
    path.resolve('data/agent/openai-file-cache.json'),
  )
  assert.equal(
    config.agenticDeckGeneration.agentCatalogPath,
    path.resolve('data/agent/catalog.txt'),
  )
  assert.equal(config.agenticDeckGeneration.catalogFileFormat, '')
  assert.equal(config.agenticDeckGeneration.rateLimitWindowMs, 900000)
  assert.equal(config.agenticDeckGeneration.rateLimitMaxRequests, 5)
  assert.equal(config.agenticDeckGeneration.sessionTtlMs, 600000)
  assert.equal(config.agenticDeckGeneration.maxSessions, 100)
  assert.deepEqual(config.agenticDeckGeneration.accessAllowedIps, [
    '127.0.0.1',
    '::1',
  ])
  assert.deepEqual(config.agenticDeckGeneration.rateLimitBypassIps, [])
  assert.deepEqual(config.agenticDeckGeneration.rateLimitExpandedIps, [])
  assert.equal(config.agenticDeckGeneration.rateLimitExpandedMaxRequests, 30)
})

test('production paths can be configured independently of the working directory', () => {
  const config = loadServerConfig({
    APP_DIST_PATH: '/opt/swu-deck-builder/current/dist',
    SWU_CATALOG_PATH: '/opt/swu-deck-builder/current/data/catalog.json',
    SWU_AGENT_CATALOG_PATH:
      '/opt/swu-deck-builder/current/data/agent/catalog.csv',
    SWU_OPENAI_FILE_CACHE_PATH:
      '/var/lib/swu-deck-builder/openai-file-cache.json',
  })

  assert.equal(config.distPath, path.resolve('/opt/swu-deck-builder/current/dist'))
  assert.equal(
    config.agenticDeckGeneration.catalogPath,
    path.resolve('/opt/swu-deck-builder/current/data/catalog.json'),
  )
  assert.equal(
    config.agenticDeckGeneration.agentCatalogPath,
    path.resolve('/opt/swu-deck-builder/current/data/agent/catalog.txt'),
  )
  assert.equal(
    config.agenticDeckGeneration.fileCachePath,
    path.resolve('/var/lib/swu-deck-builder/openai-file-cache.json'),
  )
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
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'gpt-5.6-terra',
    OPENAI_REASONING_EFFORT: 'high',
  })

  assert.equal(config.agenticDeckGeneration.available, true)
  assert.equal(config.agenticDeckGeneration.reasoningEffort, 'high')
  assert.deepEqual(publicFeatureConfig(config, true), {
    agenticDeckGeneration: {
      authorized: true,
      enabled: true,
      available: true,
    },
  })
})

test('AI rate-limit settings are configurable but remain server-only', () => {
  const config = loadServerConfig({
    AGENT_RATE_LIMIT_WINDOW_MS: '60000',
    AGENT_RATE_LIMIT_MAX_REQUESTS: '2',
    AGENT_ACCESS_ALLOWED_IPS: '203.0.113.1, 2001:db8::1',
    AGENT_RATE_LIMIT_BYPASS_IPS: '203.0.113.1, 2001:db8::1',
    AGENT_RATE_LIMIT_EXPANDED_IPS: '203.0.113.2 2001:db8::2',
    AGENT_RATE_LIMIT_EXPANDED_MAX_REQUESTS: '20',
  })

  assert.equal(config.agenticDeckGeneration.rateLimitWindowMs, 60000)
  assert.equal(config.agenticDeckGeneration.rateLimitMaxRequests, 2)
  assert.deepEqual(config.agenticDeckGeneration.accessAllowedIps, [
    '203.0.113.1',
    '2001:db8::1',
  ])
  assert.deepEqual(config.agenticDeckGeneration.rateLimitBypassIps, [
    '203.0.113.1',
    '2001:db8::1',
  ])
  assert.deepEqual(config.agenticDeckGeneration.rateLimitExpandedIps, [
    '203.0.113.2',
    '2001:db8::2',
  ])
  assert.equal(config.agenticDeckGeneration.rateLimitExpandedMaxRequests, 20)
  assert.deepEqual(publicFeatureConfig(config), {
    agenticDeckGeneration: {
      authorized: false,
      enabled: false,
      available: false,
    },
  })
})

test('invalid reasoning effort is rejected during startup', () => {
  assert.throws(
    () => loadServerConfig({ OPENAI_REASONING_EFFORT: 'extreme' }),
    /Unsupported OPENAI_REASONING_EFFORT: extreme/,
  )
})

test('invalid positive integer settings fall back to safe defaults', () => {
  const config = loadServerConfig({
    APP_SERVER_PORT: '0',
    OPENAI_MAX_OUTPUT_TOKENS: '-1',
    OPENAI_REQUEST_TIMEOUT_MS: 'not-a-number',
    AGENT_RATE_LIMIT_WINDOW_MS: '1.5',
    AGENT_RATE_LIMIT_MAX_REQUESTS: '',
    AGENT_RATE_LIMIT_EXPANDED_MAX_REQUESTS: '0',
    AGENT_SESSION_TTL_MS: '0',
    AGENT_MAX_SESSIONS: 'not-a-number',
  })

  assert.equal(config.port, 8787)
  assert.equal(config.agenticDeckGeneration.maxOutputTokens, 4000)
  assert.equal(config.agenticDeckGeneration.requestTimeoutMs, 120000)
  assert.equal(config.agenticDeckGeneration.rateLimitWindowMs, 900000)
  assert.equal(config.agenticDeckGeneration.rateLimitMaxRequests, 5)
  assert.equal(config.agenticDeckGeneration.rateLimitExpandedMaxRequests, 30)
  assert.equal(config.agenticDeckGeneration.sessionTtlMs, 600000)
  assert.equal(config.agenticDeckGeneration.maxSessions, 100)
})

test('boolean aliases and trimmed OpenAI settings are normalized', () => {
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'YES',
    AGENTIC_DECK_PROVIDER: 'openai-api',
    SWU_OPENAI_API_KEY: '  test-key  ',
    OPENAI_STORE_RESPONSES: '1',
    OPENAI_CATALOG_FILE_ID: '  file-catalog  ',
    OPENAI_CATALOG_FILE_FORMAT: '  plain-text-csv-v1  ',
    AGENT_ACCESS_ALLOWED_IPS: '',
  })

  assert.equal(config.agenticDeckGeneration.enabled, true)
  assert.equal(config.agenticDeckGeneration.available, true)
  assert.equal(config.agenticDeckGeneration.apiKey, 'test-key')
  assert.equal(config.agenticDeckGeneration.storeResponses, true)
  assert.equal(config.agenticDeckGeneration.catalogFileId, 'file-catalog')
  assert.equal(
    config.agenticDeckGeneration.catalogFileFormat,
    'plain-text-csv-v1',
  )
  assert.deepEqual(config.agenticDeckGeneration.accessAllowedIps, [])
})
