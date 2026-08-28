import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentSessionStore } from '../server/agent-session-store.mjs'

test('agent sessions use sliding expiration and preserve response context', () => {
  let currentTime = 1000
  let tokenNumber = 0
  const store = createAgentSessionStore({
    ttlMs: 600000,
    now: () => currentTime,
    createToken: () => `token-${++tokenNumber}`,
  })
  const created = store.create('127.0.0.1')

  assert.equal(created.token, 'token-1')
  assert.equal(created.expiresAt, 601000)
  assert.equal(store.acquire(created.token, '127.0.0.1').status, 'acquired')
  assert.equal(store.acquire(created.token, '127.0.0.1').status, 'busy')

  currentTime = 2000
  store.complete(created.token, 'resp-1', 'deck-one')
  const continued = store.read(created.token, '127.0.0.1', { touch: false })

  assert.equal(continued.previousResponseId, 'resp-1')
  assert.equal(continued.deckContextId, 'deck-one')
  assert.equal(continued.expiresAt, 602000)
})

test('agent sessions expire, reject other IPs, and enforce capacity', () => {
  let currentTime = 0
  let tokenNumber = 0
  const store = createAgentSessionStore({
    ttlMs: 10,
    maxSessions: 1,
    now: () => currentTime,
    createToken: () => `token-${++tokenNumber}`,
  })
  const created = store.create('203.0.113.1')

  assert.equal(store.read(created.token, '203.0.113.2'), null)
  assert.throws(() => store.create('203.0.113.1'), /Too many agent sessions/)

  currentTime = 11
  assert.equal(store.read(created.token, '203.0.113.1'), null)
  assert.equal(store.create('203.0.113.1').token, 'token-2')
})

test('agent sessions can be released after a failed request and removed', () => {
  const store = createAgentSessionStore({ createToken: () => 'token' })
  store.create('127.0.0.1')

  assert.equal(store.acquire('token', '127.0.0.1').status, 'acquired')
  store.release('token')
  assert.equal(store.acquire('token', '127.0.0.1').status, 'acquired')
  store.release('token')
  assert.equal(store.remove('token', '127.0.0.1'), true)
  assert.equal(store.size(), 0)
})

test('agent sessions can be configured without expiration', () => {
  let currentTime = 0
  const store = createAgentSessionStore({
    ttlMs: null,
    now: () => currentTime,
    createToken: () => 'persistent-token',
  })
  const created = store.create('127.0.0.1')

  assert.equal(created.expiresAt, null)
  currentTime = Number.MAX_SAFE_INTEGER
  assert.equal(store.read(created.token, '127.0.0.1').expiresAt, null)
  assert.equal(store.acquire(created.token, '127.0.0.1').status, 'acquired')
  store.complete(created.token, 'response-id')
  assert.equal(
    store.read(created.token, '127.0.0.1', { touch: false }).expiresAt,
    null,
  )
})
