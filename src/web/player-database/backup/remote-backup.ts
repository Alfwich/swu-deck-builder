export const REMOTE_BACKUP_FORMAT = 'swu-deck-builder-remote-backup'
export const REMOTE_BACKUP_VERSION = 1
export const REMOTE_BACKUP_STORAGE_KEY =
  'swu-deck-builder.remote-backup.v1'

import type { StorageLike } from '../../types/persistence.js'

type JsonObject = Record<string, unknown>
type BackupAction = 'synchronized' | 'restore-remote' | 'upload-local' | 'conflict'
type BackupStatus =
  | 'disconnected'
  | 'connecting'
  | 'checking'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error'

interface BackupDatabase extends JsonObject {
  decks?: Array<{ id?: unknown } | null>
  selectedDeckId?: unknown
}

export interface RemoteBackupEnvelope {
  format: typeof REMOTE_BACKUP_FORMAT
  version: typeof REMOTE_BACKUP_VERSION
  snapshotId: string
  parentSnapshotId: string | null
  deviceId: string
  savedAt: string
  contentHash: string
  databaseHash: string
  database: BackupDatabase
}

interface RemoteBackupMetadata {
  connectionEnabled: boolean
  deviceId: string
  lastRemoteVersion: string
  lastSnapshotId: string
  lastSyncedDatabaseHash: string
  lastSyncedHash: string
  pendingOverride: boolean
  providerId: string
}

interface RemoteBackupFile {
  source: string
  version?: string
}

export interface RemoteBackupProvider {
  id: string
  supportsAutomaticReconnect?: boolean
  supportsStartupReconnect?: boolean
  connect(options: { interactive: boolean; previouslyAuthorized: boolean }): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  load(): Promise<RemoteBackupFile | null>
  save(
    source: string,
    options: {
      expectedSnapshotId: string
      expectedVersion: string
      force: boolean
    },
  ): Promise<RemoteBackupFile>
  loadMetadata?(): Promise<unknown>
  persistMetadata?(metadata: RemoteBackupMetadata): Promise<void>
}

export interface RemoteBackupState {
  connected: boolean
  conflict: { deckCount: number; remoteSavedAt: string } | null
  error: string
  lastSavedAt: string | null
  reconnectAvailable: boolean
  status: BackupStatus
}

interface RemoteBackupControllerOptions<TDatabase> {
  decodeDatabase(source: string): TDatabase
  onRestore(database: TDatabase): void | Promise<void>
  provider: RemoteBackupProvider
  storage?: StorageLike | null
  writeDelay?: number
}

interface ErrorWithCode {
  code?: string
}

