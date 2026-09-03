import { useEffect } from 'react'

import { summarizeCardChanges } from '../deck-changes.js'
import { revealImage } from '../shared/image.js'

function CardChangeCard({ entry }) {
  const title = [entry.name, entry.subtitle].filter(Boolean).join(' — ')
  const isHorizontal = ['leader', 'secondLeader', 'base'].includes(entry.zone)

  return (
    <div className="card-change-card">
      <div
        className={`card-change-card__art${isHorizontal ? ' is-horizontal' : ''}`}
      >
        {entry.card?.url ? (
          <img
            src={entry.card.url}
            alt={title}
            loading="lazy"
            decoding="async"
            draggable="false"
            onLoad={revealImage}
          />
        ) : (
          <span aria-hidden="true">?</span>
        )}
      </div>
      <div className="card-change-card__details">
        <strong>{entry.name}</strong>
        {entry.subtitle && <span>{entry.subtitle}</span>}
        <small>{entry.id}</small>
      </div>
    </div>
  )
}

export function CardChangesDialog({
  eyebrow = 'Proposed deck update',
  onClose,
  proposal,
  subtitle = proposal.targetDeckName,
  title = 'Card changes',
}) {
  const changes = proposal.visualChanges
  const summary = summarizeCardChanges(changes)

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="agent-dialog-backdrop card-changes-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="card-changes-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-changes-title"
      >
        <header className="card-changes-dialog__header">
          <div>
            <span>{eyebrow}</span>
            <h2 id="card-changes-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close card changes">
            ×
          </button>
        </header>

        <div className="card-changes-dialog__summary">
          <span>{summary.replacements} replacements</span>
          <span>{summary.additions} additions</span>
          <span>{summary.removals} removals</span>
        </div>

        <div className="card-changes-dialog__content">
          {changes?.name && (
            <div className="card-change-name">
              <span>Deck name</span>
              <strong>{changes.name.from}</strong>
              <span aria-hidden="true">→</span>
              <strong>{changes.name.to}</strong>
            </div>
          )}

          {changes?.replacements.length > 0 && (
            <section className="card-change-section">
              <h3>Replacements</h3>
              <div className="card-change-list">
                {changes.replacements.map((change, index) => (
                  <article
                    className="card-change-line is-replacement"
                    key={`replacement-${change.zone}-${change.from.id}-${change.to.id}-${index}`}
                  >
                    <span className="card-change-line__zone">{change.zoneLabel}</span>
                    <CardChangeCard entry={change.from} />
                    <span className="card-change-line__arrow" aria-hidden="true">→</span>
                    <CardChangeCard entry={change.to} />
                    <strong className="card-change-line__quantity">×{change.count}</strong>
                  </article>
                ))}
              </div>
            </section>
          )}

          {changes?.additions.length > 0 && (
            <section className="card-change-section">
              <h3>Additions</h3>
              <div className="card-change-list">
                {changes.additions.map((change, index) => (
                  <article
                    className="card-change-line is-addition"
                    key={`addition-${change.zone}-${change.id}-${index}`}
                  >
                    <span className="card-change-line__sign" aria-hidden="true">+</span>
                    <CardChangeCard entry={change} />
                    <span className="card-change-line__zone">{change.zoneLabel}</span>
                    <strong className="card-change-line__quantity">×{change.count}</strong>
                  </article>
                ))}
              </div>
            </section>
          )}

          {changes?.removals.length > 0 && (
            <section className="card-change-section">
              <h3>Removals</h3>
              <div className="card-change-list">
                {changes.removals.map((change, index) => (
                  <article
                    className="card-change-line is-removal"
                    key={`removal-${change.zone}-${change.id}-${index}`}
                  >
                    <span className="card-change-line__sign" aria-hidden="true">−</span>
                    <CardChangeCard entry={change} />
                    <span className="card-change-line__zone">{change.zoneLabel}</span>
                    <strong className="card-change-line__quantity">×{change.count}</strong>
                  </article>
                ))}
              </div>
            </section>
          )}

          {summary.replacements === 0 &&
            summary.additions === 0 &&
            summary.removals === 0 &&
            !changes?.name && (
              <p className="card-changes-dialog__empty">No card changes were proposed.</p>
            )}
        </div>
      </section>
    </div>
  )
}
