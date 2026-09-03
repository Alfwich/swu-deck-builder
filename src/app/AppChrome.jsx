import {
  FAN_TOOL_NOTICE,
  formatApplicationVersion,
} from '../app-metadata.js'
import { cloudBackupButtonLabel } from '../cloud-backup-presentation.js'
import { TCGPLAYER_MASS_ENTRY_URL } from '../integrations/tcgplayer.js'

export function CardCascade({ cardFaces }) {
  return cardFaces.length > 0 ? (
    <div className="card-cascade" aria-hidden="true">
      <div className="card-cascade__grid">
        {Array.from({ length: 6 }, (_, repeatIndex) =>
          cardFaces.map((face, faceIndex) => (
            <div
              className="card-cascade__tile"
              key={`${face.url}-${repeatIndex}-${faceIndex}`}
            >
              <img
                src={face.url}
                alt=""
                draggable="false"
                decoding="async"
                onLoad={(event) =>
                  event.currentTarget.classList.add('is-loaded')
                }
              />
            </div>
          )),
        )}
      </div>
    </div>
  ) : null
}

export function SiteNav({
  catalogReady,
  databaseImportInputRef,
  deckExportDisabledReason,
  deckLibraryReady,
  desktopSettingsAvailable,
  remoteBackup,
  status,
  tcgplayerAllDecks,
  tcgplayerCopyDisabledReason,
  tcgplayerMissingOnly,
  topBarRef,
  onCloudBackupOpen,
  onCopySwudbDeck,
  onCopyTcgplayerDeck,
  onDatabaseExport,
  onDatabaseImport,
  onDesktopSettingsOpen,
  onImportDeckOpen,
  onNewDeck,
  onTcgplayerAllDecksChange,
  onTcgplayerMissingOnlyChange,
}) {
  return (
  <nav ref={topBarRef} className="site-nav" aria-label="Site navigation">
    <div className="site-nav__inner">
      <div className="site-nav__primary-actions">
        <div
          className="site-nav__group site-nav__database-actions"
          role="toolbar"
          aria-label="Database backup actions"
        >
          <span className="site-nav__group-label">DB</span>
          <div
            className="site-nav__split-action"
            role="group"
            aria-label="Database backup options"
          >
            <button
              className="site-nav__action"
              type="button"
              aria-label="Export database"
              disabled={!deckLibraryReady}
              onClick={onDatabaseExport}
            >
              Export
            </button>
            <button
              className="site-nav__action"
              type="button"
              aria-label="Import database"
              disabled={!deckLibraryReady || !catalogReady}
              onClick={() => databaseImportInputRef.current?.click()}
            >
              Import
            </button>
          </div>
          <input
            ref={databaseImportInputRef}
            className="site-nav__file-input"
            type="file"
            accept="application/json,.json"
            tabIndex={-1}
            onChange={onDatabaseImport}
          />
        </div>
        {remoteBackup.available && (
          <div className="site-nav__group site-nav__cloud-actions">
            <span className="site-nav__group-label">Cloud</span>
            <button
              className={`site-nav__action cloud-backup-button is-${remoteBackup.status}`}
              type="button"
              aria-haspopup="dialog"
              disabled={!deckLibraryReady}
              onClick={onCloudBackupOpen}
            >
              {cloudBackupButtonLabel(
                remoteBackup.status,
                remoteBackup.reconnectAvailable,
              )}
            </button>
          </div>
        )}
        <div
          className="site-nav__group site-nav__deck-actions"
          role="toolbar"
          aria-label="Deck actions"
        >
          <span className="site-nav__group-label">Deck actions</span>
          <div
            className="site-nav__split-action is-primary"
            role="group"
            aria-label="Create or import a deck"
          >
            <button
              className="site-nav__action is-primary"
              type="button"
              disabled={status !== 'success' || !catalogReady}
              onClick={onNewDeck}
            >
              {status === 'loading' ? 'Loading catalog…' : 'New Deck'}
            </button>
            <button
              className="site-nav__action"
              type="button"
              disabled={status !== 'success' || !catalogReady}
              onClick={onImportDeckOpen}
            >
              Import deck
            </button>
          </div>
          <button
            className="site-nav__action"
            type="button"
            disabled={Boolean(deckExportDisabledReason)}
            title={deckExportDisabledReason ?? undefined}
            onClick={onCopySwudbDeck}
          >
            Copy SWUDB JSON
          </button>
          <div
            className="site-nav__split-action"
            role="group"
            aria-label="TCGplayer copy options"
          >
            <button
              className="site-nav__action"
              type="button"
              disabled={Boolean(tcgplayerCopyDisabledReason)}
              title={tcgplayerCopyDisabledReason ?? undefined}
              onClick={onCopyTcgplayerDeck}
            >
              Copy TCGplayer list
            </button>
            <button
              className="site-nav__split-toggle"
              type="button"
              aria-pressed={tcgplayerMissingOnly}
              title="Subtract cards in your library from the copied list"
              onClick={() => onTcgplayerMissingOnlyChange((current) => !current)}
            >
              Missing only
            </button>
            <button
              className="site-nav__split-toggle"
              type="button"
              aria-pressed={tcgplayerAllDecks}
              title="Count cards needed across every saved deck"
              onClick={() => onTcgplayerAllDecksChange((current) => !current)}
            >
              All decks
            </button>
          </div>
        </div>
      </div>

      {desktopSettingsAvailable && (
        <div className="site-nav__group site-nav__external-links">
          <button
            className="site-nav__action"
            type="button"
            onClick={onDesktopSettingsOpen}
          >
            Desktop settings
          </button>
        </div>
      )}
    </div>
  </nav>  )
}

export function AppNotifications({
  copyStatus,
  deckError,
  deckPersistenceError,
  error,
  status,
}) {
  return status === 'error' || deckError || deckPersistenceError || copyStatus ? (
    <div className="app-notifications">
      {(status === 'error' || deckError || deckPersistenceError) && (
        <p className="app-notice is-error" role="alert">
          {deckPersistenceError || deckError || error}
        </p>
      )}
      {copyStatus && (
        <p
          className={`app-notice is-${copyStatus.type}`}
          role={copyStatus.type === 'error' ? 'alert' : 'status'}
        >
          {copyStatus.message}
        </p>
      )}
    </div>
  ) : null
}

export function AppFooter({ version }) {
  return (
  <footer className="app-footer">
    <strong>{formatApplicationVersion(version)}</strong>
    <nav className="app-footer__links" aria-label="Application links">
      <a className="app-footer__link" href="/privacy">
        Privacy
      </a>
      <a className="app-footer__link" href="/terms">
        Terms
      </a>
      <a
        className="app-footer__link"
        href="https://github.com/Alfwich/swu-deck-builder"
        target="_blank"
        rel="noopener noreferrer"
      >
        GitHub <span aria-hidden="true">↗</span>
      </a>
      <a
        className="app-footer__link"
        href="https://swudb.com/decks/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open SWUDB <span aria-hidden="true">↗</span>
      </a>
      <a
        className="app-footer__link"
        href={TCGPLAYER_MASS_ENTRY_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        TCGplayer Mass Entry <span aria-hidden="true">↗</span>
      </a>
    </nav>
    <span className="app-footer__notice">{FAN_TOOL_NOTICE}</span>
  </footer>  )
}
