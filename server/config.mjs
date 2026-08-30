import path from 'node:path'

import { resolveCliExecutable } from './cli-executable.mjs'

const OPENAI_REASONING_EFFORTS = new Set([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])
const CLI_PROVIDERS = new Set(['codex-cli', 'claude-cli'])
const PROVIDERS = new Set(['openai-api', ...CLI_PROVIDERS])
const CLI_REASONING_EFFORTS = {
  'codex-cli': new Set(['minimal', 'low', 'medium', 'high', 'xhigh']),
  'claude-cli': new Set(['low', 'medium', 'high', 'xhigh', 'max']),
}

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

function readOrigins(value, isProduction) {
  return readStringList(value).map((entry) => {
    let origin
    try {
      origin = new URL(entry).origin
    } catch {
      throw new Error(`Invalid GOOGLE_DRIVE_AUTHORIZED_ORIGINS entry: ${entry}`)
    }
    const url = new URL(origin)
    const isLoopback = new Set(['127.0.0.1', '::1', 'localhost']).has(
      url.hostname.toLowerCase(),
    )
    if (url.protocol !== 'https:' && (isProduction || !isLoopback)) {
      throw new Error('Google Drive authorized origins must use HTTPS outside local development.')
    }
    return origin
  })
}

function readEncryptionKey(value) {
  const encoded = String(value ?? '').trim()
  if (!encoded) return null
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error(
      'GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.',
    )
  }
  return key
}

function readPath(value, fallback) {
  return path.resolve(value?.trim() || fallback)
}

function readAgentCatalogPath(value) {
  const configuredPath = readPath(value, 'data/agent/catalog.txt')

  return configuredPath.toLowerCase().endsWith('.csv')
    ? `${configuredPath.slice(0, -4)}.txt`
    : configuredPath
}

function validateCliSettings(provider, model, reasoningEffort) {
  if (!CLI_PROVIDERS.has(provider)) {
    return
  }
  if (reasoningEffort && !CLI_REASONING_EFFORTS[provider]?.has(reasoningEffort)) {
    throw new Error(
      `Unsupported AGENT_CLI_REASONING_EFFORT for ${provider}: ${reasoningEffort}`,
    )
  }
  if (model && !/^[A-Za-z0-9._:/-]{1,160}$/.test(model)) {
    throw new Error('AGENT_CLI_MODEL contains unsupported characters.')
  }
}

function unavailableProviderReason(provider, cliCommand) {
  if (!provider) {
    return 'Neither Codex CLI nor Claude CLI was found on PATH.'
  }
  return provider === 'openai-api'
    ? 'SWU_OPENAI_API_KEY is not configured.'
    : `${cliCommand} was not found on PATH and AGENT_CLI_PATH did not resolve to an executable.`
}

function detectProvider(environment) {
  for (const candidate of [
    { command: 'codex', provider: 'codex-cli' },
    { command: 'claude', provider: 'claude-cli' },
  ]) {
    if (resolveCliExecutable({ command: candidate.command, environment })) {
      return candidate.provider
    }
  }

  return ''
}

function readProvider(environment) {
  const configured = environment.AGENTIC_DECK_PROVIDER?.trim() || ''
  const provider = configured || detectProvider(environment)
  if (provider && !PROVIDERS.has(provider)) {
    throw new Error(`Unsupported AGENTIC_DECK_PROVIDER: ${provider}`)
  }
  return provider
}