const EMPTY_STATE: Readonly<RemoteBackupState> = Object.freeze({
  connected: false,
  conflict: null,
  error: '',
  lastSavedAt: null,
  reconnectAvailable: false,
  status: 'disconnected',
})

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `backup-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function canonicalDatabaseSource(
  source: string | JsonObject,
  { includeSelection = true }: { includeSelection?: boolean } = {},
) {
  const database = typeof source === 'string' ? JSON.parse(source) : source
  if (!isObject(database)) {
    throw new TypeError('The player database snapshot is invalid.')
  }
  const content = { ...database }
  delete content.exportedAt
  if (!includeSelection) delete content.selectedDeckId
  return JSON.stringify(content)
}

async function sha256(source: string) {
  const bytes = new TextEncoder().encode(source)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export async function playerDatabaseContentHash(source: string | JsonObject) {
  return sha256(canonicalDatabaseSource(source))
}

export async function playerDatabaseSyncHash(source: string | JsonObject) {
  return sha256(canonicalDatabaseSource(source, { includeSelection: false }))
}

export async function createRemoteBackupEnvelope(
  databaseSource: string,
  {
    deviceId = createId(),
    parentSnapshotId = null,
  }: { deviceId?: string; parentSnapshotId?: string | null } = {},
): Promise<RemoteBackupEnvelope> {
  const database = JSON.parse(databaseSource) as BackupDatabase
  delete database.selectedDeckId
  const [contentHash, databaseHash] = await Promise.all([
    playerDatabaseContentHash(database),
    playerDatabaseSyncHash(database),
  ])
  return {
    format: REMOTE_BACKUP_FORMAT,
    version: REMOTE_BACKUP_VERSION,
    snapshotId: createId(),
    parentSnapshotId,
    deviceId,
    savedAt: new Date().toISOString(),
    contentHash,
    databaseHash,
    database,
  }
}

export async function parseRemoteBackupEnvelope(
  source: string | unknown,
): Promise<RemoteBackupEnvelope> {
  let envelope: unknown
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

  const [contentHash, databaseHash] = await Promise.all([
    playerDatabaseContentHash(envelope.database),
    playerDatabaseSyncHash(envelope.database),
  ])
  if (contentHash !== envelope.contentHash) {
    throw new Error('The cloud backup failed its integrity check.')
  }
  return {
    ...(envelope as unknown as RemoteBackupEnvelope),
    contentHash,
    databaseHash,
  }
}

export function decideRemoteBackupAction({
  lastSyncedHash = '',
  localHash,
  remoteHash,
}: {
  lastSyncedHash?: string
  localHash: string
  remoteHash: string
}): BackupAction {
  if (localHash === remoteHash) return 'synchronized'
  if (lastSyncedHash && localHash === lastSyncedHash) return 'restore-remote'
  if (lastSyncedHash && remoteHash === lastSyncedHash) return 'upload-local'
  return 'conflict'
}

function storedString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeRemoteBackupMetadata(value: unknown): RemoteBackupMetadata | null {
  if (!isObject(value)) return null
  const lastRemoteVersion = storedString(value.lastRemoteVersion)
  const lastSnapshotId = storedString(value.lastSnapshotId)
  const lastSyncedDatabaseHash = storedString(value.lastSyncedDatabaseHash)
  const lastSyncedHash = storedString(value.lastSyncedHash)
  const connectionEnabled = typeof value.connectionEnabled === 'boolean'
    ? value.connectionEnabled
    : Boolean(
        lastRemoteVersion ||
        lastSnapshotId ||
        lastSyncedDatabaseHash ||
        lastSyncedHash
      )
  return {
    connectionEnabled,
    deviceId: storedString(value.deviceId) || createId(),
    lastRemoteVersion,
    lastSnapshotId,
    lastSyncedDatabaseHash,
    lastSyncedHash,
    pendingOverride: value.pendingOverride === true,
    providerId: storedString(value.providerId),
  }
}

export function loadRemoteBackupMetadata(storage?: StorageLike | null) {
  try {
    const value = JSON.parse(storage?.getItem(REMOTE_BACKUP_STORAGE_KEY) ?? '')
    return normalizeRemoteBackupMetadata(value)
  } catch {
    return null
  }
}

function initialMetadata(storage: StorageLike | null | undefined, providerId: string) {
  return loadRemoteBackupMetadata(storage) ?? {
    connectionEnabled: false,
    deviceId: createId(),
    lastRemoteVersion: '',
    lastSnapshotId: '',
    lastSyncedDatabaseHash: '',
    lastSyncedHash: '',
    pendingOverride: false,
    providerId,
  }
}

const MAX_LEGACY_SELECTION_MIGRATION_BYTES = 64 * 1024 * 1024

async function legacySelectionMatchesCheckpoint(
  source: string | JsonObject,
  checkpointHash: string,
) {
  let database: unknown
  try {
    database = typeof source === 'string' ? JSON.parse(source) : source
  } catch {
    return false
  }
  if (!isObject(database) || !Array.isArray(database.decks)) return false

  const selections = [
    database.selectedDeckId ?? null,
    null,
    ...database.decks.map((record) => record?.id),
  ]
  const checked = new Set()
  let hashedBytes = 0
  for (const selectedDeckId of selections) {
    if (
      (selectedDeckId !== null && typeof selectedDeckId !== 'string') ||
      checked.has(selectedDeckId)
    ) {
      continue
    }
    checked.add(selectedDeckId)
    const candidate = { ...database, selectedDeckId }
    const canonicalSource = canonicalDatabaseSource(candidate)
    hashedBytes += new TextEncoder().encode(canonicalSource).byteLength
    if (hashedBytes > MAX_LEGACY_SELECTION_MIGRATION_BYTES) return false
    if (await sha256(canonicalSource) === checkpointHash) return true
  }
  return false
}

export class RemoteBackupController<TDatabase = unknown> {
  decodeDatabase: (source: string) => TDatabase
  onRestore: (database: TDatabase) => void | Promise<void>
  provider: RemoteBackupProvider
  storage: StorageLike | null | undefined
  writeDelay: number
  metadata: RemoteBackupMetadata
  state: RemoteBackupState
  listeners: Set<() => void>
  localSource: string
  localFingerprint: string
  remote: RemoteBackupFile | null
  conflictEnvelope: RemoteBackupEnvelope | null
  writeTimer: ReturnType<typeof globalThis.setTimeout> | null
  writeChain: Promise<void>
  metadataWriteChain: Promise<void>
  connectionPromise: Promise<void> | null
  automaticReconnectAttempted: boolean
  providerMetadataLoaded: boolean

  constructor({
    decodeDatabase,
    onRestore,
    provider,
    storage,
    writeDelay = 2000,
  }: RemoteBackupControllerOptions<TDatabase>) {
    this.decodeDatabase = decodeDatabase
    this.onRestore = onRestore
    this.provider = provider
    this.storage = storage
    this.writeDelay = writeDelay
    this.metadata = initialMetadata(storage, provider.id)
    const rememberedConnection =
      this.metadata.connectionEnabled &&
      this.metadata.providerId === provider.id
    this.state = {
      ...EMPTY_STATE,
      reconnectAvailable:
        rememberedConnection || provider.supportsStartupReconnect === true,
    }
    this.listeners = new Set()
    this.localSource = ''
    this.localFingerprint = ''
    this.remote = null
    this.conflictEnvelope = null
    this.writeTimer = null
    this.writeChain = Promise.resolve()
    this.metadataWriteChain = Promise.resolve()
    this.connectionPromise = null
    this.automaticReconnectAttempted = false
    this.providerMetadataLoaded = false
  }

  getState = () => this.state

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  updateState(next: Partial<RemoteBackupState>) {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((listener) => listener())
  }

  persistMetadata() {
    this.metadata.providerId = this.provider.id
    this.storage?.setItem(
      REMOTE_BACKUP_STORAGE_KEY,
      JSON.stringify(this.metadata),
    )
    if (typeof this.provider.persistMetadata !== 'function') {
      return Promise.resolve()
    }
    const metadata = { ...this.metadata }
    const persistProviderMetadata = this.provider.persistMetadata
    this.metadataWriteChain = this.metadataWriteChain
      .then(() => persistProviderMetadata(metadata))
      .catch((error) => {
        console.warn('Google Drive sync metadata could not be persisted:', error)
      })
    return this.metadataWriteChain
  }

  async loadProviderMetadata() {
    if (
      this.providerMetadataLoaded ||
      typeof this.provider.loadMetadata !== 'function'
    ) {
      return
    }
    this.providerMetadataLoaded = true
    const metadata = normalizeRemoteBackupMetadata(
      await this.provider.loadMetadata(),
    )
    if (metadata?.providerId === this.provider.id) {
      this.metadata = metadata
      this.storage?.setItem(
        REMOTE_BACKUP_STORAGE_KEY,
        JSON.stringify(this.metadata),
      )
    }
  }

  setPendingOverride(value: boolean) {
    this.metadata.pendingOverride = value
    this.persistMetadata()
  }

  async connect(
    localSource: string,
    { interactive = true }: { interactive?: boolean } = {},
  ) {
    if (this.connectionPromise) return this.connectionPromise
    this.connectionPromise = this.connectOnce(localSource, { interactive })
    try {
      return await this.connectionPromise
    } finally {
      this.connectionPromise = null
    }
  }

  async resolveLastSyncedDatabaseHash(
    localSource: string,
    localHash: string,
    localDatabaseHash: string,
    envelope: RemoteBackupEnvelope,
  ) {
    if (this.metadata.lastSyncedDatabaseHash) {
      return this.metadata.lastSyncedDatabaseHash
    }
    const checkpointHash = this.metadata.lastSyncedHash
    if (!checkpointHash) return ''

    const localMatches = localHash === checkpointHash ||
      await legacySelectionMatchesCheckpoint(localSource, checkpointHash)
    const databaseHash = localMatches
      ? localDatabaseHash
      : envelope.contentHash === checkpointHash
        ? envelope.databaseHash
        : ''
    if (databaseHash) {
      this.metadata.lastSyncedDatabaseHash = databaseHash
      await this.persistMetadata()
    }
    return databaseHash
  }

  async connectOnce(localSource: string, { interactive }: { interactive: boolean }) {
    this.localSource = localSource
    this.localFingerprint = canonicalDatabaseSource(localSource, {
      includeSelection: false,
    })
    this.updateState({ error: '', status: 'connecting' })
    try {
      await this.loadProviderMetadata()
      const previouslyAuthorized =
        this.metadata.connectionEnabled &&
        this.metadata.providerId === this.provider.id
      await this.provider.connect({ interactive, previouslyAuthorized })
      this.metadata.connectionEnabled = true
      await this.persistMetadata()
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
      const [localHash, localDatabaseHash] = await Promise.all([
        playerDatabaseContentHash(localSource),
        playerDatabaseSyncHash(localSource),
      ])
      const lastSyncedDatabaseHash = await this.resolveLastSyncedDatabaseHash(
        localSource,
        localHash,
        localDatabaseHash,
        envelope,
      )
      const action = decideRemoteBackupAction({
        lastSyncedHash: lastSyncedDatabaseHash,
        localHash: localDatabaseHash,
        remoteHash: envelope.databaseHash,
      })
      await this.applyAction(action, envelope, localSource)
    } catch (error) {
      const needsInteraction =
        !interactive &&
        isObject(error) &&
        (error as ErrorWithCode).code === 'reauthorization_required'
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

  reconnect(localSource: string) {
    const rememberedConnection =
      this.metadata.connectionEnabled &&
      this.metadata.providerId === this.provider.id
    const canReconnect =
      !this.automaticReconnectAttempted &&
      this.provider.supportsAutomaticReconnect === true &&
      (rememberedConnection || this.provider.supportsStartupReconnect === true)
    if (!canReconnect) return undefined
    this.automaticReconnectAttempted = true
    return this.connect(localSource, { interactive: false })
  }

  async applyAction(
    action: BackupAction,
    envelope: RemoteBackupEnvelope,
    localSource: string,
  ) {
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
    await this.recordSynchronized(envelope)
  }

  async recordSynchronized(envelope: RemoteBackupEnvelope) {
    this.localFingerprint = canonicalDatabaseSource(envelope.database, {
      includeSelection: false,
    })
    this.metadata.lastRemoteVersion = this.remote?.version ?? ''
    this.metadata.lastSnapshotId = envelope.snapshotId
    this.metadata.lastSyncedDatabaseHash = envelope.databaseHash
    this.metadata.lastSyncedHash = envelope.contentHash
    this.metadata.pendingOverride = false
    await this.persistMetadata()
    this.conflictEnvelope = null
    this.updateState({
      conflict: null,
      error: '',
      lastSavedAt: envelope.savedAt,
      status: 'saved',
    })
  }

  async restoreEnvelope(envelope: RemoteBackupEnvelope) {
    const backup = this.decodeDatabase(JSON.stringify(envelope.database))
    await this.onRestore(backup)
    await this.recordSynchronized(envelope)
  }

  queue(localSource: string, { force = false }: { force?: boolean } = {}) {
    this.localSource = localSource
    const fingerprint = canonicalDatabaseSource(localSource, {
      includeSelection: false,
    })
    if (!force && fingerprint === this.localFingerprint) return undefined
    this.localFingerprint = fingerprint
    if (force) this.setPendingOverride(true)
    if (
      !this.state.connected ||
      (this.state.status === 'conflict' && !force)
    ) {
      if (force) this.updateState({ status: 'pending' })
      return
    }

    if (this.writeTimer !== null) globalThis.clearTimeout(this.writeTimer)
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

  async backupNow(localSource: string) {
    this.localSource = localSource
    if (this.writeTimer !== null) globalThis.clearTimeout(this.writeTimer)
    this.writeChain = this.writeChain.then(
      () => this.save(localSource),
      () => this.save(localSource),
    )
    return this.writeChain
  }

  async save(localSource: string, { force = false }: { force?: boolean } = {}) {
    if (!this.state.connected) {
      if (force) this.setPendingOverride(true)
      return
    }
    this.updateState({ error: '', status: 'saving' })
    try {
      const [localHash, localDatabaseHash] = await Promise.all([
        playerDatabaseContentHash(localSource),
        playerDatabaseSyncHash(localSource),
      ])
      const matchesCheckpoint = this.metadata.lastSyncedDatabaseHash
        ? localDatabaseHash === this.metadata.lastSyncedDatabaseHash
        : localHash === this.metadata.lastSyncedHash
      if (!force && matchesCheckpoint) {
        this.updateState({ error: '', status: 'saved' })
        return
      }
      const envelope = await createRemoteBackupEnvelope(localSource, {
        deviceId: this.metadata.deviceId,
        parentSnapshotId: this.metadata.lastSnapshotId || null,
      })
      this.remote = await this.provider.save(JSON.stringify(envelope), {
        expectedSnapshotId: this.metadata.lastSnapshotId,
        expectedVersion: this.metadata.lastRemoteVersion,
        force,
      })
      await this.recordSynchronized(envelope)
    } catch (error) {
      await this.handleSaveError(error, force)
    }
  }

  async handleSaveError(error: unknown, force: boolean) {
    if (isObject(error) && (error as ErrorWithCode).code === 'remote_conflict') {
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

  async resolveConflict(choice: 'local' | 'remote') {
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
    if (this.writeTimer !== null) globalThis.clearTimeout(this.writeTimer)
    try {
      await this.provider.disconnect()
    } finally {
      this.metadata.connectionEnabled = false
      await this.persistMetadata()
      this.remote = null
      this.conflictEnvelope = null
      this.updateState({ ...EMPTY_STATE })
    }
  }

  destroy() {
    if (this.writeTimer !== null) globalThis.clearTimeout(this.writeTimer)
    this.listeners.clear()
  }
}
