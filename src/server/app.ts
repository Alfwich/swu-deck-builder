import path from 'node:path'

import express from 'express'

import { createAgentAccessLeaseStore } from './agent-access-lease-store.js'
import { createAgentSessionStore } from './agent-session-store.js'
import {
  fingerprintAgentCardCollection,
  normalizeAgentCardCollection,
} from './card-collection.js'
import { createIpAccessChecker, getClientIp } from './client-ip.js'
import { publicFeatureConfig } from './config.js'
import {
  AGENT_IMAGE_CONTENT_TYPES,
  AgentImageError,
  MAX_AGENT_IMAGE_BYTES,
} from './desktop-image-store.js'
import { DeckGenerationValidationError } from './deck-validation.js'
import { createDeckGenerator } from './deck-generator.js'
import { installDesktopAccessGate } from './desktop-access-gate.js'
import { createGoogleDriveOAuthBroker } from './google-drive-oauth-broker.js'
import { createRateLimiter } from './rate-limit.js'
import {
  createLocalDeckStore,
  validateLocalDeckSnapshot,
} from './local-deck-store.js'

const LOCAL_AGENT_IPS = ['127.0.0.1', '::1']
const MAX_AGENT_DECK_LIBRARY_SIZE = 250
const MAX_RECENT_COLLECTION_EVENTS = 4
const parseAgentImageBody = express.raw({
  limit: MAX_AGENT_IMAGE_BYTES,
  type: () => true,
})
const parseDesktopGoogleDriveBackup = express.text({
  limit: '64mb',
  type: 'application/json',
})
const parseDesktopGoogleDriveMetadata = express.json({
  limit: '8kb',
  type: 'application/json',
})
const parseGoogleDriveAuthorization = express.json({ limit: '16kb' })

function parseCardCollection(value) {
  try {
    return { collection: normalizeAgentCardCollection(value) }
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : 'The card collection is invalid.',
    }
  }
}

