import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { createGoogleDriveBackupProvider } from './google-drive-backup-provider.js'
import { RemoteBackupController } from './remote-backup.js'

export function useRemoteBackup({
  clientId,
  decodeDatabase,
  enabled,
  onRestore,
  storage,
}) {
  const provider = useMemo(
    () => enabled && clientId
      ? createGoogleDriveBackupProvider({ clientId })
      : null,
    [clientId, enabled],
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
    () => ({
      connected: false,
      conflict: null,
      error: '',
      lastSavedAt: null,
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
    backupNow: (source) => controller?.backupNow(source),
    connect: (source) => controller?.connect(source),
    disconnect: () => controller?.disconnect(),
    queue: (source, options) => controller?.queue(source, options),
    resolveConflict: (choice) => controller?.resolveConflict(choice),
  }
}
