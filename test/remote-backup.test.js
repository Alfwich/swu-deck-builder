import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REMOTE_BACKUP_STORAGE_KEY,
  RemoteBackupController,
  createRemoteBackupEnvelope,
  decideRemoteBackupAction,
  playerDatabaseContentHash,
} from '../src/remote-backup.js'

function database(name, exportedAt = '2026-08-30T12:00:00.000Z') {
  return JSON.stringify({
    format: 'swu-deck-builder-player-database',
    version: 1,
    exportedAt,
    selectedDeckId: null,
    decks: [{ id: name }],
    collection: { cards: [] },
  })
}

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

function fakeProvider(remote = null) {
  let connected = false
  return {
    id: 'fake',
    remote,
    saves: [],
    async connect() {
      connected = true
    },
    async disconnect() {
      connected = false
    },
    isConnected() {
      return connected
    },
    async load() {
      return this.remote
    },
    async save(source, options) {
      this.saves.push({ options, source })
      this.remote = {
        source,
        version: String(Number(this.remote?.version ?? 0) + 1),
      }
      return this.remote
    },
  }
}

function controller(provider, storage, restored = []) {
  return new RemoteBackupController({
    decodeDatabase: JSON.parse,
    onRestore(backup) {
      restored.push(backup)
    },
    provider,
    storage,
    writeDelay: 0,
  })
}

test('player database hashes ignore the export timestamp', async () => {
  assert.equal(
    await playerDatabaseContentHash(database('same', '2026-08-30T00:00:00Z')),
    await playerDatabaseContentHash(database('same', '2026-08-31T00:00:00Z')),
  )
})

test('remote action selection detects safe uploads, restores, and conflicts', () => {
  assert.equal(decideRemoteBackupAction({ localHash: 'a', remoteHash: 'a' }), 'synchronized')
  assert.equal(
    decideRemoteBackupAction({
      lastSyncedHash: 'base',
      localHash: 'local',
      remoteHash: 'base',
    }),
    'upload-local',
  )
  assert.equal(
    decideRemoteBackupAction({
      lastSyncedHash: 'base',
      localHash: 'base',
      remoteHash: 'remote',
    }),
    'restore-remote',
  )
  assert.equal(
    decideRemoteBackupAction({ localHash: 'local', remoteHash: 'remote' }),
    'conflict',
  )
})

test('a first connection uploads local data when no remote backup exists', async () => {
  const provider = fakeProvider()
  const remote = controller(provider, memoryStorage())

  await remote.connect(database('local'))

  assert.equal(provider.saves.length, 1)
  assert.equal(provider.saves[0].options.force, true)
  assert.equal(remote.getState().status, 'saved')
})

test('an imported database remains an authoritative pending override', async () => {
  const storage = memoryStorage()
  const oldEnvelope = await createRemoteBackupEnvelope(database('old'))
  const provider = fakeProvider({
    source: JSON.stringify(oldEnvelope),
    version: '8',
  })
  const beforeReload = controller(provider, storage)
  beforeReload.queue(database('imported'), { force: true })
  assert.equal(
    JSON.parse(storage.getItem(REMOTE_BACKUP_STORAGE_KEY)).pendingOverride,
    true,
  )

  const afterReload = controller(provider, storage)
  await afterReload.connect(database('imported'))

  assert.equal(provider.saves.length, 1)
  assert.equal(provider.saves[0].options.force, true)
  assert.equal(
    JSON.parse(storage.getItem(REMOTE_BACKUP_STORAGE_KEY)).pendingOverride,
    false,
  )
})

test('a known unchanged local database restores a newer remote backup', async () => {
  const storage = memoryStorage()
  const provider = fakeProvider()
  const base = database('base')
  const first = controller(provider, storage)
  await first.connect(base)
  await first.disconnect()

  const changedEnvelope = await createRemoteBackupEnvelope(database('remote'))
  provider.remote = {
    source: JSON.stringify(changedEnvelope),
    version: '2',
  }
  const restored = []
  const second = controller(provider, storage, restored)
  await second.connect(base)

  assert.equal(restored.length, 1)
  assert.equal(restored[0].decks[0].id, 'remote')
  assert.equal(provider.saves.length, 1)
})

test('unrelated local and remote databases require an explicit choice', async () => {
  const envelope = await createRemoteBackupEnvelope(database('remote'))
  const provider = fakeProvider({
    source: JSON.stringify(envelope),
    version: '1',
  })
  const remote = controller(provider, memoryStorage())

  await remote.connect(database('local'))

  assert.equal(remote.getState().status, 'conflict')
  assert.equal(provider.saves.length, 0)
})

test('a confirmed import replaces an active conflicting remote backup', async () => {
  const envelope = await createRemoteBackupEnvelope(database('remote'))
  const provider = fakeProvider({
    source: JSON.stringify(envelope),
    version: '1',
  })
  const remote = controller(provider, memoryStorage())
  await remote.connect(database('local'))

  await remote.queue(database('imported'), { force: true })

  assert.equal(provider.saves.length, 1)
  assert.equal(provider.saves[0].options.force, true)
  assert.equal(remote.getState().status, 'saved')
})
