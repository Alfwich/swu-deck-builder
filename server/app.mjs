import path from 'node:path'

import express from 'express'

import { createAgentAccessLeaseStore } from './agent-access-lease-store.mjs'
import { createAgentSessionStore } from './agent-session-store.mjs'
import { normalizeAgentCardCollection } from './card-collection.mjs'
import { createIpAccessChecker, getClientIp } from './client-ip.mjs'
import { publicFeatureConfig } from './config.mjs'
import {
  DESKTOP_IMAGE_CONTENT_TYPES,
  DesktopImageError,
  MAX_DESKTOP_IMAGE_BYTES,
} from './desktop-image-store.mjs'
import { DeckGenerationValidationError } from './deck-validation.mjs'
import { createDeckGenerator } from './deck-generator.mjs'
import { installDesktopAccessGate } from './desktop-access-gate.mjs'
import { createRateLimiter } from './rate-limit.mjs'
import {
  createLocalDeckStore,
  validateLocalDeckSnapshot,
} from './local-deck-store.mjs'

const LOCAL_AGENT_IPS = ['127.0.0.1', '::1']
const MAX_INITIAL_DECK_LIBRARY_SIZE = 5
const parseDesktopImageBody = express.raw({
  limit: MAX_DESKTOP_IMAGE_BYTES,
  type: () => true,
})

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
    deckLibrary.length > MAX_INITIAL_DECK_LIBRARY_SIZE
  ) {
    return {
      error: `Deck library must contain no more than ${MAX_INITIAL_DECK_LIBRARY_SIZE} decks.`,
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

  return {
    prompt,
    currentDeck,
    deckContextId,
    deckLibrary,
    imageToken,
    collection: collectionResult.collection,
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

function resolveDesktopImageAttachment(
  response,
  imageToken,
  desktopImagesAvailable,
  desktopImageStore,
) {
  if (!imageToken) return { attachment: null, accepted: true }

  if (!desktopImagesAvailable) {
    response.status(400).json({
      error: 'Image attachments require the Electron app with Codex CLI.',
    })
    return { attachment: null, accepted: false }
  }

  const attachment = desktopImageStore.get(imageToken)
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
  imageToken,
  desktopImageStore,
) {
  const acquired = sessionStore.acquire(token, clientIp)

  if (acquired.status === 'expired') {
    if (imageToken) await desktopImageStore.remove(imageToken)
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
  desktopImageStore,
  completed,
  sessionStore,
  token,
) {
  if (imageToken) {
    try {
      await desktopImageStore.remove(imageToken)
    } catch (error) {
      console.warn('Desktop image cleanup failed:', error)
    }
  }
  if (!completed) sessionStore.release(token)
}

export function createApp(config, dependencies = {}) {
  const app = express()
  const feature = config.agenticDeckGeneration
  const desktopImageStore = dependencies.desktopImageStore ?? null
  const desktopImagesAvailable = Boolean(
    config.desktop?.imageAttachmentsAvailable &&
    feature.available &&
    feature.provider === 'codex-cli' &&
    desktopImageStore,
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
    response.json(publicFeatureConfig(config, readAgentAccess(request)))
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

  app.post(
    '/api/desktop/agent/images',
    (request, response, next) => {
      response.set('Cache-Control', 'private, no-store')
      if (!desktopImagesAvailable) {
        response.status(404).json({
          error: 'Desktop image attachments are unavailable.',
        })
        return
      }
      parseDesktopImageBody(request, response, (error) => {
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
    },
    async (request, response) => {
      const contentType = String(request.get('Content-Type') ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase()
      if (!DESKTOP_IMAGE_CONTENT_TYPES.includes(contentType)) {
        response.status(415).json({
          error: 'Only PNG, JPEG, and WebP images are supported.',
        })
        return
      }

      try {
        response.status(201).json(
          await desktopImageStore.stage(request.body, contentType),
        )
      } catch (error) {
        if (error instanceof DesktopImageError) {
          response.status(error.status).json({ error: error.message })
          return
        }
        console.error('Desktop image staging failed:', error)
        response.status(500).json({ error: 'The image could not be staged.' })
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

  app.use(express.json({ limit: '256kb' }))

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

  app.delete('/api/agent/session', (request, response) => {
    if (unavailableAgentResponse(response)) {
      return
    }

    sessionStore.remove(readSessionToken(request), getClientIp(request))
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
    } = parsedRequest

    const image = resolveDesktopImageAttachment(
      response,
      imageToken,
      desktopImagesAvailable,
      desktopImageStore,
    )
    if (!image.accepted) return

    const chatSession = await acquireChatSession(
      response,
      sessionStore,
      readSessionToken(request),
      getClientIp(request),
      imageToken,
      desktopImageStore,
    )
    if (!chatSession) return
    const { acquired, clientIp, token } = chatSession

    let completed = false
    try {
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
          imagePath: image.attachment?.path ?? null,
        },
      )
      sessionStore.complete(token, result.responseId, deckContextId)
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
        desktopImageStore,
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
