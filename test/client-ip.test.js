import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createIpAccessChecker,
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
