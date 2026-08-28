import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentAccessLeaseStore } from '../server/agent-access-lease-store.mjs'

test('a valid password grants a fixed lease bound to one normalized IP', () => {
  let currentTime = 1000
  const store = createAgentAccessLeaseStore({
    password: 'shared secret',
    ttlMs: 600000,
    now: () => currentTime,
  })

  assert.equal(store.authenticate('203.0.113.1', 'wrong').status, 'invalid')
  assert.equal(store.read('203.0.113.1'), null)

  assert.deepEqual(
    store.authenticate('::ffff:203.0.113.1', 'shared secret'),
    { status: 'granted', expiresAt: 601000 },
  )
  assert.deepEqual(store.read('203.0.113.1'), { expiresAt: 601000 })
  assert.equal(store.read('203.0.113.2'), null)

  currentTime = 601000
  assert.equal(store.read('203.0.113.1'), null)
})

test('reauthentication replaces the lease with a fresh full TTL', () => {
  let currentTime = 0
  const store = createAgentAccessLeaseStore({
    password: 'shared secret',
    ttlMs: 600000,
    now: () => currentTime,
  })

  assert.equal(store.authenticate('203.0.113.1', 'shared secret').expiresAt, 600000)
  currentTime = 300000
  assert.equal(store.authenticate('203.0.113.1', 'shared secret').expiresAt, 900000)
})

test('an empty password disables lease authentication', () => {
  const store = createAgentAccessLeaseStore({ password: '' })

  assert.equal(store.configured, false)
  assert.deepEqual(store.authenticate('203.0.113.1', ''), {
    status: 'unavailable',
  })
})
