import { createHash, timingSafeEqual } from 'node:crypto'

import { normalizeIp } from './client-ip.mjs'

const DEFAULT_MAX_LEASES = 10000

function secretDigest(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest()
}

function secretsMatch(expectedDigest, candidate) {
  return timingSafeEqual(expectedDigest, secretDigest(candidate))
}

export function createAgentAccessLeaseStore({
  password,
  ttlMs,
  now = Date.now,
  maxLeases = DEFAULT_MAX_LEASES,
}) {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new RangeError('Agent access lease TTL must be a positive integer.')
  }

  const configuredPassword = String(password ?? '')
  const expectedDigest = secretDigest(configuredPassword)
  const leases = new Map()

  function sweep(currentTime) {
    for (const [clientIp, expiresAt] of leases) {
      if (expiresAt <= currentTime) {
        leases.delete(clientIp)
      }
    }
  }

  function read(clientIp) {
    const key = normalizeIp(clientIp)
    const expiresAt = leases.get(key)
    if (!expiresAt) {
      return null
    }
    if (expiresAt <= now()) {
      leases.delete(key)
      return null
    }
    return { expiresAt }
  }

  function authenticate(clientIp, candidate) {
    if (!configuredPassword) {
      return { status: 'unavailable' }
    }
    if (!secretsMatch(expectedDigest, candidate)) {
      return { status: 'invalid' }
    }

    const key = normalizeIp(clientIp)
    const currentTime = now()
    sweep(currentTime)
    if (!leases.has(key) && leases.size >= maxLeases) {
      return { status: 'capacity' }
    }

    const expiresAt = currentTime + ttlMs
    leases.set(key, expiresAt)
    return { status: 'granted', expiresAt }
  }

  return {
    authenticate,
    configured: Boolean(configuredPassword),
    read,
  }
}
