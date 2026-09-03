import {
  getCardCollectionCount,
} from '../player-database/card-collection.js'
import { getCatalogCardId } from '../catalog/catalog.js'
import { revealImage } from '../shared/image.js'
import type { DeckCard } from '../types/catalog.js'
import type { CardCollection } from '../types/collection.js'
import type { Deck } from '../types/deck.js'

interface DeckCardSearchActionsProps {
  collectionCount: number
  deck: Deck
  card: DeckCard
  type: string
  isCurrentBase: boolean
  isCurrentLeader: boolean
  isCurrentSecondLeader: boolean
  onAddCard(zone: 'drawDeck' | 'sideboard', card: DeckCard): void
  onAddSecondLeader(card: DeckCard): void
  onAddToCollection(card: DeckCard): void
  onUseBase(card: DeckCard): void
  onUseLeader(card: DeckCard): void
}

type DeckCardSearchCallbacks = Omit<
  DeckCardSearchActionsProps,
  | 'collectionCount'
  | 'deck'
  | 'card'
  | 'type'
  | 'isCurrentBase'
  | 'isCurrentLeader'
  | 'isCurrentSecondLeader'
>

function DeckCardSearchActions({
  collectionCount,
  deck,
  card,
  type,
  isCurrentBase,
  isCurrentLeader,
  isCurrentSecondLeader,
  onAddCard,
  onAddSecondLeader,
  onAddToCollection,
  onUseBase,
  onUseLeader,
}: DeckCardSearchActionsProps) {
  const isDrawDeckCard = ['unit', 'event', 'upgrade'].includes(type)

  return (
    <span className="deck-card-search__actions">
      {isDrawDeckCard && (
        <>
          <button type="button" onClick={() => onAddCard('drawDeck', card)}>
            Draw Deck
          </button>
          <button type="button" onClick={() => onAddCard('sideboard', card)}>
            Sideboard
          </button>
        </>
      )}
      {type === 'leader' && (
        <>
          <button
            type="button"
            disabled={isCurrentLeader || isCurrentSecondLeader}
            title={
              isCurrentSecondLeader
                ? 'This card is already the second leader'
                : undefined
            }
            onClick={() => onUseLeader(card)}
          >
            {isCurrentLeader
              ? 'Current Leader'
              : deck.leader
                ? 'Replace Leader'
                : 'Use as Leader'}
          </button>
          {deck.leader && (
            <button
              type="button"
              disabled={
                isCurrentLeader ||
                isCurrentSecondLeader ||
                Boolean(deck.secondLeader)
              }
              title={
                deck.secondLeader && !isCurrentSecondLeader
                  ? 'Remove the current second leader first'
                  : undefined
              }
              onClick={() => onAddSecondLeader(card)}
            >
              {isCurrentSecondLeader
                ? 'Current Second Leader'
                : 'Add Second Leader'}
            </button>
          )}
        </>
      )}
      {type === 'base' && (
        <button
          type="button"
          disabled={isCurrentBase}
          onClick={() => onUseBase(card)}
        >
          {isCurrentBase ? 'Current Base' : 'Use as Base'}
        </button>
      )}
      {collectionCount === 0 && (
        <button type="button" onClick={() => onAddToCollection(card)}>
          Add to collection
        </button>
      )}
    </span>
  )
}

function DeckCardSearchResult({
  collectionCount,
  deck,
  card,
  ...actions
}: {
  collectionCount: number
  deck: Deck
  card: DeckCard
} & DeckCardSearchCallbacks) {
  const title = [card.name, card.subtitle].filter(Boolean).join(' — ')
  const type = String(card.type).toLocaleLowerCase()
  const isDrawDeckCard = ['unit', 'event', 'upgrade'].includes(type)
  const copies = [...deck.drawDeck, ...(deck.sideboard ?? [])].filter(
    (candidate) =>
      candidate.type === card.type &&
      candidate.name === card.name &&
      candidate.subtitle === card.subtitle,
  ).length
  const isCurrentLeader = type === 'leader' && deck.leader?.id === card.id
  const isCurrentSecondLeader =
    type === 'leader' && deck.secondLeader?.id === card.id
  const isCurrentBase = type === 'base' && deck.base?.id === card.id

  return (
    <article className="deck-card-search__result">
      <span
        className={`deck-card-search__art${
          type === 'leader' || type === 'base' ? ' is-horizontal' : ''
        }`}
      >
        <img
          src={card.url ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
          onLoad={revealImage}
        />
      </span>
      <span className="deck-card-search__details">
        <strong>{title}</strong>
        <small>
          {[card.type, card.setCode && `${card.setCode} ${card.cardNumber}`]
            .filter(Boolean)
            .join(' · ')}
        </small>
        {isDrawDeckCard && <span>{copies} currently in deck</span>}
        {collectionCount > 0 && <span>Owned ×{collectionCount}</span>}
      </span>
      <DeckCardSearchActions
        {...actions}
        card={card}
        collectionCount={collectionCount}
        deck={deck}
        type={type}
        isCurrentBase={isCurrentBase}
        isCurrentLeader={isCurrentLeader}
        isCurrentSecondLeader={isCurrentSecondLeader}
      />
    </article>
  )
}

export function DeckCardSearch({
  collection,
  deck,
  query,
  results,
  onQueryChange,
  ...actions
}: {
  collection: CardCollection
  deck: Deck
  query: string
  results: DeckCard[]
  onQueryChange(query: string): void
} & DeckCardSearchCallbacks) {
  return (
    <section className="deck-card-search" aria-label="Add a card">
      <input
        aria-label="Add a card"
        autoComplete="off"
        placeholder="Add a card"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />

      {query.trim() && (
        <div className="deck-card-search__results" aria-live="polite">
          {results.length === 0 && (
            <p className="deck-card-search__empty">No close matches found.</p>
          )}
          {results.map((card) => (
            <DeckCardSearchResult
              {...actions}
              card={card}
              collectionCount={getCardCollectionCount(
                collection,
                getCatalogCardId(card),
              )}
              deck={deck}
              key={card.id}
            />
          ))}
        </div>
      )}
    </section>
  )
}
