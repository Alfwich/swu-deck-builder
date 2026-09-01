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

function historyCardClassName(
  changeKind,
  isHorizontal,
  showsCard,
  showsStack,
) {
  if (!showsCard) return undefined
  return `is-card is-${changeKind}${isHorizontal ? ' is-horizontal' : ''}${
    showsStack ? ' is-stack' : ''
  }`
}

function isHorizontalCard(card) {
  return ['Leader', 'Base'].includes(card?.type)
}

function historyVisualCards(entry, index) {
  if (index === 0) return []
  if (Array.isArray(entry.visual?.cards)) {
    return entry.visual.cards.slice(0, 3)
  }
  if (entry.visual?.card) {
    return [{ card: entry.visual.card, kind: entry.visual.kind }]
  }
  return []
}

function DeckHistoryCardStack({ isHorizontal, visualCards }) {
  return (
    <span
      className={`deck-history-card-stack${
        isHorizontal ? ' is-horizontal' : ''
      }`}
      aria-hidden="true"
    >
      {[...visualCards].reverse().map((visual, visualIndex) => (
        <span
          className={`deck-history-card-stack__card is-${visual.kind}${
            isHorizontalCard(visual.card) ? ' is-horizontal' : ''
          }`}
          key={`${visual.card?.id ?? visual.card?.url}-${visual.kind}-${visualIndex}`}
        >
          <img
            src={visual.card.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable="false"
          />
        </span>
      ))}
    </span>
  )
}

function DeckHistoryEntry({
  activeTickRef,
  entry,
  index,
  onHidePreview,
  onNavigate,
  onPreviewCard,
  onShowDetails,
  position,
}) {
  const isCurrent = index === position
  const state = historyEntryState(index, position)
  const label = historyPositionLabel(index, entry)
  const visualCards = historyVisualCards(entry, index)
  const card = visualCards[0]?.card ?? null
  const changeKind = entry.visual?.kind ?? visualCards[0]?.kind
  const isHorizontal = isHorizontalCard(card)
  const showsCard = Boolean(card?.url && changeKind)
  const showsStack = visualCards.length > 1
  const previewHandlers = showsCard && !showsStack
    ? cardPreviewHandlers(card, onHidePreview, onPreviewCard)
    : {}

  function handleClick() {
    onHidePreview()
    onNavigate(index)
    if (isCurrent && showsStack && entry.visual?.details) {
      onShowDetails(entry, index)
    }
  }

  return (
    <li
      className={`is-${state}${index === 0 ? ' is-start' : ''}`}
    >
      <button
        {...previewHandlers}
        className={historyCardClassName(
          changeKind,
          isHorizontal,
          showsCard,
          showsStack,
        )}
        type="button"
        aria-current={isCurrent ? 'step' : undefined}
        aria-label={label}
        ref={isCurrent ? activeTickRef : null}
        title={label}
        onClick={handleClick}
      >
        {showsStack ? (
          <DeckHistoryCardStack
            isHorizontal={isHorizontal}
            visualCards={visualCards}
          />
        ) : showsCard ? (
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
  onShowDetails = NOOP,
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
            onShowDetails={onShowDetails}
          />
        ))}
      </ol>
    </nav>
  )
}
