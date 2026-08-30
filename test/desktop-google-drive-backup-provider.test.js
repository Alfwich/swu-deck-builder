import assert from 'node:assert/strict'
import test from 'node:test'

import { createDesktopGoogleDriveBackupProvider } from '../src/desktop-google-drive-backup-provider.js'

test('desktop provider sends backups only through the protected local API', async () => {
  const requests = []
  const provider = createDesktopGoogleDriveBackupProvider({
    fetchImpl: async (url, options = {}) => {
      requests.push({ options, url })
      if (options.method === 'PUT') {
        return new Response(JSON.stringify({ fileId: 'file-1', version: '3' }))
      }
      return new Response(null, { status: 204 })
    },
  })

  await provider.connect()
  await provider.save('{"database":true}', {
    expectedVersion: '2',
    force: true,
  })

  assert.equal(provider.id, 'google-drive')
  assert.equal(provider.isConnected(), true)
  assert.deepEqual(requests.map(({ url }) => url), [
    '/api/desktop/google-drive/connection',
    '/api/desktop/google-drive/backup?expectedVersion=2&force=true',
  ])
  assert.equal(requests[1].options.body, '{"database":true}')
})
