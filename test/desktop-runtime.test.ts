import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  canOpenExternalUrl,
  createDesktopEnvironment,
  desktopCliSearchPath,
  desktopIconPath,
  desktopTitleBarOptions,
} from '../src/desktop/runtime.js'

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
    environment.SWU_CATALOG_PATH,
    path.join(appPath, 'data', 'catalog.json'),
  )
  assert.equal(
    environment.SWU_AGENT_CATALOG_PATH,
    path.join(userDataPath, 'agent-catalog.txt'),
  )
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

test('desktop window uses the bundled site favicon', () => {
  const appPath = path.resolve('packaged-app')

  assert.equal(
    desktopIconPath(appPath, 'win32'),
    path.join(appPath, 'dist', 'favicon.ico'),
  )
  assert.equal(
    desktopIconPath(appPath, 'linux'),
    path.join(appPath, 'dist', 'android-chrome-512x512.png'),
  )
})

test('desktop window replaces the native title bar with window controls', () => {
  assert.deepEqual(desktopTitleBarOptions(), {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#02060c',
      symbolColor: '#cbd5e1',
      height: 68,
    },
  })
})

test('desktop CLI search adds common macOS and Linux install locations', () => {
  assert.equal(
    desktopCliSearchPath(
      { HOME: '/Users/rey', PATH: '/usr/bin:/bin' },
      'darwin',
    ),
    [
      '/usr/bin',
      '/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/Users/rey/.local/bin',
      '/Users/rey/.npm-global/bin',
      '/Users/rey/.volta/bin',
    ].join(':'),
  )
  assert.equal(
    desktopCliSearchPath(
      { HOME: '/home/finn', PATH: '/usr/bin:/usr/local/bin' },
      'linux',
    ),
    [
      '/usr/bin',
      '/usr/local/bin',
      '/home/finn/.local/bin',
      '/home/finn/.npm-global/bin',
      '/home/finn/.volta/bin',
    ].join(':'),
  )
})
