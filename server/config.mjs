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
      storeResponses: readBoolean(environment.OPENAI_STORE_RESPONSES, false),
      catalogFileId: environment.OPENAI_CATALOG_FILE_ID?.trim() || '',
    },
  }
}

export function publicFeatureConfig(config) {
  return {
    agenticDeckGeneration: {
      enabled: config.agenticDeckGeneration.enabled,
      available: config.agenticDeckGeneration.available,
    },
  }
}
