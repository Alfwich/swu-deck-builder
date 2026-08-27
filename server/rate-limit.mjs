import { getClientIp, normalizeIp } from './client-ip.mjs'

const DEFAULT_MAX_TRACKED_CLIENTS = 10000

function setRateLimitHeaders(response, { limit, remaining, resetSeconds }) {
  response.set('RateLimit-Limit', String(limit))
  response.set('RateLimit-Remaining', String(Math.max(0, remaining)))
  response.set('RateLimit-Reset', String(Math.max(1, resetSeconds)))
}

export function createRateLimiter({
  windowMs,
  maxRequests,
  bypassIps = [],
  expandedIps = [],
  expandedMaxRequests = maxRequests,
  now = Date.now,
  maxTrackedClients = DEFAULT_MAX_TRACKED_CLIENTS,
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
      for (const [key, bucket] of clients) {
        if (bucket.resetAt <= currentTime) {
          clients.delete(key)
        }
      }
      lastSweep = currentTime
    }

    let bucket = clients.get(key)

    if (!bucket || bucket.resetAt <= currentTime) {
      if (!bucket && clients.size >= maxTrackedClients) {
        const retrySeconds = Math.max(1, Math.ceil(windowMs / 1000))
        setRateLimitHeaders(response, {
          limit: requestLimit,
          remaining: 0,
          resetSeconds: retrySeconds,
        })
        response.set('Retry-After', String(retrySeconds))
        response.status(429).json({
          error: 'Too many AI deck requests. Please try again later.',
        })
        return
      }

      bucket = {
        count: 0,
        resetAt: currentTime + windowMs,
      }
      clients.set(key, bucket)
    }

    const resetSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - currentTime) / 1000),
    )

    if (bucket.count >= requestLimit) {
      setRateLimitHeaders(response, {
        limit: requestLimit,
        remaining: 0,
        resetSeconds,
      })
      response.set('Retry-After', String(resetSeconds))
      response.status(429).json({
        error: 'Too many AI deck requests. Please try again later.',
      })
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
