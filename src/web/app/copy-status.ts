export const COPY_STATUS_DISMISS_DELAY = 4000

export interface CopyStatus {
  type: 'success' | 'error' | 'info'
  message: string
  source?: string
  canUndo?: boolean
  autoDismiss?: boolean
}

export function getCopyStatusDismissDelay(status: CopyStatus | null) {
  if (!status || status.canUndo) {
    return null
  }

  return status.type === 'success' || status.autoDismiss
    ? COPY_STATUS_DISMISS_DELAY
    : null
}

export function clearStaleTcgplayerCopyStatus(status: CopyStatus | null) {
  return status?.source === 'tcgplayer' ? null : status
}
