import { useEffect } from 'react'

function statusMessage(status, lastSavedAt, reconnectAvailable) {
  if (status === 'connecting') return 'Connecting to Google Drive…'
  if (status === 'checking') return 'Checking the Google Drive backup…'
  if (status === 'pending') return 'Local changes are waiting to be backed up.'
  if (status === 'saving') return 'Saving the player database to Google Drive…'
  if (status === 'saved' && lastSavedAt) {
    return `Backed up ${new Date(lastSavedAt).toLocaleString()}.`
  }
  if (status === 'saved') return 'The Google Drive backup is current.'
  if (reconnectAvailable) {
    return 'Reconnect Google Drive to resume automatic backups on this device.'
  }
  return 'Connect Google Drive to keep a remote copy of the player database.'
}

export function CloudBackupDialog({
  backup,
  onBackupNow,
  onClose,
  onConnect,
  onDisconnect,
  onResolveConflict,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const busy = ['checking', 'connecting', 'saving'].includes(backup.status)

  return (
    <div
      className="agent-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="agent-dialog cloud-backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-backup-dialog-title"
      >
        <p className="eyebrow">Optional cloud backup</p>
        <h2 id="cloud-backup-dialog-title">Google Drive backup</h2>
        <p className="agent-dialog__description">
          The local player database remains authoritative. Drive receives only
          saved decks, the selected deck, and the card collection.
        </p>

        {backup.status === 'conflict' ? (
          <div className="cloud-backup-dialog__conflict" role="alert">
            <strong>Choose which database to keep</strong>
            <p>
              This device and Google Drive both changed. The Drive copy contains{' '}
              {backup.conflict.deckCount.toLocaleString()} decks and was saved{' '}
              {new Date(backup.conflict.remoteSavedAt).toLocaleString()}.
            </p>
            <div className="agent-dialog__actions">
              <button
                className="copy-button"
                type="button"
                onClick={() => onResolveConflict('remote')}
              >
                Use Drive copy
              </button>
              <button
                className="generate-button"
                type="button"
                onClick={() => onResolveConflict('local')}
              >
                Keep this device
              </button>
            </div>
          </div>
        ) : (
          <p className={`cloud-backup-dialog__status is-${backup.status}`}>
            {statusMessage(
              backup.status,
              backup.lastSavedAt,
              backup.reconnectAvailable,
            )}
          </p>
        )}

        {backup.error && (
          <p className="agent-dialog__error" role="alert">
            {backup.error}
          </p>
        )}

        <p className="cloud-backup-dialog__privacy">
          SWU Deck Builder requests access only to its hidden application-data
          folder. Google credentials are not stored in the player database.
        </p>

        <div className="agent-dialog__actions">
          <button className="copy-button" type="button" onClick={onClose}>
            Close
          </button>
          {backup.connected ? (
            <>
              <button
                className="copy-button"
                type="button"
                disabled={busy || backup.status === 'conflict'}
                onClick={onBackupNow}
              >
                Back up now
              </button>
              <button
                className="cloud-backup-dialog__disconnect"
                type="button"
                disabled={busy}
                onClick={onDisconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button
                className="generate-button"
                type="button"
                disabled={busy}
                onClick={onConnect}
              >
                {backup.reconnectAvailable
                  ? 'Reconnect Google Drive'
                  : 'Connect Google Drive'}
              </button>
              {backup.reconnectAvailable && (
                <button
                  className="cloud-backup-dialog__disconnect"
                  type="button"
                  disabled={busy}
                  onClick={onDisconnect}
                >
                  Forget Drive backup
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
