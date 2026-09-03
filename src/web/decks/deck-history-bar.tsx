import {
  useEffect,
  useRef,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import { deckHistoryShortcutDirection } from './deck-history.js'
import type { PreviewEvent } from '../assistant/use-agent-card-preview.js'
import type { DeckCard } from '../types/catalog.js'
import type {
  DeckHistory,
  DeckHistoryEntry as DeckHistoryEntryModel,
  DeckHistoryVisualKind,
  HydratedHistoryVisualCard,
} from '../types/history.js'

const STARTING_ENTRIES: DeckHistoryEntryModel[] = [{ label: 'Starting deck' }]
const NOOP = () => {}

function historyPositionLabel(position: number, entry: DeckHistoryEntryModel) {
  return `Position ${position}: ${entry.label}`
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && (
    target.matches('input, textarea, select') ||
    target.closest('[contenteditable]:not([contenteditable="false"])')
  )
}

function cardPreviewHandlers(
  card: DeckCard,
  onHidePreview: () => void,
  onPreviewCard: (card: DeckCard, event: PreviewEvent) => void,
) {
  return {
    onBlur: onHidePreview,
    onFocus: (event: ReactFocusEvent<HTMLButtonElement>) =>
      onPreviewCard(card, event),
    onPointerEnter: (event: ReactPointerEvent<HTMLButtonElement>) =>
      onPreviewCard(card, event),
    onPointerLeave: onHidePreview,
  }
}

function historyEntryState(index: number, position: number) {
  if (index === position) return 'current'
  return index < position ? 'past' : 'future'
}

function historyCardClassName(
  changeKind: DeckHistoryVisualKind | undefined,
  isHorizontal: boolean,
  showsCard: boolean,
  showsStack: boolean,
) {
  if (!showsCard) return undefined
  return `is-card is-${changeKind}${isHorizontal ? ' is-horizontal' : ''}${
    showsStack ? ' is-stack' : ''
  }`
}

function isHorizontalCard(card: DeckCard | null | undefined) {
  return card?.type === 'Leader' || card?.type === 'Base'
}

function historyVisualCards(
  entry: DeckHistoryEntryModel,
  index: number,
): HydratedHistoryVisualCard[] {
  if (index === 0) return []
  if (Array.isArray(entry.visual?.cards)) {
    return entry.visual.cards.slice(0, 3)
  }
  if (entry.visual?.card) {
    return [{ card: entry.visual.card, kind: entry.visual.kind }]
  }
  return []
}

function DeckHistoryCardStack({
  isHorizontal,
  visualCards,
}: {
  isHorizontal: boolean
  visualCards: HydratedHistoryVisualCard[]
}) {
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
            src={visual.card.url ?? undefined}
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
}: {
  activeTickRef: RefObject<HTMLButtonElement | null>
  entry: DeckHistoryEntryModel
  index: number
  onHidePreview(): void
  onNavigate(position: number): void
  onPreviewCard(card: DeckCard, event: PreviewEvent): void
  onShowDetails(entry: DeckHistoryEntryModel, index: number): void
  position: number
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
    ? cardPreviewHandlers(card!, onHidePreview, onPreviewCard)
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
        data-agent-card-preview={showsCard && !showsStack ? 'true' : undefined}
        ref={isCurrent ? activeTickRef : null}
        title={showsCard ? undefined : label}
        onClick={handleClick}
      >
        {showsStack ? (
          <DeckHistoryCardStack
            isHorizontal={isHorizontal}
            visualCards={visualCards}
          />
        ) : showsCard ? (
          <img
            src={card?.url ?? undefined}
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
}: {
  history: DeckHistory | null
  onHidePreview?: () => void
  onNavigate(position: number): void
  onPreviewCard?: (card: DeckCard, event: PreviewEvent) => void
  onShowDetails?: (entry: DeckHistoryEntryModel, index: number) => void
}) {
  const activeTickRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeTickRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [history?.position])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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

  const entries = history?.entries.length ? history.entries : STARTING_ENTRIES
  const position = history?.entries.length ? history.position : 0
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
