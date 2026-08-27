import path from 'node:path'

import express from 'express'

import { createIpAccessChecker } from './client-ip.mjs'
import { publicFeatureConfig } from './config.mjs'
import { DeckGenerationValidationError } from './deck-validation.mjs'
import { createOpenAiDeckGenerator } from './openai-deck-generator.mjs'
import { createRateLimiter } from './rate-limit.mjs'

export function createApp(config, dependencies = {}) {
  const app = express()
  const feature = config.agenticDeckGeneration
  const canAccessAgent = createIpAccessChecker(feature.accessAllowedIps)
  const generator = feature.available
    ? dependencies.generator ?? createOpenAiDeckGenerator(feature)
    : null
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

  app.use(
    '/api/agent',
    createRateLimiter({
      windowMs: feature.rateLimitWindowMs,
      maxRequests: feature.rateLimitMaxRequests,
      bypassIps: feature.rateLimitBypassIps,
      expandedIps: feature.rateLimitExpandedIps,
      expandedMaxRequests: feature.rateLimitExpandedMaxRequests,
    }),
  )

  app.post('/api/agent/decks', async (request, response) => {
    if (!feature.enabled) {
      response.status(404).json({ error: 'Agentic deck generation is disabled.' })
      return
    }

    if (!generator) {
      response.status(503).json({
        error:
          'Agentic deck generation is enabled, but SWU_OPENAI_API_KEY is not configured.',
      })
      return
    }

    if (requestInFlight) {
      response.status(429).json({
        error: 'A deck generation request is already in progress.',
      })
      return
    }

    const prompt =
      typeof request.body?.prompt === 'string' ? request.body.prompt.trim() : ''
    const format = request.body?.format ?? 'premier'

    if (!prompt || prompt.length > 4000) {
      response.status(400).json({
        error: 'Prompt must contain between 1 and 4,000 characters.',
      })
      return
    }

    if (format !== 'premier') {
      response.status(400).json({
        error: 'Only Premier deck generation is currently supported.',
      })
      return
    }

    requestInFlight = true
    try {
      response.json(await generator.generate(prompt))
    } catch (error) {
      if (error instanceof DeckGenerationValidationError) {
        response.status(422).json({
          error: error.message,
          issues: error.issues,
        })
      } else {
        console.error('Agentic deck generation failed:', error)
        response.status(502).json({
          error:
            error instanceof Error
              ? error.message
              : 'Agentic deck generation failed.',
        })
      }
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
        error:
          'Agentic deck tools are enabled, but SWU_OPENAI_API_KEY is not configured.',
      })
      return
    }

    if (requestInFlight) {
      response.status(429).json({
        error: 'An AI deck request is already in progress.',
      })
      return
    }

    const prompt =
      typeof request.body?.prompt === 'string' ? request.body.prompt.trim() : ''
    const format = request.body?.format ?? 'premier'
    const currentDeck = request.body?.currentDeck

    if (!prompt || prompt.length > 4000) {
      response.status(400).json({
        error: 'Prompt must contain between 1 and 4,000 characters.',
      })
      return
    }

    if (format !== 'premier') {
      response.status(400).json({
        error: 'Only Premier deck transformation is currently supported.',
      })
      return
    }

    if (!currentDeck || typeof currentDeck !== 'object') {
      response.status(400).json({
        error: 'A current SWUDB deck definition is required.',
      })
      return
    }

    requestInFlight = true
    try {
      response.json(await generator.transform(prompt, currentDeck))
    } catch (error) {
      if (error instanceof DeckGenerationValidationError) {
        response.status(422).json({
          error: error.message,
          issues: error.issues,
        })
      } else {
        console.error('Agentic deck transformation failed:', error)
        response.status(502).json({
          error:
            error instanceof Error
              ? error.message
              : 'Agentic deck transformation failed.',
        })
      }
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