function parseCollectionDelta(value, label) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${label} is invalid.`)
  }
  const fromRevision = value.fromRevision
  const throughRevision = value.throughRevision
  if (
    !Number.isInteger(fromRevision) ||
    fromRevision < 0 ||
    !Number.isInteger(throughRevision) ||
    throughRevision < fromRevision
  ) {
    throw new TypeError(`${label} has invalid revisions.`)
  }
  if (typeof value.historyAvailable !== 'boolean') {
    throw new TypeError(`${label} has an invalid history state.`)
  }
  const parseCards = (entries, kind) => {
    if (!Array.isArray(entries) || entries.length > 5000) {
      throw new TypeError(`${label} has invalid ${kind}.`)
    }
    return entries.map((entry, index) => {
      const cardId = typeof entry?.cardId === 'string'
        ? entry.cardId.trim()
        : ''
      if (
        !cardId ||
        cardId.length > 100 ||
        !Number.isInteger(entry.count) ||
        entry.count < 1 ||
        entry.count > 999
      ) {
        throw new TypeError(`${label} ${kind} entry ${index + 1} is invalid.`)
      }
      const timeLabel = kind === 'addition' ? 'AddedAt' : 'RemovedAt'
      const firstKey = `first${timeLabel}`
      const lastKey = `last${timeLabel}`
      const first = entry[firstKey]
      const last = entry[lastKey]
      if (
        (first !== undefined &&
          (typeof first !== 'string' || !Number.isFinite(Date.parse(first)))) ||
        (last !== undefined &&
          (typeof last !== 'string' || !Number.isFinite(Date.parse(last))))
      ) {
        throw new TypeError(`${label} ${kind} entry ${index + 1} has invalid dates.`)
      }
      return {
        cardId,
        count: entry.count,
        ...(first ? { [firstKey]: new Date(first).toISOString() } : {}),
        ...(last ? { [lastKey]: new Date(last).toISOString() } : {}),
      }
    })
  }
  return {
    fromRevision,
    throughRevision,
    historyAvailable: value.historyAvailable,
    additions: parseCards(value.additions, 'addition'),
    removals: parseCards(value.removals, 'removal'),
  }
}

function parseRecentCollectionCards(entries, label) {
  if (!Array.isArray(entries) || entries.length > 5000) {
    throw new TypeError(`${label} is invalid.`)
  }
  return entries.map((entry, index) => {
    const cardId = typeof entry?.cardId === 'string'
      ? entry.cardId.trim()
      : ''
    if (
      !cardId ||
      cardId.length > 100 ||
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > 999
    ) {
      throw new TypeError(`${label} entry ${index + 1} is invalid.`)
    }
    return { cardId, count: entry.count }
  })
}

function parseRecentCollectionEvents(value) {
  const events = value ?? []
  if (
    !Array.isArray(events) ||
    events.length > MAX_RECENT_COLLECTION_EVENTS
  ) {
    throw new TypeError('The recent collection events are invalid.')
  }

  let previousRevision = -1
  return events.map((event, index) => {
    const label = `Recent collection event ${index + 1}`
    if (
      !Number.isInteger(event?.revision) ||
      event.revision < 1 ||
      event.revision <= previousRevision ||
      typeof event.changedAt !== 'string' ||
      !Number.isFinite(Date.parse(event.changedAt)) ||
      !['assistant', 'manual'].includes(event.source)
    ) {
      throw new TypeError(`${label} is invalid.`)
    }
    previousRevision = event.revision
    return {
      revision: event.revision,
      changedAt: new Date(event.changedAt).toISOString(),
      source: event.source,
      additions: parseRecentCollectionCards(
        event.additions,
        `${label} additions`,
      ),
      removals: parseRecentCollectionCards(
        event.removals,
        `${label} removals`,
      ),
    }
  })
}

function parseCollectionContext(value) {
  if (value === undefined) return null
  if (!value || typeof value !== 'object' || !Array.isArray(value.decks)) {
    throw new TypeError('The deck collection-change context is invalid.')
  }
  if (value.decks.length > MAX_AGENT_DECK_LIBRARY_SIZE) {
    throw new TypeError(
      `Deck collection-change context must contain no more than ${MAX_AGENT_DECK_LIBRARY_SIZE} decks.`,
    )
  }
  return {
    recentEvents: parseRecentCollectionEvents(value.recentEvents),
    currentDeck: parseCollectionDelta(
      value.currentDeck,
      'The current deck collection-change context',
    ),
    decks: value.decks.map((entry, index) => {
      const deckId = typeof entry?.deckId === 'string'
        ? entry.deckId.trim().slice(0, 160)
        : ''
      if (!deckId) {
        throw new TypeError(
          `Deck collection-change context entry ${index + 1} has an invalid deck ID.`,
        )
      }
      return {
        deckId,
        ...parseCollectionDelta(
          entry,
          `Deck collection-change context entry ${index + 1}`,
        ),
      }
    }),
  }
}

function parseCollectionContextResult(value) {
  try {
    return { collectionContext: parseCollectionContext(value) }
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : 'The deck collection-change context is invalid.',
    }
  }
}

function isExpiredContinuation(error) {
  return error?.code === 'continuation_expired' ||
    /previous.response|response.*not found/i.test(error?.message ?? '')
}

function parseAgentRequest(body, action, currentDeckError = null) {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  const format = body?.format ?? 'premier'
  const currentDeck = body?.currentDeck
  const deckLibrary = body?.deckLibrary ?? []
  const deckContextId = typeof body?.deckId === 'string'
    ? body.deckId.trim().slice(0, 160)
    : ''
  const imageToken = typeof body?.imageToken === 'string'
    ? body.imageToken.trim()
    : ''

  if (!prompt || prompt.length > 4000) {
    return { error: 'Prompt must contain between 1 and 4,000 characters.' }
  }
  if (format !== 'premier') {
    return { error: `Only Premier deck ${action} is currently supported.` }
  }
  if (currentDeckError && (!currentDeck || typeof currentDeck !== 'object')) {
    return { error: currentDeckError }
  }
  if (
    !Array.isArray(deckLibrary) ||
    deckLibrary.length > MAX_AGENT_DECK_LIBRARY_SIZE
  ) {
    return {
      error: `Deck library must contain no more than ${MAX_AGENT_DECK_LIBRARY_SIZE} decks.`,
    }
  }

  if (
    body?.imageToken !== undefined &&
    (!imageToken || !/^[A-Za-z0-9_-]{16,128}$/.test(imageToken))
  ) {
    return { error: 'The image attachment token is invalid.' }
  }

  const collectionResult = parseCardCollection(body?.collection)
  if (collectionResult.error) return collectionResult

  const collectionContextResult = parseCollectionContextResult(
    body?.collectionContext,
  )
  if (collectionContextResult.error) return collectionContextResult

  return {
    prompt,
    currentDeck,
    deckContextId,
    deckLibrary,
    imageToken,
    collection: collectionResult.collection,
    collectionContext: collectionContextResult.collectionContext,
  }
}

function promptForDeckContext(prompt, deckChanged) {
  return deckChanged
    ? `The user has selected a different deck. Continue the existing conversation and retain earlier deck snapshots for comparison and discussion. Treat the newly supplied visible deck as authoritative for this turn and for any proposed changes.\n\nUser message: ${prompt}`
    : prompt
}

function respondToInvalidAgentRequest(response, parsedRequest) {
  if (!parsedRequest.error) {
    return false
  }
  response.status(400).json({ error: parsedRequest.error })
  return true
}

function respondToDeckError(response, error, activity) {
  if (error instanceof DeckGenerationValidationError) {
    response.status(422).json({
      error: error.message,
      issues: error.issues,
    })
    return
  }

  console.error(`Agentic deck ${activity} failed:`, error)
  response.status(502).json({
    error:
      error instanceof Error
        ? error.message
        : `Agentic deck ${activity} failed.`,
  })
}

function respondToChatError(response, error, sessionStore, token, clientIp) {
  if (error instanceof DeckGenerationValidationError) {
    response.status(422).json({
      error: error.message,
      issues: error.issues,
    })
    return
  }
  if (isExpiredContinuation(error)) {
    sessionStore.remove(token, clientIp)
    response.status(410).json({
      code: 'session_expired',
      error: 'This agent session can no longer be continued.',
    })
    return
  }

  console.error('Agentic deck chat failed:', error)
  response.status(502).json({
    error: error instanceof Error ? error.message : 'Agentic deck chat failed.',
  })
}

async function resolveAgentImageAttachment(
  response,
  imageToken,
  agentImagesAvailable,
  agentImageStore,
  owner,
) {
  if (!imageToken) return { attachment: null, accepted: true }

  if (!agentImagesAvailable) {
    response.status(400).json({
      error: 'Image attachments are unavailable for the configured AI provider.',
    })
    return { attachment: null, accepted: false }
  }

  const attachment = await agentImageStore.claim(imageToken, owner)
  if (!attachment) {
    response.status(400).json({
      error: 'The image attachment is missing or expired.',
    })
    return { attachment: null, accepted: false }
  }

  return { attachment, accepted: true }
}

async function acquireChatSession(
  response,
  sessionStore,
  token,
  clientIp,
  imageOwner,
  agentImageStore,
) {
  const acquired = sessionStore.acquire(token, clientIp)

  if (acquired.status === 'expired') {
    if (imageOwner) await agentImageStore?.removeOwner(imageOwner)
    response.status(410).json({
      code: 'session_expired',
      error: 'This agent session has expired.',
    })
    return null
  }

  if (acquired.status === 'busy') {
    response.status(429).json({
      error: 'This agent session already has a request in progress.',
    })
    return null
  }

  return { acquired, clientIp, token }
}

async function cleanupChatRequest(
  imageToken,
  agentImageStore,
  completed,
  sessionStore,
  token,
) {
  if (imageToken) {
    try {
      await agentImageStore.remove(imageToken)
    } catch (error) {
      console.warn('Agent image cleanup failed:', error)
    }
  }
  if (!completed) sessionStore.release(token)
}

export function createApp(config, dependencies = {}) {
  const app = express()
  const feature = config.agenticDeckGeneration
  const agentImageStore =
    dependencies.agentImageStore ?? dependencies.desktopImageStore ?? null
  const desktopGoogleDrive = dependencies.desktopGoogleDrive ?? null
  const desktopGoogleDriveSyncStore =
    dependencies.desktopGoogleDriveSyncStore ?? null
  const googleDriveOAuthBroker = dependencies.googleDriveOAuthBroker ??
    createGoogleDriveOAuthBroker(config.googleDriveWebAuth)
  const agentImagesAvailable = Boolean(
    feature.available &&
    ['codex-cli', 'openai-api'].includes(feature.provider) &&
    agentImageStore &&
    (
      config.runtimeMode === 'web' ||
      config.desktop?.imageAttachmentsAvailable === true
    ),
  )
  const localDeckDatabase = config.localDeckDatabase ?? { enabled: false }
  const localDeckStore = localDeckDatabase.enabled
    ? dependencies.localDeckStore ?? createLocalDeckStore(localDeckDatabase.path)
    : null
  const hasPermanentAgentAccess = createIpAccessChecker(feature.accessAllowedIps)
  const accessLeaseStore = dependencies.accessLeaseStore ??
    createAgentAccessLeaseStore({
      password: feature.accessPassword,
      ttlMs: feature.accessLeaseTtlMs,
    })
  const generator = feature.available
    ? dependencies.generator ?? createDeckGenerator(feature)
    : null
  const sessionStore =
    dependencies.sessionStore ??
    createAgentSessionStore({
      ttlMs: feature.sessionTtlMs,
      maxSessions: feature.maxSessions,
    })
  let requestInFlight = false

  function readAgentAccess(request) {
    if (hasPermanentAgentAccess(request)) {
      return { authorized: true, leaseExpiresAt: null }
    }

    const lease = accessLeaseStore.read(getClientIp(request))
    return {
      authorized: Boolean(lease),
      leaseExpiresAt: lease?.expiresAt ?? null,
    }
  }

  const accessAuthRateLimiter = createRateLimiter({
    windowMs: feature.accessAuthRateLimitWindowMs,
    maxRequests: feature.accessAuthRateLimitMaxRequests,
    bypassIps: LOCAL_AGENT_IPS,
    errorMessage: 'Too many AI access attempts. Please try again later.',
  })

  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  installDesktopAccessGate(app, config.desktop?.accessToken)

  app.get('/healthz', (_request, response) => {
    response.set('Cache-Control', 'no-store')
    response.json({ status: 'ok' })
  })

  app.get('/api/features', (request, response) => {
    response.set('Cache-Control', 'private, no-store')
    response.json(
      publicFeatureConfig(config, readAgentAccess(request), {
        imageAttachmentsAvailable: agentImagesAvailable,
      }),
    )
  })

  const googleDriveAuthRateLimiter = createRateLimiter({
    bypassIps: LOCAL_AGENT_IPS,
    errorMessage: 'Too many Google Drive authorization requests. Please try again later.',
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
  })

  function clearGoogleDriveCookie(response) {
    const options = { ...googleDriveOAuthBroker.cookieOptions }
    delete options.maxAge
    response.clearCookie(googleDriveOAuthBroker.cookieName, options)
  }

  function respondToGoogleDriveAuthError(response, error) {
    if (error?.code === 'reauthorization_required') {
      clearGoogleDriveCookie(response)
    }
    response.status(Number(error?.status) || 502).json({
      code: error?.code ?? '',
      error: error instanceof Error
        ? error.message
        : 'Google Drive authorization failed.',
    })
  }

  app.post(
    '/api/google-drive/auth/code',
    googleDriveAuthRateLimiter,
    parseGoogleDriveAuthorization,
    async (request, response) => {
      response.set('Cache-Control', 'private, no-store')
      try {
        const result = await googleDriveOAuthBroker.exchangeCode({
          code: typeof request.body?.code === 'string' ? request.body.code : '',
          origin: request.get('Origin') ?? '',
          redirectUri: typeof request.body?.redirectUri === 'string'
            ? request.body.redirectUri
            : '',
        })
        response.cookie(
          googleDriveOAuthBroker.cookieName,
          result.cookieValue,
          googleDriveOAuthBroker.cookieOptions,
        )
        response.json({
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        })
      } catch (error) {
        respondToGoogleDriveAuthError(response, error)
      }
    },
  )

  app.post(
    '/api/google-drive/auth/token',
    googleDriveAuthRateLimiter,
    async (request, response) => {
      response.set('Cache-Control', 'private, no-store')
      try {
        const result = await googleDriveOAuthBroker.refresh({
          cookieHeader: request.get('Cookie'),
          origin: request.get('Origin') ?? '',
        })
        response.cookie(
          googleDriveOAuthBroker.cookieName,
          result.cookieValue,
          googleDriveOAuthBroker.cookieOptions,
        )
        response.json({
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        })
      } catch (error) {
        respondToGoogleDriveAuthError(response, error)
      }
    },
  )

  app.delete('/api/google-drive/auth', async (request, response) => {
    response.set('Cache-Control', 'private, no-store')
    try {
      await googleDriveOAuthBroker.revoke({
        cookieHeader: request.get('Cookie'),
        origin: request.get('Origin') ?? '',
      })
    } catch (error) {
      if (error?.code !== 'reauthorization_required') {
        respondToGoogleDriveAuthError(response, error)
        return
      }
    }
    clearGoogleDriveCookie(response)
    response.status(204).end()
  })

  app.get('/api/desktop/settings', (_request, response) => {
    response.set('Cache-Control', 'private, no-store')
    if (!dependencies.desktopSettingsStore) {
      response.status(404).json({ error: 'Desktop settings are unavailable.' })
      return
    }

    response.json(dependencies.desktopSettingsStore.read())
  })

  app.put(
    '/api/desktop/settings',
    express.json({ limit: '32kb' }),
    (request, response) => {
      response.set('Cache-Control', 'private, no-store')
      if (!dependencies.desktopSettingsStore) {
        response.status(404).json({ error: 'Desktop settings are unavailable.' })
        return
      }

      try {
        dependencies.desktopSettingsStore.write(request.body)
      } catch (error) {
        const isValidationError = error instanceof TypeError
        response.status(isValidationError ? 400 : 500).json({
          error: isValidationError
            ? error.message
            : 'Desktop settings could not be saved.',
        })
        return
      }

      response.status(202).json({ restartRequired: true })
      response.on('finish', () => dependencies.restartDesktopApp?.())
    },
  )

  app.post('/api/desktop/google-drive/connection', async (request, response) => {
    response.set('Cache-Control', 'private, no-store')
    if (!desktopGoogleDrive?.available()) {
      response.status(404).json({ error: 'Desktop Google Drive backup is unavailable.' })
      return
    }
    try {
      await desktopGoogleDrive.connect({
        interactive: request.query.interactive !== 'false',
      })
      response.status(204).end()
    } catch (error) {
      response.status(error?.code === 'reauthorization_required' ? 401 : 502).json({
        code: error?.code ?? '',
        error: error instanceof Error
          ? error.message
          : 'Google Drive could not be connected.',
      })
    }
  })

  app.delete('/api/desktop/google-drive/connection', async (_request, response) => {
    response.set('Cache-Control', 'private, no-store')
    if (!desktopGoogleDrive?.available()) {
      response.status(404).json({ error: 'Desktop Google Drive backup is unavailable.' })
      return
    }
    await desktopGoogleDrive.disconnect()
    response.status(204).end()
  })

  app.get('/api/desktop/google-drive/metadata', (_request, response) => {
    response.set('Cache-Control', 'private, no-store')
    if (!desktopGoogleDriveSyncStore) {
      response.status(404).json({
        error: 'Desktop Google Drive sync metadata is unavailable.',
      })
      return
    }
    response.json(desktopGoogleDriveSyncStore.read())
  })

  app.put(
    '/api/desktop/google-drive/metadata',
    parseDesktopGoogleDriveMetadata,
    (request, response) => {
      response.set('Cache-Control', 'private, no-store')
      if (!desktopGoogleDriveSyncStore) {
        response.status(404).json({
          error: 'Desktop Google Drive sync metadata is unavailable.',
        })
        return
      }
      try {
        desktopGoogleDriveSyncStore.write(request.body)
        response.status(204).end()
      } catch (error) {
        response.status(400).json({
          error: error instanceof Error
            ? error.message
            : 'Desktop Google Drive sync metadata is invalid.',
        })
      }
    },
  )

  app.get('/api/desktop/google-drive/backup', async (_request, response) => {
    response.set('Cache-Control', 'private, no-store')
    if (!desktopGoogleDrive?.available()) {
      response.status(404).json({ error: 'Desktop Google Drive backup is unavailable.' })
      return
    }
    try {
      response.json(await desktopGoogleDrive.load())
    } catch (error) {
      response.status(502).json({
        code: error?.code ?? '',
        error: error instanceof Error
          ? error.message
          : 'The Google Drive backup could not be read.',
      })
    }
  })

  app.put(
    '/api/desktop/google-drive/backup',
    parseDesktopGoogleDriveBackup,
    async (request, response) => {
      response.set('Cache-Control', 'private, no-store')
      if (!desktopGoogleDrive?.available()) {
        response.status(404).json({ error: 'Desktop Google Drive backup is unavailable.' })
        return
      }
      try {
        response.json(await desktopGoogleDrive.save(request.body, {
          expectedSnapshotId: String(request.query.expectedSnapshotId ?? ''),
          expectedVersion: String(request.query.expectedVersion ?? ''),
          force: request.query.force === 'true',
        }))
      } catch (error) {
        response.status(error?.code === 'remote_conflict' ? 409 : 502).json({
          code: error?.code ?? '',
          error: error instanceof Error
            ? error.message
            : 'The Google Drive backup could not be saved.',
        })
      }
    },
  )

  app.get('/api/local/deck-library', (_request, response) => {
    response.set('Cache-Control', 'private, no-store')
    if (!localDeckStore) {
      response.status(404).json({ error: 'Local deck database mode is disabled.' })
      return
    }

    response.json(localDeckStore.read())
  })

  app.put('/api/local/deck-library', express.json({ limit: '5mb' }), (request, response) => {
    response.set('Cache-Control', 'private, no-store')
    if (!localDeckStore) {
      response.status(404).json({ error: 'Local deck database mode is disabled.' })
      return
    }

    let snapshot
    try {
      snapshot = validateLocalDeckSnapshot(request.body)
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : 'The deck library is invalid.',
      })
      return
    }

    const result = localDeckStore.replace(
      snapshot.expectedRevision,
      snapshot.decks,
      snapshot.collection,
      snapshot.promptHistory,
    )
    if (result.status === 'conflict') {
      response.status(409).json({
        code: 'revision_conflict',
        error: 'The local deck database changed in another browser session.',
        snapshot: result.snapshot,
      })
      return
    }

    response.json(result.snapshot)
  })

  app.use(express.json({ limit: '5mb' }))

  app.post('/api/agent/access', accessAuthRateLimiter, (request, response) => {
    response.set('Cache-Control', 'private, no-store')

    if (!feature.available || !accessLeaseStore.configured) {
      response.status(404).json({
        error: 'AI access authentication is not configured.',
      })
      return
    }

    const result = accessLeaseStore.authenticate(
      getClientIp(request),
      request.body?.password,
    )
    if (result.status === 'invalid') {
      response.status(401).json({ error: 'The access password is incorrect.' })
      return
    }
    if (result.status !== 'granted') {
      response.status(503).json({
        error: 'AI access cannot be granted right now.',
      })
      return
    }

    response.status(201).json(
      publicFeatureConfig(config, {
        authorized: true,
        leaseExpiresAt: result.expiresAt,
      }, {
        imageAttachmentsAvailable: agentImagesAvailable,
      }),
    )
  })

  app.use('/api/agent', (request, response, next) => {
    if (!feature.enabled || readAgentAccess(request).authorized) {
      next()
      return
    }

    response.status(403).json({
      error: 'AI deck tools are not available from this IP address.',
    })
  })

  function unavailableAgentResponse(response) {
    if (!feature.enabled) {
      response.status(404).json({ error: 'Agentic deck tools are disabled.' })
      return true
    }

    if (!generator) {
      response.status(503).json({
        error: `Agentic deck tools are enabled, but ${feature.unavailableReason || 'the selected provider is unavailable'}`,
      })
      return true
    }

    return false
  }

  function readSessionToken(request) {
    const value = request.get('X-SWU-Agent-Session')
    return typeof value === 'string' ? value.trim() : ''
  }

  function publicSession(session) {
    return {
      token: session.token,
      expiresAt: session.expiresAt === null
        ? null
        : new Date(session.expiresAt).toISOString(),
      hasConversation: Boolean(session.previousResponseId),
      ttlMs: feature.sessionTtlMs,
    }
  }

  app.post('/api/agent/session', (request, response) => {
    if (unavailableAgentResponse(response)) {
      return
    }

    try {
      const session = sessionStore.create(getClientIp(request))
      response.set('Cache-Control', 'private, no-store')
      response.status(201).json(publicSession(session))
    } catch (error) {
      response.status(503).json({
        error:
          error instanceof Error
            ? error.message
            : 'An agent session could not be created.',
      })
    }
  })

  app.get('/api/agent/session', (request, response) => {
    if (unavailableAgentResponse(response)) {
      return
    }

    const session = sessionStore.read(
      readSessionToken(request),
      getClientIp(request),
    )

    if (!session) {
      response.status(410).json({
        code: 'session_expired',
        error: 'This agent session has expired.',
      })
      return
    }

    response.set('Cache-Control', 'private, no-store')
    response.json(publicSession(session))
  })

  app.delete('/api/agent/session', async (request, response) => {
    if (unavailableAgentResponse(response)) {
      return
    }

    const token = readSessionToken(request)
    const clientIp = getClientIp(request)
    await agentImageStore?.removeOwner(`${clientIp}\n${token}`)
    sessionStore.remove(token, clientIp)
    response.status(204).end()
  })

  app.use(
    '/api/agent',
    createRateLimiter({
      windowMs: feature.rateLimitWindowMs,
      maxRequests: feature.rateLimitMaxRequests,
      bypassIps: [...feature.rateLimitBypassIps, ...LOCAL_AGENT_IPS],
      expandedIps: feature.rateLimitExpandedIps,
      expandedMaxRequests: feature.rateLimitExpandedMaxRequests,
    }),
  )

  function parseAgentImageUpload(request, response, next) {
    response.set('Cache-Control', 'private, no-store')
    if (!agentImagesAvailable) {
      response.status(404).json({
        error: 'Image attachments are unavailable.',
      })
      return
    }

    const token = readSessionToken(request)
    const clientIp = getClientIp(request)
    if (!sessionStore.read(token, clientIp, { touch: false })) {
      response.status(410).json({
        code: 'session_expired',
        error: 'This agent session has expired.',
      })
      return
    }
    request.agentImageOwner = `${clientIp}\n${token}`

    parseAgentImageBody(request, response, (error) => {
      if (error?.type === 'entity.too.large') {
        response.status(413).json({ error: 'Images must be 10 MB or smaller.' })
        return
      }
      if (error) {
        next(error)
        return
      }
      next()
    })
  }

  async function stageAgentImage(request, response) {
    const contentType = String(request.get('Content-Type') ?? '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase()
    if (!AGENT_IMAGE_CONTENT_TYPES.includes(contentType)) {
      response.status(415).json({
        error: 'Only PNG, JPEG, and WebP images are supported.',
      })
      return
    }

    try {
      response.status(201).json(
        await agentImageStore.stage(
          request.body,
          contentType,
          request.agentImageOwner,
        ),
      )
    } catch (error) {
      if (error instanceof AgentImageError) {
        response.status(error.status).json({ error: error.message })
        return
      }
      console.error('Agent image staging failed:', error)
      response.status(500).json({ error: 'The image could not be staged.' })
    }
  }

  app.post('/api/agent/images', parseAgentImageUpload, stageAgentImage)
  if (config.desktop?.accessToken) {
    app.post(
      '/api/desktop/agent/images',
      parseAgentImageUpload,
      stageAgentImage,
    )
  }

  app.post('/api/agent/chat', async (request, response) => {
    if (unavailableAgentResponse(response)) {
      return
    }

    const parsedRequest = parseAgentRequest(
      request.body,
      'chat',
      'The currently selected SWUDB deck definition is required.',
    )
    if (respondToInvalidAgentRequest(response, parsedRequest)) {
      return
    }
    const {
      prompt,
      currentDeck,
      deckContextId,
      deckLibrary,
      imageToken,
      collection,
      collectionContext,
    } = parsedRequest

    const token = readSessionToken(request)
    const clientIp = getClientIp(request)
    const imageOwner = `${clientIp}\n${token}`
    const chatSession = await acquireChatSession(
      response,
      sessionStore,
      token,
      clientIp,
      imageOwner,
      agentImageStore,
    )
    if (!chatSession) return
    const { acquired } = chatSession

    const image = await resolveAgentImageAttachment(
      response,
      imageToken,
      agentImagesAvailable,
      agentImageStore,
      imageOwner,
    )
    if (!image.accepted) {
      sessionStore.release(token)
      return
    }

    let completed = false
    try {
      const collectionFingerprint = fingerprintAgentCardCollection(collection)
      const includeCollection = !acquired.session.previousResponseId ||
        acquired.session.collectionFingerprint !== collectionFingerprint
      const deckChanged = Boolean(
        deckContextId &&
        acquired.session.deckContextId &&
        deckContextId !== acquired.session.deckContextId,
      )
      const result = await generator.chat(
        promptForDeckContext(prompt, deckChanged),
        currentDeck,
        acquired.session.previousResponseId,
        acquired.session.previousResponseId ? [] : deckLibrary,
        {
          collection,
          collectionContext,
          includeCollection,
          imageAttachment: image.attachment
            ? {
                contentType: image.attachment.contentType,
                path: image.attachment.path,
                size: image.attachment.size,
              }
            : null,
        },
      )
      sessionStore.complete(token, result.responseId, deckContextId, {
        fingerprint: collectionFingerprint,
        revision: collection.revision,
      })
      completed = true
      const session = sessionStore.read(token, clientIp, {
        touch: false,
      })
      response.json({
        ...result,
        session: session ? publicSession(session) : null,
      })
    } catch (error) {
      respondToChatError(
        response,
        error,
        sessionStore,
        token,
        clientIp,
      )
    } finally {
      await cleanupChatRequest(
        imageToken,
        agentImageStore,
        completed,
        sessionStore,
        token,
      )
    }
  })

  app.post('/api/agent/decks', async (request, response) => {
    if (!feature.enabled) {
      response.status(404).json({ error: 'Agentic deck generation is disabled.' })
      return
    }

    if (!generator) {
      response.status(503).json({
        error: `Agentic deck generation is enabled, but ${feature.unavailableReason || 'the selected provider is unavailable'}`,
      })
      return
    }

    if (requestInFlight) {
      response.status(429).json({
        error: 'A deck generation request is already in progress.',
      })
      return
    }

    const parsedRequest = parseAgentRequest(request.body, 'generation')
    if (respondToInvalidAgentRequest(response, parsedRequest)) {
      return
    }
    const { prompt } = parsedRequest

    requestInFlight = true
    try {
      response.json(await generator.generate(prompt))
    } catch (error) {
      respondToDeckError(response, error, 'generation')
    } finally {
      requestInFlight = false
    }
  })

  app.post('/api/agent/decks/transform', async (request, response) => {
    if (!feature.enabled) {
      response.status(404).json({ error: 'Agentic deck tools are disabled.' })
      return
    }

    if (!generator) {
      response.status(503).json({
        error: `Agentic deck tools are enabled, but ${feature.unavailableReason || 'the selected provider is unavailable'}`,
      })
      return
    }

    if (requestInFlight) {
      response.status(429).json({
        error: 'An AI deck request is already in progress.',
      })
      return
    }

    const parsedRequest = parseAgentRequest(
      request.body,
      'transformation',
      'A current SWUDB deck definition is required.',
    )
    if (respondToInvalidAgentRequest(response, parsedRequest)) {
      return
    }
    const { prompt, currentDeck } = parsedRequest

    requestInFlight = true
    try {
      response.json(await generator.transform(prompt, currentDeck))
    } catch (error) {
      respondToDeckError(response, error, 'transformation')
    } finally {
      requestInFlight = false
    }
  })

  const distPath = config.distPath ?? path.resolve('dist')
  app.use(express.static(distPath))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) {
      next()
      return
    }

    response.sendFile(path.join(distPath, 'index.html'), (error) => {
      if (error) {
        next(error)
      }
    })
  })

  return app
}
