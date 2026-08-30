export function cloudBackupButtonLabel(status) {
  if (status === 'saved') return 'Drive saved'
  if (status === 'saving' || status === 'checking') return 'Drive saving…'
  if (status === 'pending') return 'Drive pending'
  if (status === 'conflict') return 'Drive conflict'
  if (status === 'error') return 'Drive error'
  return 'Connect Drive'
}
