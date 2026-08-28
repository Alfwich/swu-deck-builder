import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveCliExecutable } from '../server/cli-executable.mjs'

const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/
const CLI_PROVIDERS = new Set(['codex-cli', 'claude-cli'])

function assignments(source) {
  const values = new Map()
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(ASSIGNMENT)
    if (match) values.set(match[1], match[2])
  }
  return values
}

export function detectLocalCli({ environment = process.env, platform = process.platform } = {}) {
  for (const candidate of [
    { command: 'codex', provider: 'codex-cli' },
    { command: 'claude', provider: 'claude-cli' },
  ]) {
    const executable = resolveCliExecutable({
      command: candidate.command,
      environment,
      platform,
    })
    if (executable) return { ...candidate, executable }
  }

  return { command: '', executable: '', provider: '' }
}

function configuredSource(template, detectedProvider) {
  return template
    .replace(
      /^AGENTIC_DECK_GENERATION_ENABLED=.*$/m,
      `AGENTIC_DECK_GENERATION_ENABLED=${CLI_PROVIDERS.has(detectedProvider)}`,
    )
    .replace(
      /^AGENTIC_DECK_PROVIDER=.*$/m,
      `AGENTIC_DECK_PROVIDER=${detectedProvider}`,
    )
}

function enabledCliProvider(source) {
  const values = assignments(source)
  const enabled = ['1', 'true', 'yes', 'on'].includes(
    String(values.get('AGENTIC_DECK_GENERATION_ENABLED') ?? '').toLowerCase(),
  )
  const provider = values.get('AGENTIC_DECK_PROVIDER')?.trim() || ''
  return enabled && CLI_PROVIDERS.has(provider) ? provider : ''
}

export function subscriptionWarning(provider) {
  const tool = provider === 'codex-cli'
    ? 'Codex CLI'
    : provider === 'claude-cli' ? 'Claude CLI' : ''
  return tool
    ? `AI requests will use the subscription for whichever account is authenticated with ${tool}.`
    : ''
}

function mergeMissingDefaults(current, defaults) {
  const currentValues = assignments(current)
  const defaultValues = assignments(defaults)
  const additions = []

  for (const [name, value] of defaultValues) {
    if (!currentValues.has(name)) additions.push(`${name}=${value}`)
  }

  let next = current
  for (const name of ['AGENTIC_DECK_GENERATION_ENABLED', 'AGENTIC_DECK_PROVIDER']) {
    if (currentValues.get(name)?.trim() === '') {
      const value = defaultValues.get(name) ?? ''
      next = next.replace(
        new RegExp(`^(\\s*${name}\\s*=).*$`, 'm'),
        `$1${value}`,
      )
    }
  }

  if (additions.length > 0) {
    const newline = current.includes('\r\n') ? '\r\n' : '\n'
    next = `${next.trimEnd()}${newline}${newline}# Defaults added automatically by npm install.${newline}${additions.join(newline)}${newline}`
  }

  return next
}

export async function configureEnvironment({
  root = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  environment = process.env,
  platform = process.platform,
} = {}) {
  const examplePath = path.join(root, '.env.example')
  const environmentPath = path.join(root, '.env')
  const template = await readFile(examplePath, 'utf8')
  const detected = detectLocalCli({ environment, platform })

  let current
  try {
    current = await readFile(environmentPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const defaults = configuredSource(template, detected.provider)
    await writeFile(environmentPath, defaults, { encoding: 'utf8', flag: 'wx' })
    return {
      action: 'created',
      cliProvider: enabledCliProvider(defaults),
      detected,
      path: environmentPath,
    }
  }

  const configuredProvider = assignments(current)
    .get('AGENTIC_DECK_PROVIDER')?.trim() || ''
  const defaults = configuredSource(
    template,
    configuredProvider || detected.provider,
  )
  const next = mergeMissingDefaults(current, defaults)
  if (next === current) {
    return {
      action: 'unchanged',
      cliProvider: enabledCliProvider(current),
      detected,
      path: environmentPath,
    }
  }

  await writeFile(environmentPath, next, 'utf8')
  return {
    action: 'updated',
    cliProvider: enabledCliProvider(next),
    detected,
    path: environmentPath,
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = await configureEnvironment()
  const provider = result.cliProvider || 'none (AI disabled)'
  console.log(`[swu-config] ${result.action} .env; local provider=${provider}`)
  const warning = subscriptionWarning(result.cliProvider)
  if (warning) {
    console.warn(`[swu-config] WARNING: ${warning}`)
  }
}
