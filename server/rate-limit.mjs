import { getClientIp, normalizeIp } from './client-ip.mjs'

const DEFAULT_MAX_TRACKED_CLIENTS = 10000

function setRateLimitHeaders(response, { limit, remaining, resetSeconds }) {
  response.set('RateLimit-Limit', String(limit))
  response.set('RateLimit-Remaining', String(Math.max(0, remaining)))
  response.set('RateLimit-Reset', String(Math.max(1, resetSeconds)))
}

function sweepExpiredClients(clients, currentTime) {
  for (const [key, bucket] of clients) {
    if (bucket.resetAt <= currentTime) {
      clients.delete(key)
    }
  }
}

function rejectRequest(response, limit, resetSeconds, errorMessage) {
  setRateLimitHeaders(response, {
    limit,
    remaining: 0,
    resetSeconds,
  })
  response.set('Retry-After', String(resetSeconds))
  response.status(429).json({
    error: errorMessage,
  })
}

function getOrCreateBucket({
  clients,
  key,
  currentTime,
  windowMs,
  maxTrackedClients,
  response,
  requestLimit,
  errorMessage,
}) {
  const existing = clients.get(key)
  if (existing?.resetAt > currentTime) {
    return existing
  }
  if (!existing && clients.size >= maxTrackedClients) {
    rejectRequest(
      response,
      requestLimit,
      Math.max(1, Math.ceil(windowMs / 1000)),
      errorMessage,
    )
    return null
  }

  const bucket = {
    count: 0,
    resetAt: currentTime + windowMs,
  }
  clients.set(key, bucket)
  return bucket
}

export function createRateLimiter({
  windowMs,
  maxRequests,
  bypassIps = [],
  expandedIps = [],
  expandedMaxRequests = maxRequests,
  now = Date.now,
  maxTrackedClients = DEFAULT_MAX_TRACKED_CLIENTS,
  errorMessage = 'Too many AI deck requests. Please try again later.',
}) {
  const clients = new Map()
  const bypassClients = new Set(bypassIps.map(normalizeIp).filter(Boolean))
  const expandedClients = new Set(expandedIps.map(normalizeIp).filter(Boolean))
  let lastSweep = 0

  return (request, response, next) => {
    if (request.method !== 'POST') {
      next()
      return
    }

    const key = getClientIp(request)

    if (bypassClients.has(key)) {
      next()
      return
    }

    const requestLimit = expandedClients.has(key)
      ? expandedMaxRequests
      : maxRequests
    const currentTime = now()
    if (currentTime - lastSweep >= windowMs) {
      sweepExpiredClients(clients, currentTime)
      lastSweep = currentTime
    }

    const bucket = getOrCreateBucket({
      clients,
      key,
      currentTime,
      windowMs,
      maxTrackedClients,
      response,
      requestLimit,
      errorMessage,
    })
    if (!bucket) {
      return
    }

    const resetSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - currentTime) / 1000),
    )

    if (bucket.count >= requestLimit) {
      rejectRequest(response, requestLimit, resetSeconds, errorMessage)
      return
    }

    bucket.count += 1
    setRateLimitHeaders(response, {
      limit: requestLimit,
      remaining: requestLimit - bucket.count,
      resetSeconds,
    })
    next()
  }
}
