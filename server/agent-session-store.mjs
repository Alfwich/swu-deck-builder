import { randomBytes } from 'node:crypto'

function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function createAgentSessionStore({
  ttlMs = 600000,
  maxSessions = 100,
  now = () => Date.now(),
  createToken = createSessionToken,
} = {}) {
  const sessions = new Map()

  function expirationFrom(timestamp) {
    return ttlMs === null ? null : timestamp + ttlMs
  }

  function sweep() {
    const currentTime = now()

    for (const [token, session] of sessions) {
      if (session.expiresAt !== null && session.expiresAt <= currentTime) {
        sessions.delete(token)
      }
    }
  }

  function create(clientIp) {
    sweep()

    if (sessions.size >= maxSessions) {
      throw new Error('Too many agent sessions are active. Please try again later.')
    }

    let token
    do {
      token = createToken()
    } while (sessions.has(token))

    const createdAt = now()
    const session = {
      token,
      clientIp,
      createdAt,
      expiresAt: expirationFrom(createdAt),
      previousResponseId: null,
      inFlight: false,
    }
    sessions.set(token, session)
    return { ...session }
  }

  function read(token, clientIp, { touch = true } = {}) {
    sweep()
    const session = sessions.get(token)

    if (!session || session.clientIp !== clientIp) {
      return null
    }

    if (touch && ttlMs !== null) {
      session.expiresAt = expirationFrom(now())
    }

    return { ...session }
  }

  function acquire(token, clientIp) {
    const session = read(token, clientIp)

    if (!session) {
      return { status: 'expired' }
    }

    const stored = sessions.get(token)
    if (stored.inFlight) {
      return { status: 'busy', session }
    }

    stored.inFlight = true
    return { status: 'acquired', session: { ...stored } }
  }

  function complete(token, responseId) {
    const session = sessions.get(token)
    if (!session) {
      return
    }

    session.previousResponseId = responseId
    session.inFlight = false
    session.expiresAt = expirationFrom(now())
  }

  function release(token) {
    const session = sessions.get(token)
    if (session) {
      session.inFlight = false
    }
  }

  function remove(token, clientIp) {
    const session = read(token, clientIp, { touch: false })
    return session ? sessions.delete(token) : false
  }

  return {
    acquire,
    complete,
    create,
    read,
    release,
    remove,
    size() {
      sweep()
      return sessions.size
    },
  }
}
