import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  canOpenExternalUrl,
  createDesktopEnvironment,
} from '../desktop/runtime.mjs'

test('desktop runtime pins writable data and bundled assets to safe locations', () => {
  const appPath = path.resolve('packaged-app')
  const userDataPath = path.resolve('desktop-user-data')
  const environment = createDesktopEnvironment({
    appPath,
    baseEnvironment: {
      AGENTIC_DECK_PROVIDER: 'openai-api',
      APP_SERVER_HOST: '0.0.0.0',
      LOCAL_DECK_DATABASE_PATH: 'unsafe.sqlite',
    },
    userDataPath,
  })

  assert.equal(environment.NODE_ENV, 'production')
  assert.equal(environment.SWU_APP_RUNTIME, 'electron')
  assert.equal(environment.APP_SERVER_HOST, '127.0.0.1')
  assert.equal(environment.AGENTIC_DECK_PROVIDER, 'openai-api')
  assert.equal(
    environment.LOCAL_DECK_DATABASE_PATH,
    path.join(userDataPath, 'decks.sqlite'),
  )
  assert.equal(environment.APP_DIST_PATH, path.join(appPath, 'dist'))
  assert.equal(
    environment.SWU_OPENAI_FILE_CACHE_PATH,
    path.join(userDataPath, 'openai-file-cache.json'),
  )
})

test('saved desktop settings override inherited AI provider configuration', () => {
  const environment = createDesktopEnvironment({
    appPath: path.resolve('packaged-app'),
    baseEnvironment: {
      AGENTIC_DECK_PROVIDER: 'openai-api',
      SWU_OPENAI_API_KEY: 'inherited-key',
    },
    settings: {
      provider: 'claude-cli',
      executablePath: 'C:\\Tools\\claude.cmd',
      model: 'claude-sonnet-4-6',
      reasoningEffort: 'high',
      webSearchEnabled: true,
    },
    userDataPath: path.resolve('desktop-user-data'),
  })

  assert.equal(environment.AGENTIC_DECK_GENERATION_ENABLED, 'true')
  assert.equal(environment.AGENTIC_DECK_PROVIDER, 'claude-cli')
  assert.equal(environment.AGENT_CLI_PATH, 'C:\\Tools\\claude.cmd')
  assert.equal(environment.AGENT_CLI_MODEL, 'claude-sonnet-4-6')
  assert.equal(environment.AGENT_CLI_REASONING_EFFORT, 'high')
  assert.equal(environment.AGENT_CLI_WEB_SEARCH_ENABLED, 'true')
})

test('desktop external navigation allows only HTTPS URLs', () => {
  assert.equal(canOpenExternalUrl('https://swudb.com/decks/'), true)
  assert.equal(canOpenExternalUrl('http://example.com'), false)
  assert.equal(canOpenExternalUrl('file:///C:/secrets.txt'), false)
  assert.equal(canOpenExternalUrl('javascript:alert(1)'), false)
  assert.equal(canOpenExternalUrl('not a url'), false)
})
