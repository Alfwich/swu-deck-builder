import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentAccessLeaseStore } from '../server/agent-access-lease-store.mjs'

test('a valid password grants a fixed lease bound to one normalized IP', () => {
  let currentTime = 1000
  const store = createAgentAccessLeaseStore({
    password: 'shared secret',
    ttlMs: 1800000,
    now: () => currentTime,
  })

  assert.equal(store.authenticate('203.0.113.1', 'wrong').status, 'invalid')
  assert.equal(store.read('203.0.113.1'), null)

  assert.deepEqual(
    store.authenticate('::ffff:203.0.113.1', 'shared secret'),
    { status: 'granted', expiresAt: 1801000 },
  )
  assert.deepEqual(store.read('203.0.113.1'), { expiresAt: 1801000 })
  assert.equal(store.read('203.0.113.2'), null)

  currentTime = 1801000
  assert.equal(store.read('203.0.113.1'), null)
})

test('reauthentication replaces the lease with a fresh full TTL', () => {
  let currentTime = 0
  const store = createAgentAccessLeaseStore({
    password: 'shared secret',
    ttlMs: 1800000,
    now: () => currentTime,
  })

  assert.equal(
    store.authenticate('203.0.113.1', 'shared secret').expiresAt,
    1800000,
  )
  currentTime = 900000
  assert.equal(
    store.authenticate('203.0.113.1', 'shared secret').expiresAt,
    2700000,
  )
})

test('an empty password disables lease authentication', () => {
  const store = createAgentAccessLeaseStore({ password: '', ttlMs: 1800000 })

  assert.equal(store.configured, false)
  assert.deepEqual(store.authenticate('203.0.113.1', ''), {
    status: 'unavailable',
  })
})

test('the lease store requires its TTL from server configuration', () => {
  assert.throws(
    () => createAgentAccessLeaseStore({ password: 'shared secret' }),
    /lease TTL must be a positive integer/i,
  )
})
