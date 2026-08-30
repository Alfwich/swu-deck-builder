export const COPY_STATUS_DISMISS_DELAY = 4000

export function getCopyStatusDismissDelay(status) {
  if (!status || status.canUndo) {
    return null
  }

  return status.type === 'success' || status.autoDismiss
    ? COPY_STATUS_DISMISS_DELAY
    : null
}

export function clearStaleTcgplayerCopyStatus(status) {
  return status?.source === 'tcgplayer' ? null : status
}
