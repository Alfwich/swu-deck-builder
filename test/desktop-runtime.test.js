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

test('desktop external navigation allows only HTTPS URLs', () => {
  assert.equal(canOpenExternalUrl('https://swudb.com/decks/'), true)
  assert.equal(canOpenExternalUrl('http://example.com'), false)
  assert.equal(canOpenExternalUrl('file:///C:/secrets.txt'), false)
  assert.equal(canOpenExternalUrl('javascript:alert(1)'), false)
  assert.equal(canOpenExternalUrl('not a url'), false)
})