function readProviderConfig(environment, enabled, provider) {
  const apiKey = environment.SWU_OPENAI_API_KEY?.trim() || ''
  const cliCommand = provider === 'claude-cli'
    ? 'claude'
    : provider === 'codex-cli' ? 'codex' : ''
  const cliExecutable = CLI_PROVIDERS.has(provider)
    ? resolveCliExecutable({
        command: cliCommand,
        override: environment.AGENT_CLI_PATH,
        environment,
      })
    : ''
  const cliModel = environment.AGENT_CLI_MODEL?.trim() || ''
  const cliReasoningEffort =
    environment.AGENT_CLI_REASONING_EFFORT?.trim() || ''
  const cliWebSearchEnabled =
    CLI_PROVIDERS.has(provider) &&
    readBoolean(environment.AGENT_CLI_WEB_SEARCH_ENABLED, false)

  validateCliSettings(provider, cliModel, cliReasoningEffort)

  const configured = provider === 'openai-api'
    ? Boolean(apiKey)
    : CLI_PROVIDERS.has(provider) && Boolean(cliExecutable)
  return {
    apiKey,
    available: enabled && configured,
    cliCommand,
    cliExecutable,
    cliModel,
    cliReasoningEffort,
    cliWebSearchEnabled,
    provider,
    unavailableReason: enabled && !configured
      ? unavailableProviderReason(provider, cliCommand)
      : '',
  }
}

