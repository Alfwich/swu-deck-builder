export const REMOTE_BACKUP_FORMAT = 'swu-deck-builder-remote-backup'
export const REMOTE_BACKUP_VERSION = 1
export const REMOTE_BACKUP_STORAGE_KEY =
  'swu-deck-builder.remote-backup.v1'

const EMPTY_STATE = Object.freeze({
  connected: false,
  conflict: null,
  error: '',
  lastSavedAt: null,
  reconnectAvailable: false,
  status: 'disconnected',
})

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `backup-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function canonicalDatabaseSource(source) {
  const database = typeof source === 'string' ? JSON.parse(source) : source
  if (!isObject(database)) {
    throw new TypeError('The player database snapshot is invalid.')
  }
  const content = { ...database }
  delete content.exportedAt
  return JSON.stringify(content)
}

async function sha256(source) {
  const bytes = new TextEncoder().encode(source)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export async function playerDatabaseContentHash(source) {
  return sha256(canonicalDatabaseSource(source))
}

export async function createRemoteBackupEnvelope(
  databaseSource,
  { deviceId = createId(), parentSnapshotId = null } = {},
) {
  const database = JSON.parse(databaseSource)
  return {
    format: REMOTE_BACKUP_FORMAT,
    version: REMOTE_BACKUP_VERSION,
    snapshotId: createId(),
    parentSnapshotId,
    deviceId,
    savedAt: new Date().toISOString(),
    contentHash: await playerDatabaseContentHash(database),
    database,
  }
}

export async function parseRemoteBackupEnvelope(source) {
  let envelope
  try {
    envelope = typeof source === 'string' ? JSON.parse(source) : source
  } catch (error) {
    throw new Error(
      `The cloud backup is not valid JSON${
        error instanceof Error ? `: ${error.message}` : '.'
      }`,
    )
  }

  if (
    !isObject(envelope) ||
    envelope.format !== REMOTE_BACKUP_FORMAT ||
    envelope.version !== REMOTE_BACKUP_VERSION ||
    typeof envelope.snapshotId !== 'string' ||
    typeof envelope.deviceId !== 'string' ||
    typeof envelope.savedAt !== 'string' ||
    !isObject(envelope.database)
  ) {
    throw new Error('The cloud backup format is not supported.')
  }

  const contentHash = await playerDatabaseContentHash(envelope.database)
  if (contentHash !== envelope.contentHash) {
    throw new Error('The cloud backup failed its integrity check.')
  }
  return { ...envelope, contentHash }
}

export function decideRemoteBackupAction({
  lastSyncedHash = '',
  localHash,
  remoteHash,
}) {
  if (localHash === remoteHash) return 'synchronized'
  if (lastSyncedHash && localHash === lastSyncedHash) return 'restore-remote'
  if (lastSyncedHash && remoteHash === lastSyncedHash) return 'upload-local'
  return 'conflict'
}

function storedString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeRemoteBackupMetadata(value) {
  if (!isObject(value)) return null
  const lastRemoteVersion = storedString(value.lastRemoteVersion)
  const lastSnapshotId = storedString(value.lastSnapshotId)
  const lastSyncedHash = storedString(value.lastSyncedHash)
  const connectionEnabled = typeof value.connectionEnabled === 'boolean'
    ? value.connectionEnabled
    : Boolean(lastRemoteVersion || lastSnapshotId || lastSyncedHash)
  return {
    connectionEnabled,
    deviceId: storedString(value.deviceId) || createId(),
    lastRemoteVersion,
    lastSnapshotId,
    lastSyncedHash,
    pendingOverride: value.pendingOverride === true,
    providerId: storedString(value.providerId),
  }
}

export function loadRemoteBackupMetadata(storage) {
  try {
    const value = JSON.parse(storage?.getItem(REMOTE_BACKUP_STORAGE_KEY) ?? '')
    return normalizeRemoteBackupMetadata(value)
  } catch {
    return null
  }
}

function initialMetadata(storage, providerId) {
  return loadRemoteBackupMetadata(storage) ?? {
    connectionEnabled: false,
    deviceId: createId(),
    lastRemoteVersion: '',
    lastSnapshotId: '',
    lastSyncedHash: '',
    pendingOverride: false,
    providerId,
  }
}

export class RemoteBackupController {
  constructor({
    decodeDatabase,
    onRestore,
    provider,
    storage,
    writeDelay = 2000,
  }) {
    this.decodeDatabase = decodeDatabase
    this.onRestore = onRestore
    this.provider = provider
    this.storage = storage
    this.writeDelay = writeDelay
    this.metadata = initialMetadata(storage, provider.id)
    this.state = {
      ...EMPTY_STATE,
      reconnectAvailable:
        this.metadata.connectionEnabled &&
        this.metadata.providerId === provider.id,
    }
    this.listeners = new Set()
    this.localSource = ''
    this.remote = null
    this.conflictEnvelope = null
    this.writeTimer = null
    this.writeChain = Promise.resolve()
    this.connectionPromise = null
    this.automaticReconnectAttempted = false
  }

  getState = () => this.state

  subscribe = (listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  updateState(next) {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((listener) => listener())
  }

  persistMetadata() {
    this.metadata.providerId = this.provider.id
    this.storage?.setItem(
      REMOTE_BACKUP_STORAGE_KEY,
      JSON.stringify(this.metadata),
    )
  }

  setPendingOverride(value) {
    this.metadata.pendingOverride = value
    this.persistMetadata()
  }

  async connect(localSource, { interactive = true } = {}) {
    if (this.connectionPromise) return this.connectionPromise
    this.connectionPromise = this.connectOnce(localSource, { interactive })
    try {
      return await this.connectionPromise
    } finally {
      this.connectionPromise = null
    }
  }

  async connectOnce(localSource, { interactive }) {
    this.localSource = localSource
    this.updateState({ error: '', status: 'connecting' })
    try {
      const previouslyAuthorized =
        this.metadata.connectionEnabled &&
        this.metadata.providerId === this.provider.id
      await this.provider.connect({ interactive, previouslyAuthorized })
      this.metadata.connectionEnabled = true
      this.persistMetadata()
      this.updateState({
        connected: true,
        reconnectAvailable: false,
        status: 'checking',
      })
      this.remote = await this.provider.load()
      if (this.metadata.pendingOverride || !this.remote) {
        await this.save(localSource, { force: true })
        return
      }

      const envelope = await parseRemoteBackupEnvelope(this.remote.source)
      const localHash = await playerDatabaseContentHash(localSource)
      const action = decideRemoteBackupAction({
        lastSyncedHash: this.metadata.lastSyncedHash,
        localHash,
        remoteHash: envelope.contentHash,
      })
      await this.applyAction(action, envelope, localSource)
    } catch (error) {
      const needsInteraction =
        !interactive && error?.code === 'reauthorization_required'
      this.updateState({
        connected: this.provider.isConnected(),
        error: needsInteraction
          ? ''
          : error instanceof Error
            ? error.message
            : 'Google Drive could not be connected.',
        reconnectAvailable:
          this.metadata.connectionEnabled &&
          this.metadata.providerId === this.provider.id,
        status: needsInteraction ? 'disconnected' : 'error',
      })
    }
  }

  reconnect(localSource) {
    const canReconnect =
      !this.automaticReconnectAttempted &&
      this.provider.supportsAutomaticReconnect === true &&
      this.metadata.connectionEnabled &&
      this.metadata.providerId === this.provider.id
    if (!canReconnect) return undefined
    this.automaticReconnectAttempted = true
    return this.connect(localSource, { interactive: false })
  }

  async applyAction(action, envelope, localSource) {
    if (action === 'upload-local') {
      await this.save(localSource)
      return
    }
    if (action === 'restore-remote') {
      await this.restoreEnvelope(envelope)
      return
    }
    if (action === 'conflict') {
      this.conflictEnvelope = envelope
      this.updateState({
        conflict: {
          deckCount: envelope.database.decks?.length ?? 0,
          remoteSavedAt: envelope.savedAt,
        },
        status: 'conflict',
      })
      return
    }
    this.recordSynchronized(envelope)
  }

  recordSynchronized(envelope) {
    this.metadata.lastRemoteVersion = this.remote?.version ?? ''
    this.metadata.lastSnapshotId = envelope.snapshotId
    this.metadata.lastSyncedHash = envelope.contentHash
    this.metadata.pendingOverride = false
    this.persistMetadata()
    this.conflictEnvelope = null
    this.updateState({
      conflict: null,
      error: '',
      lastSavedAt: envelope.savedAt,
      status: 'saved',
    })
  }

  async restoreEnvelope(envelope) {
    const backup = this.decodeDatabase(JSON.stringify(envelope.database))
    await this.onRestore(backup)
    this.recordSynchronized(envelope)
  }

  queue(localSource, { force = false } = {}) {
    this.localSource = localSource
    if (force) this.setPendingOverride(true)
    if (
      !this.state.connected ||
      (this.state.status === 'conflict' && !force)
    ) {
      if (force) this.updateState({ status: 'pending' })
      return
    }

    globalThis.clearTimeout(this.writeTimer)
    this.updateState({ status: 'pending' })
    if (force) {
      this.writeChain = this.writeChain.then(
        () => this.save(this.localSource, { force: true }),
        () => this.save(this.localSource, { force: true }),
      )
      return this.writeChain
    }
    this.writeTimer = globalThis.setTimeout(() => {
      this.writeChain = this.writeChain.then(
        () => this.save(this.localSource),
        () => this.save(this.localSource),
      )
    }, this.writeDelay)
    return undefined
  }

  async backupNow(localSource) {
    this.localSource = localSource
    globalThis.clearTimeout(this.writeTimer)
    this.writeChain = this.writeChain.then(
      () => this.save(localSource),
      () => this.save(localSource),
    )
    return this.writeChain
  }

  async save(localSource, { force = false } = {}) {
    if (!this.state.connected) {
      if (force) this.setPendingOverride(true)
      return
    }
    this.updateState({ error: '', status: 'saving' })
    try {
      const localHash = await playerDatabaseContentHash(localSource)
      if (!force && localHash === this.metadata.lastSyncedHash) {
        this.updateState({ error: '', status: 'saved' })
        return
      }
      const envelope = await createRemoteBackupEnvelope(localSource, {
        deviceId: this.metadata.deviceId,
        parentSnapshotId: this.metadata.lastSnapshotId || null,
      })
      this.remote = await this.provider.save(JSON.stringify(envelope), {
        expectedVersion: this.metadata.lastRemoteVersion,
        force,
      })
      this.recordSynchronized(envelope)
    } catch (error) {
      await this.handleSaveError(error, force)
    }
  }

  async handleSaveError(error, force) {
    if (error?.code === 'remote_conflict') {
      await this.loadConflict()
      return
    }
    if (force) this.setPendingOverride(true)
    this.updateState({
      error: error instanceof Error ? error.message : 'The cloud backup could not be saved.',
      status: 'error',
    })
  }

  async loadConflict() {
    try {
      this.remote = await this.provider.load()
      this.conflictEnvelope = this.remote
        ? await parseRemoteBackupEnvelope(this.remote.source)
        : null
      const conflict = this.conflictEnvelope
        ? {
            deckCount: this.conflictEnvelope.database.decks?.length ?? 0,
            remoteSavedAt: this.conflictEnvelope.savedAt,
          }
        : null
      this.updateState({
        conflict,
        error: '',
        status: conflict ? 'conflict' : 'error',
      })
    } catch (error) {
      this.updateState({
        conflict: null,
        error: error instanceof Error ? error.message : 'The cloud backup could not be read.',
        status: 'error',
      })
    }
  }

  async resolveConflict(choice) {
    if (!this.conflictEnvelope) return
    if (choice === 'remote') {
      await this.restoreEnvelope(this.conflictEnvelope)
      return
    }
    if (choice === 'local') {
      await this.save(this.localSource, { force: true })
    }
  }

  async disconnect() {
    globalThis.clearTimeout(this.writeTimer)
    try {
      await this.provider.disconnect()
    } finally {
      this.metadata.connectionEnabled = false
      this.persistMetadata()
      this.remote = null
      this.conflictEnvelope = null
      this.updateState({ ...EMPTY_STATE })
    }
  }

  destroy() {
    globalThis.clearTimeout(this.writeTimer)
    this.listeners.clear()
  }
}
