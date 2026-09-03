import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  MAX_COLLECTION_CARD_COUNT,
  getCardCollectionCount,
} from './card-collection.js'
import { getCatalogCardId } from '../catalog/catalog.js'
import {
  createCardSearchIndexFromCards,
  fuzzySearchCards,
  type CardSearchEntry,
} from '../catalog/card-search.js'
import { analyzeCardCollection } from './collection-analysis.js'
import { getCollectionSetColor } from './collection-set-colors.js'
import type { Catalog, DeckCard, ReadonlyCardReferenceMap } from '../types/catalog.js'
import type { CardCollection } from '../types/collection.js'

const INITIAL_VISIBLE_CARD_COUNT = 60
const VISIBLE_CARD_INCREMENT = 60

type LibraryMode = 'owned' | 'all'
type CollectionAnalysis = ReturnType<typeof analyzeCardCollection>
type CollectionProgress = CollectionAnalysis['setProgress'][number]

interface CollectionCardItem {
  card: DeckCard | null
  cardId: string
  count: number
}

type CollectionSetStyle = CSSProperties & {
  '--collection-set-color': string
}

const LIBRARY_MODES: Array<{ id: LibraryMode; label: string }> = [
  { id: 'owned', label: 'My library' },
  { id: 'all', label: 'All cards' },
]

function cardTitle(card: DeckCard | null, fallback = 'Unknown card') {
  return card
    ? [card.name, card.subtitle].filter(Boolean).join(' — ')
    : fallback
}

function compareCardItems(left: CollectionCardItem, right: CollectionCardItem) {
  return (
    String(left.card?.name ?? left.cardId).localeCompare(
      String(right.card?.name ?? right.cardId),
    ) ||
    String(left.card?.setCode ?? '').localeCompare(
      String(right.card?.setCode ?? ''),
    ) ||
    String(left.card?.cardNumber ?? '').localeCompare(
      String(right.card?.cardNumber ?? ''),
    )
  )
}

