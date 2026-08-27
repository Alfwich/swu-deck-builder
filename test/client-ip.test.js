import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createIpAccessChecker,
  getClientIp,
  normalizeIp,
} from '../server/client-ip.mjs'

test('normalizes IPv4-mapped addresses for exact allowlist matching', () => {
  const canAccess = createIpAccessChecker(['203.0.113.40'])

  assert.equal(normalizeIp('::FFFF:203.0.113.40'), '203.0.113.40')
  assert.equal(canAccess({ ip: '::ffff:203.0.113.40' }), true)
  assert.equal(canAccess({ ip: '203.0.113.41' }), false)
})

test('matches exact IPv6 addresses case-insensitively', () => {
  const canAccess = createIpAccessChecker(['2001:DB8::40'])

  assert.equal(canAccess({ ip: '2001:db8::40' }), true)
  assert.equal(canAccess({ ip: '2001:db8::41' }), false)
})

test('normalizes surrounding whitespace, casing, and empty values', () => {
  assert.equal(normalizeIp('  2001:DB8::ABCD  '), '2001:db8::abcd')
  assert.equal(normalizeIp(null), '')
})

test('client IP prefers Express resolution and falls back to the socket', () => {
  assert.equal(
    getClientIp({
      ip: '::ffff:203.0.113.50',
      socket: { remoteAddress: '203.0.113.51' },
    }),
    '203.0.113.50',
  )
  assert.equal(
    getClientIp({ ip: '', socket: { remoteAddress: '2001:DB8::50' } }),
    '2001:db8::50',
  )
  assert.equal(getClientIp({}), 'unknown')
})

test('an empty IP allowlist denies every requester', () => {
  const canAccess = createIpAccessChecker(['', '   '])

  assert.equal(canAccess({ ip: '127.0.0.1' }), false)
  assert.equal(canAccess({ ip: '' }), false)
})
