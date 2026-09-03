import {
  useEffect,
  type Dispatch,
  type FormEventHandler,
  type SetStateAction,
} from 'react'
import type { PlayerDatabase } from '../types/persistence.js'

export function ImportDeckDialog({
  source,
  setSource,
  error,
  onClose,
  onSubmit,
}: {
  source: string
  setSource: Dispatch<SetStateAction<string>>
  error: string
  onClose(): void
  onSubmit: FormEventHandler<HTMLFormElement>
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="agent-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="agent-dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
      >
        <p className="eyebrow">SWUDB compatible</p>
        <h2 id="import-dialog-title">Import a deck</h2>
        <p className="agent-dialog__description">
          Paste an SWUDB JSON deck definition. Every card ID will be resolved
          against the catalog before the current deck is replaced.
        </p>

        <form onSubmit={onSubmit}>
          <label htmlFor="swudb-import-source">SWUDB JSON</label>
          <textarea
            id="swudb-import-source"
            autoFocus
            maxLength={100000}
            placeholder={'{\n  "metadata": { "name": "My deck" },\n  ...\n}'}
            required
            rows={12}
            spellCheck="false"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <div className="agent-dialog__prompt-meta">
            <span>{source.length.toLocaleString()} characters</span>
          </div>

          {error && (
            <p className="agent-dialog__error" role="alert">
              {error}
            </p>
          )}

          <div className="agent-dialog__actions">
            <button className="copy-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="generate-button"
              type="submit"
              disabled={!source.trim()}
            >
              Import deck
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function ImportDatabaseDialog({
  backup,
  fileName,
  onClose,
  onConfirm,
}: {
  backup: PlayerDatabase
  fileName: string
  onClose(): void
  onConfirm(): void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const collectionCopies = backup.collection.cards.reduce(
    (total, entry) => total + entry.count,
    0,
  )

  return (
    <div
      className="agent-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="agent-dialog database-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-import-dialog-title"
      >
        <p className="eyebrow">Database restore</p>
        <h2 id="database-import-dialog-title">Replace player data?</h2>
        <p className="agent-dialog__description">
          This validated backup will replace every saved deck and every card in
          the current collection, including their current deck histories. The
          histories contained in the backup will be restored instead. AI
          settings and chat history are not changed.
        </p>

        <dl className="database-import-dialog__summary">
          <div>
            <dt>Backup file</dt>
            <dd>{fileName}</dd>
          </div>
          <div>
            <dt>Exported</dt>
            <dd>{new Date(backup.exportedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Decks</dt>
            <dd>{backup.decks.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Collection</dt>
            <dd>{collectionCopies.toLocaleString()} cards</dd>
          </div>
        </dl>

        <div className="agent-dialog__actions">
          <button
            autoFocus
            className="copy-button"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="database-import-dialog__confirm"
            type="button"
            onClick={onConfirm}
          >
            Restore backup
          </button>
        </div>
      </section>
    </div>
  )
}

export function PendingDatabaseImportDialog({
  pending,
  onClose,
  onConfirm,
}: {
  pending: { backup: PlayerDatabase; fileName: string } | null
  onClose(): void
  onConfirm(): void
}) {
  if (!pending) return null
  return (
    <ImportDatabaseDialog
      backup={pending.backup}
      fileName={pending.fileName}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  )
}
