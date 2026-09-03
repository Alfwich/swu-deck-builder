import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createGoogleDriveTokenStore } from '../src/desktop/google-drive-token-store.js'

test('desktop refresh tokens are encrypted before they reach disk', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swu-drive-token-'))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const filePath = path.join(directory, 'token')
  const safeStorage = {
    decryptString: (value) => Buffer.from(value).toString('utf8').slice(10),
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    isEncryptionAvailable: () => true,
  }
  const store = createGoogleDriveTokenStore(filePath, safeStorage)

  store.write('private-refresh-token')

  const diskValue = await readFile(filePath, 'utf8')
  assert.equal(diskValue.includes('private-refresh-token'), false)
  assert.equal(store.read(), 'private-refresh-token')
  store.clear()
  assert.equal(store.read(), '')
})

test('desktop refresh tokens are not stored without OS encryption', () => {
  const store = createGoogleDriveTokenStore('unused', {
    isEncryptionAvailable: () => false,
  })

  assert.equal(store.available(), false)
  assert.throws(
    () => store.write('private-refresh-token'),
    /secure credential storage is unavailable/,
  )
})
