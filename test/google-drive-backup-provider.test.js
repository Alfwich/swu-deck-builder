import assert from 'node:assert/strict'
import test from 'node:test'

import { createGoogleDriveBackupProvider } from '../src/google-drive-backup-provider.js'

function googleIdentity(requests) {
  return {
    accounts: {
      oauth2: {
        initTokenClient(configuration) {
          requests.configuration = configuration
          return {
            requestAccessToken(options) {
              requests.tokenOptions = options
              configuration.callback({
                access_token: 'drive-token',
                expires_in: 3600,
              })
            },
          }
        },
        revoke(_token, callback) {
          callback()
        },
      },
    },
  }
}

test('Google Drive provider requests app-data access and creates a backup', async () => {
  const requests = { fetches: [] }
  const google = googleIdentity(requests)
  const responses = [
    new Response(JSON.stringify({ files: [] })),
    new Response(JSON.stringify({
      id: 'file-1',
      modifiedTime: '2026-08-30T12:00:00.000Z',
      version: '2',
    })),
  ]
  const provider = createGoogleDriveBackupProvider({
    clientId: 'public-client-id',
    documentRef: {},
    fetchImpl: async (url, options = {}) => {
      requests.fetches.push({ options, url: String(url) })
      return responses.shift()
    },
    identityLoader: async () => google,
    windowRef: { google },
  })

  await provider.connect()
  const saved = await provider.save('{"backup":true}', { force: true })

  assert.equal(requests.configuration.client_id, 'public-client-id')
  assert.equal(
    requests.configuration.scope,
    'https://www.googleapis.com/auth/drive.appdata',
  )
  assert.equal(requests.tokenOptions.prompt, 'consent')
  assert.equal(requests.fetches.length, 2)
  assert.match(requests.fetches[0].url, /spaces=appDataFolder/)
  assert.equal(requests.fetches[1].options.method, 'POST')
  assert.match(requests.fetches[1].url, /uploadType=multipart/)
  assert.equal(saved.version, '2')
})

test('Google Drive provider refuses to overwrite an unexpected version', async () => {
  const requests = {}
  const google = googleIdentity(requests)
  const provider = createGoogleDriveBackupProvider({
    clientId: 'public-client-id',
    documentRef: {},
    fetchImpl: async () => new Response(JSON.stringify({
      files: [{ id: 'file-1', version: '9' }],
    })),
    identityLoader: async () => google,
    windowRef: { google },
  })
  await provider.connect()

  await assert.rejects(
    provider.save('{}', { expectedVersion: '8' }),
    (error) => error.code === 'remote_conflict',
  )
})

test('Google Drive provider accepts version drift when the backup snapshot is unchanged', async () => {
  const requests = { fetches: [] }
  const google = googleIdentity(requests)
  const responses = [
    new Response(JSON.stringify({
      files: [{ id: 'file-1', version: '9' }],
    })),
    new Response(JSON.stringify({ snapshotId: 'snapshot-8' })),
    new Response(JSON.stringify({
      id: 'file-1',
      modifiedTime: '2026-08-30T13:00:00.000Z',
      version: '10',
    })),
  ]
  const provider = createGoogleDriveBackupProvider({
    clientId: 'public-client-id',
    documentRef: {},
    fetchImpl: async (url, options = {}) => {
      requests.fetches.push({ options, url: String(url) })
      return responses.shift()
    },
    identityLoader: async () => google,
    windowRef: { google },
  })
  await provider.connect()

  const saved = await provider.save('{"snapshotId":"snapshot-10"}', {
    expectedSnapshotId: 'snapshot-8',
    expectedVersion: '8',
  })

  assert.equal(saved.version, '10')
  assert.equal(requests.fetches.length, 3)
  assert.match(requests.fetches[1].url, /alt=media/)
  assert.equal(requests.fetches[2].options.method, 'PATCH')
})

test('Google Drive provider rejects version drift when the backup snapshot changed', async () => {
  const requests = {}
  const google = googleIdentity(requests)
  const responses = [
    new Response(JSON.stringify({
      files: [{ id: 'file-1', version: '9' }],
    })),
    new Response(JSON.stringify({ snapshotId: 'snapshot-from-another-client' })),
  ]
  const provider = createGoogleDriveBackupProvider({
    clientId: 'public-client-id',
    documentRef: {},
    fetchImpl: async () => responses.shift(),
    identityLoader: async () => google,
    windowRef: { google },
  })
  await provider.connect()

  await assert.rejects(
    provider.save('{"snapshotId":"next-snapshot"}', {
      expectedSnapshotId: 'snapshot-8',
      expectedVersion: '8',
    }),
    (error) => error.code === 'remote_conflict',
  )
})

test('Google Drive provider avoids repeated consent for a remembered connection', async () => {
  const requests = {}
  const google = googleIdentity(requests)
  const provider = createGoogleDriveBackupProvider({
    clientId: 'public-client-id',
    documentRef: {},
    identityLoader: async () => google,
    windowRef: { google },
  })

  await provider.connect({ previouslyAuthorized: true })

  assert.equal(requests.tokenOptions.prompt, '')
})
