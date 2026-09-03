import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { createDesktopGoogleDriveBackupProvider } from './desktop-google-drive-backup-provider.js'
import { createGoogleDriveBackupProvider } from './google-drive-backup-provider.js'
import { createGoogleDriveCodeBackupProvider } from './google-drive-code-backup-provider.js'
import {
  RemoteBackupController,
  type RemoteBackupProvider,
  type RemoteBackupState,
} from './remote-backup.js'
import type { StorageLike } from '../../types/persistence.js'

export type RemoteBackupHookState = Omit<RemoteBackupState, 'status'> & {
  status: RemoteBackupState['status'] | 'unavailable'
}

export function useRemoteBackup<TDatabase>({
  clientId,
  decodeDatabase,
  desktopAvailable = false,
  desktopRuntime = false,
  enabled,
  onRestore,
  storage,
  webAuthorization = 'token',
}: {
  clientId: string
  decodeDatabase(source: string): TDatabase
  desktopAvailable?: boolean
  desktopRuntime?: boolean
  enabled: boolean
  onRestore(database: TDatabase): void | Promise<void>
  storage?: StorageLike | null
  webAuthorization?: 'token' | 'broker'
}) {
  const provider = useMemo(
    () => {
      if (!enabled) return null
      if (desktopRuntime) {
        return desktopAvailable
          ? createDesktopGoogleDriveBackupProvider() as RemoteBackupProvider
          : null
      }
      if (!clientId) return null
      return webAuthorization === 'broker'
        ? createGoogleDriveCodeBackupProvider({ clientId }) as RemoteBackupProvider
        : createGoogleDriveBackupProvider({ clientId }) as RemoteBackupProvider
    },
    [clientId, desktopAvailable, desktopRuntime, enabled, webAuthorization],
  )
  const controller = useMemo(
    () => provider
      ? new RemoteBackupController({
          decodeDatabase,
          onRestore,
          provider,
          storage,
        })
      : null,
    [decodeDatabase, onRestore, provider, storage],
  )
  const emptyState = useMemo(
    (): RemoteBackupHookState => ({
      connected: false,
      conflict: null,
      error: '',
      lastSavedAt: null,
      reconnectAvailable: false,
      status: 'unavailable',
    }),
    [],
  )
  const state = useSyncExternalStore(
    controller?.subscribe ?? (() => () => {}),
    controller?.getState ?? (() => emptyState),
  )

  useEffect(() => () => controller?.destroy(), [controller])

  return {
    ...state,
    available: Boolean(controller),
    backupNow: (source: string) => controller?.backupNow(source),
    connect: (source: string) => controller?.connect(source),
    disconnect: () => controller?.disconnect(),
    queue: (source: string, options?: { force?: boolean }) => controller?.queue(source, options),
    reconnect: (source: string) => controller?.reconnect(source),
    resolveConflict: (choice: 'local' | 'remote') => controller?.resolveConflict(choice),
  }
}
