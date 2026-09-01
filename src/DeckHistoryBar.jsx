import { useEffect, useRef } from 'react'

import { deckHistoryShortcutDirection } from './deck-history.js'

const STARTING_ENTRIES = [{ label: 'Starting deck' }]
const NOOP = () => {}

function historyPositionLabel(position, entry) {
  return `Position ${position}: ${entry.label}`
}

function isEditableTarget(target) {
  return target instanceof Element && (
    target.matches('input, textarea, select') ||
    target.closest('[contenteditable]:not([contenteditable="false"])')
  )
}

function cardPreviewHandlers(card, onHidePreview, onPreviewCard) {
  return {
    onBlur: onHidePreview,
    onFocus: (event) => onPreviewCard(card, event),
    onPointerEnter: (event) => onPreviewCard(card, event),
    onPointerMove: (event) => onPreviewCard(card, event),
    onPointerLeave: (event) => {
      if (event.currentTarget === document.activeElement) {
        onPreviewCard(card, event)
      } else {
        onHidePreview()
      }
    },
  }
}

function historyEntryState(index, position) {
  if (index === position) return 'current'
  return index < position ? 'past' : 'future'
}

function historyCardClassName(changeKind, isHorizontal, showsCard) {
  if (!showsCard) return undefined
  return `is-card is-${changeKind}${isHorizontal ? ' is-horizontal' : ''}`
}

function DeckHistoryEntry({
  activeTickRef,
  entry,
  index,
  onHidePreview,
  onNavigate,
  onPreviewCard,
  position,
}) {
  const isCurrent = index === position
  const state = historyEntryState(index, position)
  const label = historyPositionLabel(index, entry)
  const card = index > 0 ? entry.visual?.card : null
  const changeKind = entry.visual?.kind
  const isHorizontal = ['Leader', 'Base'].includes(card?.type)
  const showsCard = Boolean(card?.url && changeKind)
  const previewHandlers = showsCard
    ? cardPreviewHandlers(card, onHidePreview, onPreviewCard)
    : {}

  return (
    <li
      className={`is-${state}${index === 0 ? ' is-start' : ''}`}
    >
      <button
        {...previewHandlers}
        className={historyCardClassName(changeKind, isHorizontal, showsCard)}
        type="button"
        aria-current={isCurrent ? 'step' : undefined}
        aria-label={label}
        ref={isCurrent ? activeTickRef : null}
        title={label}
        onClick={() => onNavigate(index)}
      >
        {showsCard ? (
          <img
            src={card.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable="false"
          />
        ) : (
          <span aria-hidden="true">{index}</span>
        )}
      </button>
    </li>
  )
}

export default function DeckHistoryBar({
  history,
  onHidePreview = NOOP,
  onNavigate,
  onPreviewCard = NOOP,
}) {
  const activeTickRef = useRef(null)

  useEffect(() => {
    activeTickRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [history?.position])

  useEffect(() => {
    function handleKeyDown(event) {
      const direction = deckHistoryShortcutDirection(event)
      if (!history || direction === 0 || isEditableTarget(event.target)) {
        return
      }

      const nextPosition = history.position + direction
      if (nextPosition < 0 || nextPosition >= history.entries.length) {
        return
      }

      event.preventDefault()
      onNavigate(nextPosition)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [history, onNavigate])

  const hasHistory = Boolean(history?.entries.length)
  const entries = hasHistory ? history.entries : STARTING_ENTRIES
  const position = hasHistory ? history.position : 0
  return (
    <nav className="deck-history" aria-label="Deck history">
      <ol className="deck-history__timeline" aria-label="Deck versions">
        {entries.map((entry, index) => (
          <DeckHistoryEntry
            activeTickRef={activeTickRef}
            entry={entry}
            index={index}
            key={`${index}-${entry.label}`}
            position={position}
            onHidePreview={onHidePreview}
            onNavigate={onNavigate}
            onPreviewCard={onPreviewCard}
          />
        ))}
      </ol>
    </nav>
  )
}
