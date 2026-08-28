import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  configureEnvironment,
  subscriptionWarning,
} from '../scripts/configure-env.mjs'

const TEMPLATE = `SWU_ENV_SCHEMA_VERSION=2
APP_SERVER_PORT=8787
LOCAL_DECK_DATABASE_PATH=data/local/decks.sqlite
AGENTIC_DECK_GENERATION_ENABLED=false
AGENTIC_DECK_PROVIDER=
AGENT_CLI_MODEL=
`

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'swu-env-'))
  await writeFile(path.join(root, '.env.example'), TEMPLATE)
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function fakeCli(root, name) {
  const filename = process.platform === 'win32' ? `${name}.cmd` : name
  const executable = path.join(root, filename)
  const source = process.platform === 'win32'
    ? '@exit /b 0\r\n'
    : '#!/bin/sh\nexit 0\n'
  await writeFile(executable, source)
  if (process.platform !== 'win32') await chmod(executable, 0o755)
}

test('fresh environment creation prefers Codex over Claude', async (t) => {
  const root = await fixture(t)
  await fakeCli(root, 'codex')
  await fakeCli(root, 'claude')

  const result = await configureEnvironment({
    root,
    environment: { PATH: root, PATHEXT: '.CMD' },
  })
  const contents = await readFile(path.join(root, '.env'), 'utf8')

  assert.equal(result.action, 'created')
  assert.equal(result.cliProvider, 'codex-cli')
  assert.match(contents, /^AGENTIC_DECK_GENERATION_ENABLED=true$/m)
  assert.match(contents, /^AGENTIC_DECK_PROVIDER=codex-cli$/m)
  assert.match(
    contents,
    /^LOCAL_DECK_DATABASE_PATH=data\/local\/decks\.sqlite$/m,
  )
  assert.match(subscriptionWarning(result.cliProvider), /subscription.*account.*Codex CLI/i)
})

test('fresh environment creation falls back to Claude', async (t) => {
  const root = await fixture(t)
  await fakeCli(root, 'claude')

  await configureEnvironment({
    root,
    environment: { PATH: root, PATHEXT: '.CMD' },
  })
  const contents = await readFile(path.join(root, '.env'), 'utf8')

  assert.match(contents, /^AGENTIC_DECK_GENERATION_ENABLED=true$/m)
  assert.match(contents, /^AGENTIC_DECK_PROVIDER=claude-cli$/m)
})

test('fresh environment creation disables AI when neither CLI exists', async (t) => {
  const root = await fixture(t)

  await configureEnvironment({ root, environment: { PATH: '' } })
  const contents = await readFile(path.join(root, '.env'), 'utf8')

  assert.match(contents, /^AGENTIC_DECK_GENERATION_ENABLED=false$/m)
  assert.match(contents, /^AGENTIC_DECK_PROVIDER=$/m)
})

test('existing environment keeps choices and gains missing defaults', async (t) => {
  const root = await fixture(t)
  await fakeCli(root, 'codex')
  await writeFile(
    path.join(root, '.env'),
    'AGENTIC_DECK_GENERATION_ENABLED=false\nAGENTIC_DECK_PROVIDER=claude-cli\n',
  )

  const result = await configureEnvironment({
    root,
    environment: { PATH: root, PATHEXT: '.CMD' },
  })
  const contents = await readFile(path.join(root, '.env'), 'utf8')

  assert.equal(result.action, 'updated')
  assert.match(contents, /^AGENTIC_DECK_GENERATION_ENABLED=false$/m)
  assert.match(contents, /^AGENTIC_DECK_PROVIDER=claude-cli$/m)
  assert.match(contents, /^APP_SERVER_PORT=8787$/m)
  assert.match(contents, /^AGENT_CLI_MODEL=$/m)
  assert.match(
    contents,
    /^LOCAL_DECK_DATABASE_PATH=data\/local\/decks\.sqlite$/m,
  )
})

test('a migrated environment preserves an intentionally absent database key', async (t) => {
  const root = await fixture(t)
  await writeFile(
    path.join(root, '.env'),
    'SWU_ENV_SCHEMA_VERSION=2\nAGENTIC_DECK_GENERATION_ENABLED=false\nAGENTIC_DECK_PROVIDER=\n',
  )

  await configureEnvironment({ root, environment: { PATH: '' } })
  const contents = await readFile(path.join(root, '.env'), 'utf8')

  assert.doesNotMatch(contents, /^LOCAL_DECK_DATABASE_PATH=/m)
  assert.match(contents, /^APP_SERVER_PORT=8787$/m)
})

test('existing OpenAI choice is never enabled automatically', async (t) => {
  const root = await fixture(t)
  await fakeCli(root, 'codex')
  await writeFile(path.join(root, '.env'), 'AGENTIC_DECK_PROVIDER=openai-api\n')

  const result = await configureEnvironment({
    root,
    environment: { PATH: root, PATHEXT: '.CMD' },
  })
  const contents = await readFile(path.join(root, '.env'), 'utf8')

  assert.equal(result.cliProvider, '')
  assert.match(contents, /^AGENTIC_DECK_GENERATION_ENABLED=false$/m)
  assert.match(contents, /^AGENTIC_DECK_PROVIDER=openai-api$/m)
})
