import assert from 'node:assert/strict'
import test from 'node:test'

import { createDesktopGoogleDriveBackupProvider } from '../src/web/player-database/backup/desktop-google-drive-backup-provider.js'

test('desktop provider sends backups only through the protected local API', async () => {
  const requests = []
  const provider = createDesktopGoogleDriveBackupProvider({
    fetchImpl: async (url, options = {}) => {
      requests.push({ options, url })
      if (url === '/api/desktop/google-drive/metadata') {
        return options.method === 'PUT'
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ lastSnapshotId: 'snapshot-2' }))
      }
      if (options.method === 'PUT') {
        return new Response(JSON.stringify({ fileId: 'file-1', version: '3' }))
      }
      return new Response(null, { status: 204 })
    },
  })

  await provider.connect()
  const metadata = await provider.loadMetadata()
  await provider.persistMetadata(metadata)
  await provider.save('{"database":true}', {
    expectedSnapshotId: 'snapshot-2',
    expectedVersion: '2',
    force: true,
  })

  assert.equal(provider.id, 'google-drive')
  assert.equal(provider.supportsStartupReconnect, true)
  assert.equal(provider.isConnected(), true)
  assert.deepEqual(requests.map(({ url }) => url), [
    '/api/desktop/google-drive/connection?interactive=true',
    '/api/desktop/google-drive/metadata',
    '/api/desktop/google-drive/metadata',
    '/api/desktop/google-drive/backup?expectedSnapshotId=snapshot-2&expectedVersion=2&force=true',
  ])
  assert.deepEqual(metadata, { lastSnapshotId: 'snapshot-2' })
  assert.equal(requests[3].options.body, '{"database":true}')
})
