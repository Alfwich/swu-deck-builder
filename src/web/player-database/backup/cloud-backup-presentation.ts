type CloudBackupStatus =
  | 'saved'
  | 'saving'
  | 'checking'
  | 'pending'
  | 'conflict'
  | 'error'
  | 'idle'
  | 'connecting'
  | 'disconnected'
  | 'unavailable'

export function cloudBackupButtonLabel(
  status: CloudBackupStatus,
  reconnectAvailable = false,
) {
  if (status === 'saved') return 'Drive saved'
  if (status === 'saving' || status === 'checking') return 'Drive saving…'
  if (status === 'pending') return 'Drive pending'
  if (status === 'conflict') return 'Drive conflict'
  if (status === 'error') return 'Drive error'
  return reconnectAvailable ? 'Reconnect Drive' : 'Connect Drive'
}
