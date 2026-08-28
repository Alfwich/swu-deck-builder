import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { resolveCliExecutable } from '../server/cli-executable.mjs'
import { loadServerConfig } from '../server/config.mjs'

async function fakeCli(t, name) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swu-cli-path-'))
  const filename = process.platform === 'win32' ? `${name}.cmd` : name
  const executable = path.join(directory, filename)
  await writeFile(executable, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
  if (process.platform !== 'win32') await chmod(executable, 0o755)
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { directory, executable }
}

test('CLI executables are detected from PATH and can be explicitly overridden', async (t) => {
  const codex = await fakeCli(t, 'codex')
  const environment = { PATH: codex.directory, PATHEXT: '.CMD' }

  assert.equal(resolveCliExecutable({ command: 'codex', environment }), codex.executable)
  assert.equal(
    resolveCliExecutable({ command: 'unused', override: codex.executable, environment }),
    codex.executable,
  )
  assert.equal(resolveCliExecutable({ command: 'claude', environment }), '')
})

test('CLI provider configuration is opt-in and keeps model settings server-side', async (t) => {
  const codex = await fakeCli(t, 'codex')
  const config = loadServerConfig({
    AGENTIC_DECK_GENERATION_ENABLED: 'true',
    AGENTIC_DECK_PROVIDER: 'codex-cli',
    AGENT_CLI_MODEL: 'gpt-5.6-sol',
    AGENT_CLI_REASONING_EFFORT: 'high',
    AGENT_CLI_WEB_SEARCH_ENABLED: 'true',
    PATH: codex.directory,
    PATHEXT: '.CMD',
  })

  assert.equal(config.agenticDeckGeneration.available, true)
  assert.equal(config.agenticDeckGeneration.provider, 'codex-cli')
  assert.equal(config.agenticDeckGeneration.cliExecutable, codex.executable)
  assert.equal(config.agenticDeckGeneration.cliModel, 'gpt-5.6-sol')
  assert.equal(config.agenticDeckGeneration.cliReasoningEffort, 'high')
  assert.equal(config.agenticDeckGeneration.cliWebSearchEnabled, true)
})

test('provider auto-detection prefers Codex and falls back to Claude', async (t) => {
  const codex = await fakeCli(t, 'codex')
  const claude = await fakeCli(t, 'claude')
  const both = `${claude.directory}${path.delimiter}${codex.directory}`

  const preferred = loadServerConfig({ PATH: both, PATHEXT: '.CMD' })
  assert.equal(preferred.agenticDeckGeneration.enabled, true)
  assert.equal(preferred.agenticDeckGeneration.provider, 'codex-cli')
  assert.equal(preferred.agenticDeckGeneration.available, true)

  const fallback = loadServerConfig({ PATH: claude.directory, PATHEXT: '.CMD' })
  assert.equal(fallback.agenticDeckGeneration.enabled, true)
  assert.equal(fallback.agenticDeckGeneration.provider, 'claude-cli')
  assert.equal(fallback.agenticDeckGeneration.available, true)
})

test('auto-configuration disables AI instead of selecting OpenAI', () => {
  const config = loadServerConfig({
    PATH: '',
    SWU_OPENAI_API_KEY: 'not-selected-without-an-explicit-provider',
  })

  assert.equal(config.agenticDeckGeneration.enabled, false)
  assert.equal(config.agenticDeckGeneration.provider, '')
  assert.equal(config.agenticDeckGeneration.available, false)
})

test('CLI web search cannot enable search for the OpenAI API provider', () => {
  const config = loadServerConfig({
    AGENTIC_DECK_PROVIDER: 'openai-api',
    AGENT_CLI_WEB_SEARCH_ENABLED: 'true',
  })

  assert.equal(config.agenticDeckGeneration.cliWebSearchEnabled, false)
})

test('provider-specific CLI reasoning settings are validated', () => {
  assert.throws(
    () => loadServerConfig({
      AGENTIC_DECK_PROVIDER: 'codex-cli',
      AGENT_CLI_REASONING_EFFORT: 'max',
    }),
    /Unsupported AGENT_CLI_REASONING_EFFORT/,
  )
  assert.throws(
    () => loadServerConfig({ AGENTIC_DECK_PROVIDER: 'local-magic' }),
    /Unsupported AGENTIC_DECK_PROVIDER/,
  )
})
