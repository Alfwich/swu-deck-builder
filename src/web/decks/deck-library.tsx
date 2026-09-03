import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'

import {
  getAspectIcon,
  getDeckAspectGradient,
  getDeckAspectIcons,
} from './deck-aspects.js'
import type { SortDirection } from './deck-sorting.js'
import type { Deck, DeckRecord } from '../types/deck.js'
import type { PendingHistoryDiscard } from './use-history-discard.js'

type CustomDeckStyle = CSSProperties & Record<`--${string}`, string>

function RenameIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M4 20h4.25L19.6 8.65a2 2 0 0 0 0-2.83l-1.42-1.42a2 2 0 0 0-2.83 0L4 15.75V20Zm11.1-13.85 2.75 2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function DeckAspectBadges({ deck }: { deck: Deck }) {
  const icons = getDeckAspectIcons(deck)

  if (icons.length === 0) {
    return null
  }

  return (
    <span
      className="deck-library__aspects"
      aria-label={`Deck aspects: ${icons.map((icon) => icon.name).join(', ')}`}
    >
      {icons.map((icon, index) => (
        <img
          alt=""
          aria-hidden="true"
          key={`${icon.name}-${index}`}
          src={icon.src}
          title={icon.name}
        />
      ))}
    </span>
  )
}