function CollectionProgressRing({
  active,
  progress,
  onSelect,
}: {
  active: boolean
  progress: CollectionProgress
  onSelect(): void
}) {
  const label = `${progress.setCode}: ${progress.owned} of ${progress.total} ${
    progress.checklistKind === 'standard' ? 'standard cards' : 'cards'
  } owned, ${progress.percentage}% complete`
  const setColor = getCollectionSetColor(progress.setCode)

  return (
    <button
      className={`collection-progress${active ? ' is-active' : ''}`}
      type="button"
      aria-label={`${label}. ${active ? 'Clear set filter' : 'Filter by this set'}.`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span
        className="collection-progress__ring"
        style={{ '--collection-set-color': setColor } as CollectionSetStyle}
        aria-hidden="true"
      >
        <svg viewBox="0 0 40 40">
          <circle className="collection-progress__track" cx="20" cy="20" r="15.9" />
          <circle
            className="collection-progress__value"
            cx="20"
            cy="20"
            r="15.9"
            pathLength="100"
            strokeDasharray={`${progress.percentage} 100`}
          />
        </svg>
        <strong>{progress.percentage}%</strong>
      </span>
      <span className="collection-progress__details">
        <strong>{progress.setCode}</strong>
        <span>{progress.owned} / {progress.total}</span>
        <small>
          {progress.printings} printing{progress.printings === 1 ? '' : 's'} ·{' '}
          {progress.copies} cop{progress.copies === 1 ? 'y' : 'ies'}
        </small>
      </span>
    </button>
  )
}

function CollectionSummary({
  analysis,
  activeSet,
  onSelectSet,
}: {
  analysis: CollectionAnalysis
  activeSet: string | null
  onSelectSet(setCode: string): void
}) {
  return (
    <section className="collection-summary" aria-label="Collection summary">
      <div className="collection-summary__stats">
        <article>
          <strong>{analysis.totalCopies.toLocaleString()}</strong>
          <span>Total copies</span>
        </article>
        <article>
          <strong>{analysis.distinctPrintings.toLocaleString()}</strong>
          <span>Printings</span>
        </article>
        <article>
          <strong>{analysis.distinctCards.toLocaleString()}</strong>
          <span>Unique cards</span>
        </article>
        <article>
          <strong>{analysis.setsRepresented.toLocaleString()}</strong>
          <span>Sets represented</span>
        </article>
      </div>

      {analysis.setProgress.length > 0 && (
        <div className="collection-summary__sets" aria-label="Set completion">
          {analysis.setProgress.map((progress) => (
            <CollectionProgressRing
              active={activeSet === progress.setCode}
              key={progress.setCode}
              progress={progress}
              onSelect={() => onSelectSet(progress.setCode)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function revealCollectionImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.classList.add('is-loaded')
}

function CollectionCardArtwork({
  card,
  count,
  exactCountLabel,
  title,
}: {
  card: DeckCard | null
  count: number
  exactCountLabel: string
  title: string
}) {
  const [isFlipped, setIsFlipped] = useState(false)
  const cardType = String(card?.type ?? '').toLocaleLowerCase()
  const canFlip = cardType === 'leader' && Boolean(card?.backUrl)

  if (canFlip) {
    return (
      <button
        className={`collection-card__flip${isFlipped ? ' is-flipped' : ''}`}
        type="button"
        aria-label={`${isFlipped ? 'Restore leader face' : 'Show deployed face'} for ${title}`}
        aria-pressed={isFlipped}
        onClick={() => setIsFlipped((current) => !current)}
      >
        <span className="collection-card__flip-inner">
          <span className="collection-card__image-frame collection-card__flip-face collection-card__flip-face--front">
            <img
              src={card?.url ?? undefined}
              alt=""
              loading="lazy"
              decoding="async"
              draggable="false"
              onLoad={revealCollectionImage}
            />
          </span>
          <span className="collection-card__image-frame collection-card__flip-face collection-card__flip-face--back">
            <img
              src={card?.backUrl ?? undefined}
              alt=""
              loading="lazy"
              decoding="async"
              draggable="false"
              onLoad={revealCollectionImage}
            />
          </span>
        </span>
        <span className="collection-card__flip-hint" aria-hidden="true">
          {isFlipped ? 'Restore leader' : 'Deploy leader'} ↻
        </span>
        <span className="collection-card__owned" aria-label={exactCountLabel}>
          ×{count}
        </span>
      </button>
    )
  }

  return (
    <div className="collection-card__image-frame">
      {card?.url ? (
        <img
          className={cardType === 'base' ? 'is-base' : undefined}
          src={card.url}
          alt={title}
          loading="lazy"
          decoding="async"
          draggable="false"
          onLoad={revealCollectionImage}
        />
      ) : (
        <span className="collection-card__missing-art" aria-hidden="true">?</span>
      )}
      <span className="collection-card__owned" aria-label={exactCountLabel}>
        ×{count}
      </span>
    </div>
  )
}

function CollectionCardTile({
  item,
  mode,
  onSetCount,
}: {
  item: CollectionCardItem
  mode: LibraryMode
  onSetCount(cardId: string, count: number): void
}) {
  const { card, cardId, count } = item
  const title = cardTitle(card, cardId)
  const exactCountLabel = `${count} ${count === 1 ? 'copy' : 'copies'} owned`
  const cardType = String(card?.type ?? '').toLocaleLowerCase()
  const variant = card?.variantType && card.variantType !== 'Normal'
    ? card.variantType
    : null

  return (
    <article className={`collection-card${cardType === 'base' ? ' is-base' : ''}`}>
      <CollectionCardArtwork
        card={card}
        count={count}
        exactCountLabel={exactCountLabel}
        title={title}
      />

      <div className="collection-card__details">
        <strong title={title}>{card?.name ?? cardId}</strong>
        {card?.subtitle && <span title={card.subtitle}>{card.subtitle}</span>}
        <small>
          {card
            ? [
                card.type,
                `${card.setCode} ${card.cardNumber}`,
                variant,
              ].filter(Boolean).join(' · ')
            : cardId}
        </small>
      </div>

      <div className="collection-card__footer">
        <span>{mode === 'all' && count === 0 ? 'Not owned' : exactCountLabel}</span>
        <span className="collection-card__quantity" role="group" aria-label={`Quantity for ${title}`}>
          <button
            type="button"
            aria-label={`Decrease ${title} quantity`}
            disabled={count <= 0}
            onClick={() => onSetCount(cardId, count - 1)}
          >
            −
          </button>
          <strong aria-label={exactCountLabel}>{count}</strong>
          <button
            type="button"
            aria-label={`Increase ${title} quantity`}
            disabled={count >= MAX_COLLECTION_CARD_COUNT}
            onClick={() => onSetCount(cardId, count + 1)}
          >
            +
          </button>
        </span>
      </div>
    </article>
  )
}

function emptyMessage(mode: LibraryMode, query: string) {
  if (query.trim()) return 'No close matches found.'
  return mode === 'all'
    ? 'No catalog cards are available.'
    : 'Your card library is empty. Switch to All cards to start your collection.'
}

export function CardCollectionDialog({
  cardsById,
  catalog,
  collection,
  isElectron,
  onClose,
  onSetCount,
  searchIndex,
}: CardCollectionControlProps & { onClose(): void }) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [activeSet, setActiveSet] = useState<string | null>(null)
  const [mode, setMode] = useState<LibraryMode>('owned')
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_CARD_COUNT)
  const analysis = useMemo(
    () => analyzeCardCollection({ cardsById, catalog, collection }),
    [cardsById, catalog, collection],
  )
  const baseItems = useMemo(() => {
    if (mode === 'owned') {
      return analysis.resolvedEntries
        .filter(
          ({ card, cardId }) =>
            !activeSet ||
            (card?.setCode ?? String(cardId).split('_')[0]) === activeSet,
        )
        .map((entry) => ({
          card: entry.card,
          cardId: entry.cardId,
          count: entry.count,
        }))
    }

    return []
  }, [activeSet, analysis.resolvedEntries, mode])
  const localSearchIndex = useMemo(
    () => createCardSearchIndexFromCards(baseItems.flatMap((item) => item.card ? [item.card] : [])),
    [baseItems],
  )
  const itemById = useMemo(
    () => new Map(baseItems.map((item) => [item.cardId, item])),
    [baseItems],
  )
  const searchedItems = useMemo(() => {
    const trimmedQuery = query.trim()
    if (mode === 'all') {
      const cards = trimmedQuery
        ? fuzzySearchCards(searchIndex, trimmedQuery, visibleCount + 1)
        : searchIndex
            .slice(0, visibleCount + 1)
            .map(({ card }) => card)
      return cards.map((card): CollectionCardItem => {
        const cardId = getCatalogCardId(card) ?? card.id
        return {
          card,
          cardId,
          count: getCardCollectionCount(collection, cardId),
        }
      })
    }

    if (!trimmedQuery) return [...baseItems].sort(compareCardItems)
    const matched = fuzzySearchCards(localSearchIndex, trimmedQuery, visibleCount + 1)
      .map((card) => itemById.get(getCatalogCardId(card) ?? card.id))
      .filter((item): item is CollectionCardItem => Boolean(item))
    const unresolvedMatches = baseItems.filter(
      ({ card, cardId }) =>
        !card && String(cardId).toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase()),
    )
    return [...matched, ...unresolvedMatches]
  }, [baseItems, collection, itemById, localSearchIndex, mode, query, searchIndex, visibleCount])
  const hasMore = searchedItems.length > visibleCount
  const visibleItems = searchedItems.slice(0, visibleCount)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    searchRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  function selectSet(setCode: string) {
    setMode('owned')
    setVisibleCount(INITIAL_VISIBLE_CARD_COUNT)
    setActiveSet((current) => current === setCode ? null : setCode)
  }

  function selectMode(nextMode: LibraryMode) {
    setMode(nextMode)
    setVisibleCount(INITIAL_VISIBLE_CARD_COUNT)
    if (nextMode !== 'owned') setActiveSet(null)
    searchRef.current?.focus()
  }

  const resultDescription = mode === 'all'
    ? query.trim()
      ? `${visibleItems.length} catalog result${visibleItems.length === 1 ? '' : 's'}`
      : `${searchIndex.length.toLocaleString()} cards`
    : `${searchedItems.length} card${searchedItems.length === 1 ? '' : 's'}`

  return (
    <div
      className={`card-collection-backdrop${isElectron ? ' is-electron' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="card-collection-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-collection-title"
      >
        <header className="card-collection-dialog__header">
          <div>
            <span>Collection manager</span>
            <h2 id="card-collection-title">Card library</h2>
          </div>
          <button type="button" aria-label="Close card library" onClick={onClose}>×</button>
        </header>

        <CollectionSummary
          activeSet={activeSet}
          analysis={analysis}
          onSelectSet={selectSet}
        />

        <div className="collection-toolbar">
          <div className="collection-toolbar__modes" role="tablist" aria-label="Library view">
            {LIBRARY_MODES.map((candidate) => (
              <button
                type="button"
                role="tab"
                aria-selected={mode === candidate.id}
                key={candidate.id}
                onClick={() => selectMode(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <label className="collection-toolbar__search">
            <input
              ref={searchRef}
              aria-label={`Search ${LIBRARY_MODES.find((item) => item.id === mode)?.label}`}
              autoComplete="off"
              placeholder={mode === 'all' ? 'Search all cards' : 'Search my library'}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setVisibleCount(INITIAL_VISIBLE_CARD_COUNT)
              }}
            />
          </label>
          <span className="collection-toolbar__count" aria-live="polite">{resultDescription}</span>
          {activeSet && (
            <button
              className="collection-toolbar__filter"
              type="button"
              onClick={() => {
                setActiveSet(null)
                setVisibleCount(INITIAL_VISIBLE_CARD_COUNT)
              }}
            >
              {activeSet} ×
            </button>
          )}
        </div>

        <div className="card-collection-dialog__content">
          {visibleItems.length === 0 ? (
            <p className="card-collection-dialog__empty">
              {emptyMessage(mode, query)}
            </p>
          ) : (
            <div className="collection-card-grid">
              {visibleItems.map((item) => (
                <CollectionCardTile
                  item={item}
                  key={item.cardId}
                  mode={mode}
                  onSetCount={onSetCount}
                />
              ))}
            </div>
          )}
          {hasMore && (
            <button
              className="collection-card-grid__more"
              type="button"
              onClick={() => setVisibleCount((count) => count + VISIBLE_CARD_INCREMENT)}
            >
              Load more cards
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

export interface CardCollectionControlProps {
  cardsById: ReadonlyCardReferenceMap
  catalog: Catalog | null
  collection: CardCollection
  isElectron: boolean
  onSetCount(cardId: string, count: number): void
  searchIndex: CardSearchEntry[]
}

export default function CardCollectionControl(props: CardCollectionControlProps) {
  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const totalCopies = props.collection.cards.reduce(
    (sum, entry) => sum + entry.count,
    0,
  )

  function closeLibrary() {
    setIsOpen(false)
    requestAnimationFrame(() => launcherRef.current?.focus())
  }

  return (
    <>
      <button
        className="card-collection-launcher"
        ref={launcherRef}
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <span>
          <strong>Card library</strong>
          <small>
            {totalCopies.toLocaleString()} cop{totalCopies === 1 ? 'y' : 'ies'} ·{' '}
            {props.collection.cards.length.toLocaleString()} printing{props.collection.cards.length === 1 ? '' : 's'}
          </small>
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {isOpen && createPortal(
        <CardCollectionDialog {...props} onClose={closeLibrary} />,
        document.body,
      )}
    </>
  )
}
