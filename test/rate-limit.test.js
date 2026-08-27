import assert from 'node:assert/strict'
import test from 'node:test'

import { createRateLimiter } from '../server/rate-limit.mjs'

function invoke(limiter, { ip = '203.0.113.1', method = 'POST' } = {}) {
  const headers = new Map()
  const result = {
    body: null,
    headers,
    nextCalled: false,
    statusCode: null,
  }
  const response = {
    set(name, value) {
      headers.set(name.toLowerCase(), String(value))
      return this
    },
    status(statusCode) {
      result.statusCode = statusCode
      return this
    },
    json(body) {
      result.body = body
      return this
    },
  }

  limiter({ method, ip }, response, () => {
    result.nextCalled = true
  })

  return result
}

test('non-POST requests bypass AI rate-limit buckets', () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 })
  const result = invoke(limiter, { method: 'GET' })

  assert.equal(result.nextCalled, true)
  assert.equal(result.headers.size, 0)
  assert.equal(result.statusCode, null)
})

test('a client receives a fresh quota after its window expires', () => {
  let currentTime = 1000
  const limiter = createRateLimiter({
    windowMs: 2000,
    maxRequests: 1,
    now: () => currentTime,
  })

  const first = invoke(limiter)
  const limited = invoke(limiter)
  currentTime = 3000
  const reset = invoke(limiter)

  assert.equal(first.nextCalled, true)
  assert.equal(first.headers.get('ratelimit-remaining'), '0')
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.headers.get('retry-after'), '2')
  assert.equal(reset.nextCalled, true)
  assert.equal(reset.headers.get('ratelimit-reset'), '2')
})

test('tracked-client capacity rejects new clients until expired buckets sweep', () => {
  let currentTime = 0
  const limiter = createRateLimiter({
    windowMs: 1000,
    maxRequests: 2,
    maxTrackedClients: 1,
    now: () => currentTime,
  })

  assert.equal(invoke(limiter, { ip: '203.0.113.1' }).nextCalled, true)

  const atCapacity = invoke(limiter, { ip: '203.0.113.2' })
  assert.equal(atCapacity.statusCode, 429)
  assert.equal(atCapacity.headers.get('ratelimit-limit'), '2')

  currentTime = 1000
  const afterSweep = invoke(limiter, { ip: '203.0.113.2' })
  assert.equal(afterSweep.nextCalled, true)
  assert.equal(afterSweep.headers.get('ratelimit-remaining'), '1')
})
