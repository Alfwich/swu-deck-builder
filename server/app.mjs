import path from 'node:path'

import express from 'express'

import { createAgentSessionStore } from './agent-session-store.mjs'
import { createIpAccessChecker, getClientIp } from './client-ip.mjs'
import { publicFeatureConfig } from './config.mjs'
import { DeckGenerationValidationError } from './deck-validation.mjs'
import { createDeckGenerator } from './deck-generator.mjs'
import { createRateLimiter } from './rate-limit.mjs'

const LOCAL_AGENT_IPS = ['127.0.0.1', '::1']

function isExpiredContinuation(error) {
  return error?.code === 'continuation_expired' ||
    /previous.response|response.*not found/i.test(error?.message ?? '')
}

function parseAgentRequest(body, action, currentDeckError = null) {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  const format = body?.format ?? 'premier'
  const currentDeck = body?.currentDeck

  if (!prompt || prompt.length > 4000) {
    return { error: 'Prompt must contain between 1 and 4,000 characters.' }
  }
  if (format !== 'premier') {
    return { error: `Only Premier deck ${action} is currently supported.` }
  }
  if (currentDeckError && (!currentDeck || typeof currentDeck !== 'object')) {
    return { error: currentDeckError }
  }

  return { prompt, currentDeck }
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

export function createApp(config, dependencies = {}) {
  const app = express()
  const feature = config.agenticDeckGeneration
  const canAccessAgent = createIpAccessChecker(feature.accessAllowedIps)
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

  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  app.use(express.json({ limit: '16kb' }))

  app.get('/healthz', (_request, response) => {
    response.set('Cache-Control', 'no-store')
    response.json({ status: 'ok' })
  })

  app.get('/api/features', (request, response) => {
    response.set('Cache-Control', 'private, no-store')
    response.json(publicFeatureConfig(config, canAccessAgent(request)))
  })

  app.use('/api/agent', (request, response, next) => {
    if (!feature.enabled || canAccessAgent(request)) {
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
    const { prompt, currentDeck } = parsedRequest

    const token = readSessionToken(request)
    const acquired = sessionStore.acquire(token, getClientIp(request))

    if (acquired.status === 'expired') {
      response.status(410).json({
        code: 'session_expired',
        error: 'This agent session has expired.',
      })
      return
    }

    if (acquired.status === 'busy') {
      response.status(429).json({
        error: 'This agent session already has a request in progress.',
      })
      return
    }

    let completed = false
    try {
      const result = await generator.chat(
        prompt,
        currentDeck,
        acquired.session.previousResponseId,
      )
      sessionStore.complete(token, result.responseId)
      completed = true
      const session = sessionStore.read(token, getClientIp(request), {
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
        getClientIp(request),
      )
    } finally {
      if (!completed) {
        sessionStore.release(token)
      }
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
