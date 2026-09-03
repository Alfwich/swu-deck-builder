import assert from 'node:assert/strict'
import test from 'node:test'

import { createGoogleDriveCodeBackupProvider } from '../src/web/player-database/backup/google-drive-code-backup-provider.js'

function googleCodeIdentity(requests) {
  return {
    accounts: {
      oauth2: {
        initCodeClient(configuration) {
          requests.configuration = configuration
          return {
            requestCode() {
              requests.codeRequests += 1
              configuration.callback({ code: 'authorization-code' })
            },
          }
        },
      },
    },
  }
}

test('web code provider exchanges one interactive code with the broker', async () => {
  const requests = { codeRequests: 0, fetches: [] }
  const google = googleCodeIdentity(requests)
  const provider = createGoogleDriveCodeBackupProvider({
    clientId: 'web-client-id',
    documentRef: {},
    fetchImpl: async (url, options) => {
      requests.fetches.push({ options, url })
      return new Response(JSON.stringify({
        accessToken: 'broker-access-token',
        expiresIn: 3600,
      }))
    },
    identityLoader: async () => google,
    windowRef: {
      google,
      location: { origin: 'https://swu.wuteri.ch' },
    },
  })

  await provider.connect({ interactive: true })

  assert.equal(provider.id, 'google-drive')
  assert.equal(provider.supportsAutomaticReconnect, true)
  assert.equal(provider.isConnected(), true)
  assert.equal(requests.configuration.client_id, 'web-client-id')
  assert.equal(requests.configuration.prompt, undefined)
  assert.equal(requests.configuration.ux_mode, 'popup')
  assert.equal(requests.codeRequests, 1)
  assert.equal(requests.fetches[0].url, '/api/google-drive/auth/code')
  assert.deepEqual(JSON.parse(requests.fetches[0].options.body), {
    code: 'authorization-code',
    redirectUri: 'https://swu.wuteri.ch',
  })
})

test('web code provider reconnects through the broker without opening Google', async () => {
  let identityRequests = 0
  const provider = createGoogleDriveCodeBackupProvider({
    clientId: 'web-client-id',
    documentRef: {},
    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/google-drive/auth/token')
      assert.equal(options.method, 'POST')
      return new Response(JSON.stringify({
        accessToken: 'renewed-access-token',
        expiresIn: 3600,
      }))
    },
    identityLoader: async () => {
      identityRequests += 1
      return null
    },
    windowRef: { location: { origin: 'https://swu.wuteri.ch' } },
  })

  await provider.connect({ interactive: false })

  assert.equal(identityRequests, 0)
  assert.equal(provider.isConnected(), true)
})
