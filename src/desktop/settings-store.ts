import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PROVIDERS = new Set(['auto', 'codex-cli', 'claude-cli', 'disabled'])
const REASONING_EFFORTS = new Set([
  '',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

export const DEFAULT_DESKTOP_SETTINGS = Object.freeze({
  provider: 'auto',
  executablePath: '',
  model: '',
  reasoningEffort: '',
  webSearchEnabled: false,
})

function readString(value, name, maximumLength) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string.`)
  }
  const result = value.trim()
  if (result.length > maximumLength || result.includes('\0')) {
    throw new TypeError(`${name} is invalid.`)
  }
  return result
}

export function validateDesktopSettings(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('Desktop settings must be an object.')
  }

  const provider = readString(candidate.provider, 'Provider', 32)
  const executablePath = readString(
    candidate.executablePath,
    'Executable path',
    1000,
  )
  const model = readString(candidate.model, 'Model', 160)
  const reasoningEffort = readString(
    candidate.reasoningEffort,
    'Reasoning effort',
    32,
  )

  if (!PROVIDERS.has(provider)) {
    throw new TypeError('The selected desktop AI provider is invalid.')
  }
  if (model && !/^[A-Za-z0-9._:/-]+$/.test(model)) {
    throw new TypeError('Model contains unsupported characters.')
  }
  if (!REASONING_EFFORTS.has(reasoningEffort)) {
    throw new TypeError('The selected reasoning effort is invalid.')
  }
  if (
    provider === 'auto' &&
    ['minimal', 'max'].includes(reasoningEffort)
  ) {
    throw new TypeError(
      'Auto-detection supports only reasoning efforts shared by both CLIs.',
    )
  }
  if (provider === 'codex-cli' && reasoningEffort === 'max') {
    throw new TypeError('Codex CLI does not support max reasoning effort.')
  }
  if (provider === 'claude-cli' && reasoningEffort === 'minimal') {
    throw new TypeError('Claude CLI does not support minimal reasoning effort.')
  }
  if (typeof candidate.webSearchEnabled !== 'boolean') {
    throw new TypeError('Web search must be enabled or disabled.')
  }

  return {
    provider,
    executablePath,
    model,
    reasoningEffort,
    webSearchEnabled: candidate.webSearchEnabled,
  }
}

export function createDesktopSettingsStore(settingsPath) {
  return {
    read() {
      try {
        return validateDesktopSettings(
          JSON.parse(readFileSync(settingsPath, 'utf8')),
        )
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          console.warn('Desktop AI settings could not be loaded:', error)
        }
        return null
      }
    },
    write(candidate) {
      const settings = validateDesktopSettings(candidate)
      mkdirSync(path.dirname(settingsPath), { recursive: true })
      const temporaryPath = `${settingsPath}.${process.pid}.tmp`
      writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
      renameSync(temporaryPath, settingsPath)
      return settings
    },
  }
}

export function desktopSettingsFromEnvironment(environment, feature) {
  const configuredProvider = environment.AGENTIC_DECK_PROVIDER?.trim() || ''
  const explicitlyDisabled = /^(0|false|no|off)$/i.test(
    environment.AGENTIC_DECK_GENERATION_ENABLED?.trim() || '',
  )
  const provider = ['codex-cli', 'claude-cli'].includes(configuredProvider)
    ? configuredProvider
    : explicitlyDisabled ? 'disabled' : 'auto'
  const reasoningEffort =
    provider === 'auto' &&
    ['minimal', 'max'].includes(feature.cliReasoningEffort)
      ? ''
      : feature.cliReasoningEffort

  return {
    provider,
    executablePath: environment.AGENT_CLI_PATH?.trim() || '',
    model: feature.cliModel,
    reasoningEffort,
    webSearchEnabled: feature.cliWebSearchEnabled,
  }
}
