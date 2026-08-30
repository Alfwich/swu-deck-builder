import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createGoogleDriveSyncStore } from '../desktop/google-drive-sync-store.mjs'

test('desktop Drive sync checkpoints persist outside the ephemeral browser origin', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swu-drive-sync-'))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const filePath = path.join(directory, 'google-drive-sync.json')
  const store = createGoogleDriveSyncStore(filePath)
  const metadata = {
    connectionEnabled: true,
    deviceId: 'desktop-device',
    lastRemoteVersion: '7',
    lastSnapshotId: 'snapshot-7',
    lastSyncedHash: 'hash-7',
    pendingOverride: false,
    providerId: 'google-drive',
  }

  store.write(metadata)

  assert.deepEqual(store.read(), metadata)
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), metadata)
})

test('desktop Drive sync checkpoints reject invalid or oversized values', () => {
  const store = createGoogleDriveSyncStore('unused')

  assert.throws(() => store.write([]), /must be an object/)
  assert.throws(
    () => store.write({ value: 'x'.repeat(5000) }),
    /too large/,
  )
})
