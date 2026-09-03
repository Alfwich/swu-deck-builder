import assert from 'node:assert/strict'
import test from 'node:test'

import {
  authorizeGoogleDriveDesktop,
  createDesktopGoogleDriveBackupService,
} from '../src/desktop/google-drive-backup-service.js'

function memoryTokenStore(initial = '') {
  let token = initial
  return {
    available: () => true,
    clear: () => { token = '' },
    read: () => token,
    write: (value) => { token = value },
  }
}

test('desktop authorization uses the system browser, loopback, and PKCE', async () => {
  let authorizationUrl = null
  const result = await authorizeGoogleDriveDesktop({
    clientId: 'desktop-client-id',
    openExternal: async (url) => {
      authorizationUrl = new URL(url)
      const callback = new URL(authorizationUrl.searchParams.get('redirect_uri'))
      callback.searchParams.set('code', 'authorization-code')
      callback.searchParams.set('state', authorizationUrl.searchParams.get('state'))
      await fetch(callback)
    },
    timeoutMs: 2000,
  })

  assert.equal(authorizationUrl.origin, 'https://accounts.google.com')
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'desktop-client-id')
  assert.equal(authorizationUrl.searchParams.get('access_type'), 'offline')
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(
    authorizationUrl.searchParams.get('scope'),
    'https://www.googleapis.com/auth/drive.appdata',
  )
  assert.match(result.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/oauth2\/callback$/)
  assert.equal(result.code, 'authorization-code')
  assert.ok(result.codeVerifier.length >= 43)
})

test('desktop Drive uses a reusable token and the shared app-data backup', async () => {
  const tokenStore = memoryTokenStore()
  const requests = []
  const responses = [
    new Response(JSON.stringify({
      access_token: 'access-token',
      expires_in: 3600,
      refresh_token: 'refresh-token',
    })),
    new Response(JSON.stringify({ files: [{
      id: 'shared-file',
      modifiedTime: '2026-08-30T12:00:00.000Z',
      version: '4',
    }] })),
    new Response('{"shared":true}'),
  ]
  const service = createDesktopGoogleDriveBackupService({
    authorize: async () => ({
      code: 'authorization-code',
      codeVerifier: 'code-verifier',
      redirectUri: 'http://127.0.0.1:12345/oauth2/callback',
    }),
    clientId: 'desktop-client-id',
    clientSecret: 'desktop-client-secret',
    fetchImpl: async (url, options = {}) => {
      requests.push({ options, url: String(url) })
      return responses.shift()
    },
    openExternal: async () => {},
    tokenStore,
  })

  await service.connect()
  const backup = await service.load()

  assert.equal(tokenStore.read(), 'refresh-token')
  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token')
  assert.match(String(requests[0].options.body), /grant_type=authorization_code/)
  assert.match(String(requests[0].options.body), /client_secret=desktop-client-secret/)
  assert.match(requests[1].url, /spaces=appDataFolder/)
  assert.match(requests[1].url, /swu-deck-builder-player-database/)
  assert.equal(
    requests[1].options.headers.Authorization,
    'Bearer access-token',
  )
  assert.deepEqual(backup, {
    fileId: 'shared-file',
    savedAt: '2026-08-30T12:00:00.000Z',
    source: '{"shared":true}',
    version: '4',
  })
})

test('desktop Drive refreshes a remembered connection without reopening consent', async () => {
  const tokenStore = memoryTokenStore('stored-refresh-token')
  let authorizationRequests = 0
  const service = createDesktopGoogleDriveBackupService({
    authorize: async () => {
      authorizationRequests += 1
      throw new Error('Authorization UI should not open.')
    },
    clientId: 'desktop-client-id',
    clientSecret: 'desktop-client-secret',
    fetchImpl: async (_url, options) => {
      assert.match(String(options.body), /refresh_token=stored-refresh-token/)
      assert.match(String(options.body), /client_secret=desktop-client-secret/)
      return new Response(JSON.stringify({
        access_token: 'refreshed-access-token',
        expires_in: 3600,
      }))
    },
    openExternal: async () => {},
    tokenStore,
  })

  await service.connect()

  assert.equal(authorizationRequests, 0)
  assert.equal(service.isConnected(), true)
})

test('desktop automatic reconnect never opens authorization without a saved token', async () => {
  let authorizationRequests = 0
  const service = createDesktopGoogleDriveBackupService({
    authorize: async () => {
      authorizationRequests += 1
      throw new Error('Authorization UI should not open.')
    },
    clientId: 'desktop-client-id',
    clientSecret: 'desktop-client-secret',
    fetchImpl: async () => new Response('{}'),
    openExternal: async () => {},
    tokenStore: memoryTokenStore(),
  })

  await assert.rejects(
    service.connect({ interactive: false }),
    (error) => error.code === 'reauthorization_required',
  )
  assert.equal(authorizationRequests, 0)
})

test('desktop Drive is unavailable without matching client credentials', () => {
  const service = createDesktopGoogleDriveBackupService({
    clientId: 'desktop-client-id',
    clientSecret: '',
    openExternal: async () => {},
    tokenStore: memoryTokenStore(),
  })

  assert.equal(service.available(), false)
})
