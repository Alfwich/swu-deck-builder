import path from 'node:path'

const REASONING_EFFORTS = new Set([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

function readBoolean(value, fallback = false) {
  if (value === undefined || value === '') {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function readPositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function readStringList(value) {
  return String(value ?? '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function readPath(value, fallback) {
  return path.resolve(value?.trim() || fallback)
}

export function loadServerConfig(environment = process.env) {
  const enabled = readBoolean(
    environment.AGENTIC_DECK_GENERATION_ENABLED,
    false,
  )
  const reasoningEffort = environment.OPENAI_REASONING_EFFORT || 'medium'

  if (!REASONING_EFFORTS.has(reasoningEffort)) {
    throw new Error(
      `Unsupported OPENAI_REASONING_EFFORT: ${reasoningEffort}`,
    )
  }

  const apiKey = environment.SWU_OPENAI_API_KEY?.trim() || ''

  return {
    host: environment.APP_SERVER_HOST?.trim() || '127.0.0.1',
    port: readPositiveInteger(environment.APP_SERVER_PORT, 8787),
    distPath: readPath(environment.APP_DIST_PATH, 'dist'),
    agenticDeckGeneration: {
      enabled,
      available: enabled && Boolean(apiKey),
      apiKey,
      model: environment.OPENAI_MODEL?.trim() || 'gpt-5.6-terra',
      reasoningEffort,
      maxOutputTokens: readPositiveInteger(
        environment.OPENAI_MAX_OUTPUT_TOKENS,
        4000,
      ),
      requestTimeoutMs: readPositiveInteger(
        environment.OPENAI_REQUEST_TIMEOUT_MS,
        120000,
      ),
      accessAllowedIps: readStringList(
        environment.AGENT_ACCESS_ALLOWED_IPS === undefined
          ? '127.0.0.1,::1'
          : environment.AGENT_ACCESS_ALLOWED_IPS,
      ),
      rateLimitWindowMs: readPositiveInteger(
        environment.AGENT_RATE_LIMIT_WINDOW_MS,
        900000,
      ),
      rateLimitMaxRequests: readPositiveInteger(
        environment.AGENT_RATE_LIMIT_MAX_REQUESTS,
        5,
      ),
      rateLimitBypassIps: readStringList(
        environment.AGENT_RATE_LIMIT_BYPASS_IPS,
      ),
      rateLimitExpandedIps: readStringList(
        environment.AGENT_RATE_LIMIT_EXPANDED_IPS,
      ),
      rateLimitExpandedMaxRequests: readPositiveInteger(
        environment.AGENT_RATE_LIMIT_EXPANDED_MAX_REQUESTS,
        30,
      ),
      storeResponses: readBoolean(environment.OPENAI_STORE_RESPONSES, false),
      catalogFileId: environment.OPENAI_CATALOG_FILE_ID?.trim() || '',
      catalogPath: readPath(environment.SWU_CATALOG_PATH, 'data/catalog.json'),
      agentCatalogPath: readPath(
        environment.SWU_AGENT_CATALOG_PATH,
        'data/agent/catalog.csv',
      ),
      fileCachePath: readPath(
        environment.SWU_OPENAI_FILE_CACHE_PATH,
        'data/agent/openai-file-cache.json',
      ),
    },
  }
}

export function publicFeatureConfig(config, authorized = false) {
  const feature = config.agenticDeckGeneration

  return {
    agenticDeckGeneration: {
      authorized,
      enabled: authorized && feature.enabled,
      available: authorized && feature.available,
    },
  }
}