export function loadServerConfig(environment = process.env) {
  const provider = readProvider(environment)
  const host = environment.APP_SERVER_HOST?.trim() || '127.0.0.1'
  const runtimeMode = environment.SWU_APP_RUNTIME?.trim().toLowerCase() || 'web'
  const localDeckDatabasePath =
    environment.LOCAL_DECK_DATABASE_PATH?.trim() || ''
  const isProduction =
    String(environment.NODE_ENV ?? '').trim().toLowerCase() === 'production'
  const isLoopback = new Set(['127.0.0.1', '::1', 'localhost']).has(
    host.toLowerCase(),
  )
  const isTrustedLocalRuntime = !isProduction || runtimeMode === 'electron'
  const enabled = readBoolean(
    environment.AGENTIC_DECK_GENERATION_ENABLED,
    CLI_PROVIDERS.has(provider),
  )
  const reasoningEffort = environment.OPENAI_REASONING_EFFORT?.trim() || 'medium'
  const googleDriveClientId = environment.GOOGLE_DRIVE_CLIENT_ID?.trim() || ''
  const googleDriveClientSecret =
    environment.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || ''
  const googleDriveEncryptionKey = readEncryptionKey(
    environment.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY,
  )
  const googleDriveAuthorizedOrigins = readOrigins(
    environment.GOOGLE_DRIVE_AUTHORIZED_ORIGINS,
    isProduction,
  )

  if (!OPENAI_REASONING_EFFORTS.has(reasoningEffort)) {
    throw new Error(
      `Unsupported OPENAI_REASONING_EFFORT: ${reasoningEffort}`,
    )
  }

  const providerConfig = readProviderConfig(environment, enabled, provider)

  return {
    host,
    port: readPositiveInteger(environment.APP_SERVER_PORT, 8787),
    distPath: readPath(environment.APP_DIST_PATH, 'dist'),
    runtimeMode,
    localDeckDatabase: {
      enabled:
        Boolean(localDeckDatabasePath) && isTrustedLocalRuntime && isLoopback,
      path: localDeckDatabasePath ? readPath(localDeckDatabasePath) : '',
    },
    googleDriveWebAuth: {
      authorizedOrigins: googleDriveAuthorizedOrigins,
      available:
        runtimeMode === 'web' &&
        Boolean(
          googleDriveClientId &&
          googleDriveClientSecret &&
          googleDriveEncryptionKey &&
          googleDriveAuthorizedOrigins.length,
        ),
      clientId: googleDriveClientId,
      clientSecret: googleDriveClientSecret,
      cookieMaxAgeMs: Math.min(
        readPositiveInteger(environment.GOOGLE_DRIVE_COOKIE_MAX_AGE_DAYS, 180),
        180,
      ) * 24 * 60 * 60 * 1000,
      encryptionKey: googleDriveEncryptionKey,
      secureCookies: isProduction,
    },
    agenticDeckGeneration: {
      enabled,
      ...providerConfig,
      model: environment.OPENAI_MODEL?.trim() || 'gpt-5.6-terra',
      reasoningEffort,
      cliStatePath: environment.AGENT_CLI_STATE_PATH?.trim()
        ? readPath(environment.AGENT_CLI_STATE_PATH)
        : '',
      cliWorkPath: readPath(
        environment.AGENT_CLI_WORK_PATH,
        'data/agent/cli',
      ),
      cliMaxConcurrency: readPositiveInteger(
        environment.AGENT_CLI_MAX_CONCURRENCY,
        1,
      ),
      cliMaxOutputBytes: readPositiveInteger(
        environment.AGENT_CLI_MAX_OUTPUT_BYTES,
        1048576,
      ),
      cliTimeoutMs: readPositiveInteger(
        environment.AGENT_CLI_TIMEOUT_MS,
        600000,
      ),
      maxOutputTokens: readPositiveInteger(
        environment.OPENAI_MAX_OUTPUT_TOKENS,
        4000,
      ),
      requestTimeoutMs: readPositiveInteger(
        environment.OPENAI_REQUEST_TIMEOUT_MS,
        120000,
      ),
      sessionTtlMs: CLI_PROVIDERS.has(provider)
        ? null
        : readPositiveInteger(
            environment.AGENT_SESSION_TTL_MS,
            600000,
          ),
      maxSessions: readPositiveInteger(
        environment.AGENT_MAX_SESSIONS,
        100,
      ),
      accessAllowedIps: readStringList(
        environment.AGENT_ACCESS_ALLOWED_IPS === undefined
          ? '127.0.0.1,::1'
          : environment.AGENT_ACCESS_ALLOWED_IPS,
      ),
      accessPassword: environment.AGENT_ACCESS_PASSWORD ?? '',
      accessLeaseTtlMs: readPositiveInteger(
        environment.AGENT_ACCESS_LEASE_TTL_MS,
        600000,
      ),
      accessAuthRateLimitWindowMs: readPositiveInteger(
        environment.AGENT_ACCESS_AUTH_RATE_LIMIT_WINDOW_MS,
        900000,
      ),
      accessAuthRateLimitMaxRequests: readPositiveInteger(
        environment.AGENT_ACCESS_AUTH_RATE_LIMIT_MAX_REQUESTS,
        5,
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
      catalogFileFormat: environment.OPENAI_CATALOG_FILE_FORMAT?.trim() || '',
      catalogPath: readPath(environment.SWU_CATALOG_PATH, 'data/catalog.json'),
      agentCatalogPath: readAgentCatalogPath(
        environment.SWU_AGENT_CATALOG_PATH,
      ),
      fileCachePath: readPath(
        environment.SWU_OPENAI_FILE_CACHE_PATH,
        'data/agent/openai-file-cache.json',
      ),
    },
  }
}

function publicAgentImageCapability(authorized, available) {
  return authorized && available
    ? { imageAttachmentsAvailable: true }
    : {}
}

export function publicFeatureConfig(
  config,
  access = false,
  { imageAttachmentsAvailable = false } = {},
) {
  const feature = config.agenticDeckGeneration
  const authorized = typeof access === 'object'
    ? Boolean(access.authorized)
    : Boolean(access)
  const leaseExpiresAt = typeof access === 'object'
    ? access.leaseExpiresAt ?? null
    : null

  const publicConfig = {
    deckPersistence: {
      mode: config.localDeckDatabase?.enabled ? 'database' : 'browser',
    },
    agenticDeckGeneration: {
      authorized,
      enabled: authorized && feature.enabled,
      available: authorized && feature.available,
      authenticationAvailable:
        !authorized && feature.available && Boolean(feature.accessPassword),
      leaseExpiresAt: authorized && leaseExpiresAt
        ? new Date(leaseExpiresAt).toISOString()
        : null,
      ...publicAgentImageCapability(authorized, imageAttachmentsAvailable),
    },
  }

  if (config.googleDriveWebAuth?.available) {
    publicConfig.googleDrive = { webAuthorization: 'broker' }
  }

  if (config.desktop?.settingsAvailable) {
    publicConfig.desktop = {
      googleDriveAvailable: config.desktop.googleDriveAvailable === true,
      imageAttachmentsAvailable:
        config.desktop.imageAttachmentsAvailable === true &&
        config.agenticDeckGeneration.available === true &&
        config.agenticDeckGeneration.provider === 'codex-cli',
      settingsAvailable: true,
    }
  }

  return publicConfig
}
