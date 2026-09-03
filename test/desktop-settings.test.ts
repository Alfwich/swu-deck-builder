import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createDesktopSettingsStore,
  desktopSettingsFromEnvironment,
  validateDesktopSettings,
} from '../src/desktop/settings-store.js'

const SETTINGS = {
  provider: 'codex-cli',
  executablePath: 'C:\\Tools\\codex.cmd',
  model: 'gpt-5.6-sol',
  reasoningEffort: 'high',
  webSearchEnabled: true,
}

test('desktop settings persist validated CLI preferences', (context) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'swu-desktop-settings-'))
  const settingsPath = path.join(directory, 'agent-settings.json')
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const store = createDesktopSettingsStore(settingsPath)

  assert.equal(store.read(), null)
  assert.deepEqual(store.write(SETTINGS), SETTINGS)
  assert.deepEqual(store.read(), SETTINGS)
})

test('desktop settings reject unsupported providers and provider options', () => {
  assert.throws(
    () => validateDesktopSettings({ ...SETTINGS, provider: 'openai-api' }),
    /provider is invalid/,
  )
  assert.throws(
    () => validateDesktopSettings({ ...SETTINGS, reasoningEffort: 'max' }),
    /Codex CLI does not support max/,
  )
  assert.throws(
    () => validateDesktopSettings({ ...SETTINGS, model: 'bad model' }),
    /unsupported characters/,
  )
  assert.throws(
    () => validateDesktopSettings({
      ...SETTINGS,
      provider: 'auto',
      reasoningEffort: 'minimal',
    }),
    /shared by both CLIs/,
  )
})

test('desktop settings can be initialized from the current environment', () => {
  assert.deepEqual(
    desktopSettingsFromEnvironment(
      {
        AGENTIC_DECK_PROVIDER: 'claude-cli',
        AGENT_CLI_PATH: ' C:\\Tools\\claude.cmd ',
      },
      {
        cliModel: 'claude-sonnet-4-6',
        cliReasoningEffort: 'high',
        cliWebSearchEnabled: true,
      },
    ),
    {
      provider: 'claude-cli',
      executablePath: 'C:\\Tools\\claude.cmd',
      model: 'claude-sonnet-4-6',
      reasoningEffort: 'high',
      webSearchEnabled: true,
    },
  )
})