function SortDirectionControl({
  direction,
  label,
  onChange,
}: {
  direction: SortDirection
  label: string
  onChange(direction: SortDirection): void
}) {
  return (
    <div
      className="draw-deck-sort__group"
      role="group"
      aria-label={`Sort by ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      <button
        type="button"
        aria-label={
          direction === 'asc'
            ? `Clear ascending ${label.toLowerCase()} sort`
            : `Sort by ${label.toLowerCase()} ascending`
        }
        aria-pressed={direction === 'asc'}
        onClick={() => onChange(direction === 'asc' ? 'none' : 'asc')}
      >
        ASC
      </button>
      <button
        type="button"
        aria-label={
          direction === 'desc'
            ? `Clear descending ${label.toLowerCase()} sort`
            : `Sort by ${label.toLowerCase()} descending`
        }
        aria-pressed={direction === 'desc'}
        onClick={() => onChange(direction === 'desc' ? 'none' : 'desc')}
      >
        DESC
      </button>
    </div>
  )
}

export function DrawDeckSortControls({
  aspects,
  costDirection,
  onOwnershipChange,
  onAspectChange,
  onCostChange,
  onSetChange,
  ownershipVisible,
  priorityAspect,
  setDirection,
}: {
  aspects: string[]
  costDirection: SortDirection
  onOwnershipChange(visible: boolean): void
  onAspectChange(aspect: string | null): void
  onCostChange(direction: SortDirection): void
  onSetChange(direction: SortDirection): void
  ownershipVisible: boolean
  priorityAspect: string | null
  setDirection: SortDirection
}) {
  return (
    <div className="draw-deck-sort" aria-label="Draw deck controls">
      <button
        className="draw-deck-ownership-toggle"
        type="button"
        aria-label={
          ownershipVisible
            ? 'Hide card ownership indicators'
            : 'Show card ownership indicators'
        }
        aria-pressed={ownershipVisible}
        onClick={() => onOwnershipChange(!ownershipVisible)}
      >
        <span aria-hidden="true" />
        Owned
      </button>
      <SortDirectionControl
        direction={setDirection}
        label="Set"
        onChange={onSetChange}
      />
      <SortDirectionControl
        direction={costDirection}
        label="Cost"
        onChange={onCostChange}
      />

      {aspects.length > 0 && (
        <div
          className="draw-deck-sort__group is-aspects"
          role="group"
          aria-label="Prioritize an aspect"
        >
          <span>Aspect</span>
          {aspects.map((aspect) => {
            const icon = getAspectIcon(aspect)
            const isSelected = priorityAspect === aspect

            return (
              <button
                type="button"
                aria-label={
                  isSelected
                    ? `Clear ${aspect} priority`
                    : `Prioritize ${aspect}`
                }
                aria-pressed={isSelected}
                key={aspect}
                title={
                  isSelected
                    ? `Clear ${aspect} priority`
                    : `${aspect} first`
                }
                onClick={() => onAspectChange(isSelected ? null : aspect)}
              >
                {icon ? <img src={icon.src} alt="" aria-hidden="true" /> : aspect}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DeleteDeckDialog({
  record,
  onCancel,
  onConfirm,
}: {
  record: DeckRecord
  onCancel(): void
  onConfirm(id: string): void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      className="agent-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel()
        }
      }}
    >
      <section
        className="agent-dialog delete-deck-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-deck-dialog-title"
        aria-describedby="delete-deck-dialog-description"
      >
        <h2 id="delete-deck-dialog-title">Delete deck?</h2>
        <p
          className="agent-dialog__description"
          id="delete-deck-dialog-description"
        >
          Are you sure you want to delete <strong>{record.name}</strong>? This
          removes the deck and its complete history from this browser and cannot
          be undone.
        </p>
        <div className="agent-dialog__actions">
          <button
            autoFocus
            className="copy-button"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="delete-deck-dialog__confirm"
            type="button"
            onClick={() => onConfirm(record.id)}
          >
            Delete deck
          </button>
        </div>
      </section>
    </div>
  )
}

export function DiscardDeckHistoryDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingHistoryDiscard
  onCancel(): void
  onConfirm(): void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      className="agent-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        className="agent-dialog history-discard-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="history-discard-dialog-title"
        aria-describedby="history-discard-dialog-description"
      >
        <p className="eyebrow">Deck history</p>
        <h2 id="history-discard-dialog-title">Discard newer history?</h2>
        <p
          className="agent-dialog__description"
          id="history-discard-dialog-description"
        >
          You are editing an older version of <strong>{pending.deckName}</strong>.
          Applying this change will permanently discard{' '}
          <strong>
            {pending.count.toLocaleString()} newer history{' '}
            {pending.count === 1 ? 'entry' : 'entries'}
          </strong>.
        </p>
        <div className="agent-dialog__actions">
          <button
            autoFocus
            className="copy-button"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="history-discard-dialog__confirm"
            type="button"
            onClick={onConfirm}
          >
            Discard newer history and apply
          </button>
        </div>
      </section>
    </div>
  )
}

export function DeckLibrary({
  records,
  selectedId,
  persistenceMode,
  persistenceState,
  onSelect,
  onRename,
  onDelete,
}: {
  records: DeckRecord[]
  selectedId: string | null
  persistenceMode: 'browser' | 'database'
  persistenceState: 'loading' | 'saving' | 'saved' | 'error'
  onSelect(id: string): void
  onRename(id: string, name: string): void
  onDelete(id: string): void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeckRecord | null>(null)

  function beginRename(record: DeckRecord) {
    setEditingId(record.id)
    setDraftName(record.name)
    setRenameError('')
  }

  function cancelRename() {
    setEditingId(null)
    setDraftName('')
    setRenameError('')
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId) return

    try {
      onRename(editingId, draftName)
      cancelRename()
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : 'The deck could not be renamed.',
      )
    }
  }

  return (
    <>
      <aside className="deck-library" aria-label="Saved decks">
      <header className="deck-library__header">
        <h2>Decks</h2>
        {persistenceMode === 'database' && (
          <span
            className={`deck-library__persistence is-${persistenceState}`}
            aria-live="polite"
          >
            <span aria-hidden="true" />
            {persistenceState === 'loading'
              ? 'Loading database'
              : persistenceState === 'saving'
                ? 'Saving'
                : persistenceState === 'saved'
                  ? 'Database saved'
                  : 'Database error'}
          </span>
        )}
      </header>

      <div className="deck-library__list">
        {records.map((record) =>
          editingId === record.id ? (
            <form
              className="deck-library__rename"
              key={record.id}
              onSubmit={submitRename}
            >
              <input
                autoFocus
                aria-label={`New name for ${record.name}`}
                maxLength={100}
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value)
                  setRenameError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    cancelRename()
                  }
                }}
              />
              <button type="submit" aria-label="Save deck name" title="Save name">
                ✓
              </button>
              <button
                type="button"
                aria-label="Cancel rename"
                title="Cancel"
                onClick={cancelRename}
              >
                ×
              </button>
            </form>
          ) : (
            <div
              className={`deck-library__row${
                record.id === selectedId ? ' is-selected' : ''
              }`}
              key={record.id}
              style={{
                '--deck-aspect-gradient': getDeckAspectGradient(record.deck),
              } as CustomDeckStyle}
            >
              <button
                className="deck-library__select"
                type="button"
                aria-pressed={record.id === selectedId}
                onClick={() => onSelect(record.id)}
              >
                <span className="deck-library__name" title={record.name}>
                  {record.name}
                </span>
                <DeckAspectBadges deck={record.deck} />
              </button>
              <span className="deck-library__actions">
                <button
                  className="deck-library__rename-button"
                  type="button"
                  aria-label={`Rename ${record.name}`}
                  title="Rename deck"
                  onClick={() => beginRename(record)}
                >
                  <RenameIcon />
                </button>
                <button
                  className="deck-library__delete-button"
                  type="button"
                  aria-label={`Delete ${record.name}`}
                  title="Delete deck"
                  onClick={() => setDeleteTarget(record)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            </div>
          ),
        )}
      </div>

      {renameError && (
        <p className="deck-library__error" role="alert">
          {renameError}
        </p>
      )}
      </aside>

      {deleteTarget && (
        <DeleteDeckDialog
          record={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={(id) => {
            onDelete(id)
            setDeleteTarget(null)
          }}
        />
      )}
    </>
  )
}
