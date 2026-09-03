import { useState, type CSSProperties } from 'react'

import CardCollectionControl, {
  type CardCollectionControlProps,
} from '../player-database/card-collection-dialog.js'
import { getCardOwnershipStatus } from '../player-database/card-collection.js'
import { evaluateDeckFormats } from './deck-legality.js'
import { revealImage } from '../shared/image.js'
import type { DeckCard, DeckCardGroup } from '../types/catalog.js'
import type { Deck } from '../types/deck.js'

type CustomCardStyle = CSSProperties & Record<`--${string}`, string | number>

function DeckLegality({ deck }: { deck: Deck }) {
  const formats = evaluateDeckFormats(deck)

  return (
    <aside className="deck-legality" aria-label="Deck format legality">
      <header className="deck-legality__header">
        <h2>Format legality</h2>
      </header>

      <div className="deck-legality__formats">
        {formats.map((format) => (
          <article
            className={`deck-legality__format is-${format.status}`}
            key={format.id}
          >
            <div className="deck-legality__format-heading">
              <h3>{format.name}</h3>
              <strong
                aria-label={
                  format.status === 'illegal'
                    ? `${format.name} fails estimated legality`
                    : `${format.name} passes estimated legality`
                }
              >
                <span aria-hidden="true">
                  {format.status === 'illegal' ? '×' : '✓'}
                </span>
              </strong>
            </div>
            {format.issues.length > 0 && (
              <ul>
                {format.issues.slice(0, 2).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            {format.issues.length > 2 && (
              <small>+{format.issues.length - 2} more issue{format.issues.length - 2 === 1 ? '' : 's'}</small>
            )}
          </article>
        ))}
      </div>

      <p className="deck-legality__estimate">* estimated legality</p>
    </aside>
  )
}

export function RightRail({
  deck,
  ...collectionProps
}: { deck: Deck | null } & CardCollectionControlProps) {
  return (
    <div className="app__right-rail">
      <CardCollectionControl {...collectionProps} />
      {deck && <DeckLegality deck={deck} />}
    </div>
  )
}

export function Card({
  card,
  featured = false,
  flippable = false,
  onRemove = null,
}: {
  card: DeckCard
  featured?: boolean
  flippable?: boolean
  onRemove?: (() => void) | null
}) {
  const [isFlipped, setIsFlipped] = useState(false)
  const title = [card.name, card.subtitle].filter(Boolean).join(' — ')
  const canFlip = flippable && Boolean(card.backUrl)

  return (
    <article
      className={`deck-card${featured ? ' deck-card--featured' : ''}${isFlipped ? ' is-flipped' : ''
        }`}
    >
      {onRemove && (
        <button
          className="deck-card__remove"
          type="button"
          aria-label={`Remove ${title}`}
          title="Remove second leader"
          onClick={onRemove}
        >
          <span aria-hidden="true">−</span>
        </button>
      )}
      {canFlip ? (
        <button
          className={`deck-card__flip${isFlipped ? ' is-flipped' : ''}`}
          type="button"
          aria-label={`${isFlipped ? 'Restore leader face' : 'Show deployed face'} for ${title}`}
          aria-pressed={isFlipped}
          onClick={() => setIsFlipped((current) => !current)}
        >
          <span className="deck-card__flip-inner">
            <span className="deck-card__image-frame deck-card__flip-face deck-card__flip-face--front">
              <img
                src={card.url ?? undefined}
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
                onLoad={revealImage}
              />
            </span>
            <span className="deck-card__image-frame deck-card__flip-face deck-card__flip-face--back">
              <img
                src={card.backUrl ?? undefined}
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
                onLoad={revealImage}
              />
            </span>
          </span>
          <span className="deck-card__flip-hint" aria-hidden="true">
            {isFlipped ? 'Restore leader' : 'Deploy leader'} ↻
          </span>
        </button>
      ) : (
        <div className="deck-card__image-frame">
          <img
            src={card.url ?? undefined}
            alt={title}
            loading="lazy"
            decoding="async"
            draggable="false"
            onLoad={revealImage}
          />
        </div>
      )}
      <div className="deck-card__details">
        <strong>{card.name}</strong>
        {card.subtitle && <span>{card.subtitle}</span>}
        <small>
          {[card.type, card.setCode && `${card.setCode} ${card.cardNumber}`]
            .filter(Boolean)
            .join(' · ')}
        </small>
      </div>
    </article>
  )
}

function EmptyIdentityCard({ type }: { type: 'leader' | 'base' }) {
  return (
    <article className="deck-card deck-card--featured deck-card--empty">
      <div className="deck-card__empty-art" aria-hidden="true">
        <span>+</span>
      </div>
      <div className="deck-card__details">
        <strong>Choose a {type}</strong>
        <span>Search the catalog above to fill this slot.</span>
      </div>
    </article>
  )
}

export function DeckIdentities({
  deck,
  onRemoveSecondLeader,
}: {
  deck: Deck
  onRemoveSecondLeader(): void
}) {
  return (
    <div className="featured-cards">
      {deck.leader ? (
        <Card
          card={deck.leader}
          featured
          flippable
          key={`leader-${deck.leader.id}`}
        />
      ) : (
        <EmptyIdentityCard type="leader" />
      )}
      {deck.secondLeader && (
        <Card
          card={deck.secondLeader}
          featured
          flippable
          key={`second-leader-${deck.secondLeader.id}`}
          onRemove={onRemoveSecondLeader}
        />
      )}
      {deck.base ? (
        <Card card={deck.base} featured />
      ) : (
        <EmptyIdentityCard type="base" />
      )}
    </div>
  )
}

export function DeckCardStack({
  aspectPenalty = 0,
  group,
  onRemove,
  ownedCount = 0,
  showOwnership = false,
}: {
  aspectPenalty?: number
  group: DeckCardGroup
  onRemove(): void
  ownedCount?: number
  showOwnership?: boolean
}) {
  const visibleCards = group.cards.slice(0, 3)
  const stackDepth = Math.min(group.count - 1, 2)
  const ownership = getCardOwnershipStatus(ownedCount, group.count)
  const title = [group.card.name, group.card.subtitle]
    .filter(Boolean)
    .join(' — ')

  return (
    <article
      className="deck-card deck-card--stacked"
      style={{ '--stack-depth': stackDepth } as CustomCardStyle}
    >
      <button
        className="deck-card__remove"
        type="button"
        aria-label={`Remove one copy of ${title}`}
        title="Remove one copy"
        onClick={onRemove}
      >
        <span aria-hidden="true">−</span>
      </button>
      <div className="deck-card__stack">
        {visibleCards.map((card, index) => (
          <div
            className="deck-card__image-frame"
            key={`${card.id}-${index}`}
            style={{
              '--stack-index': index,
              zIndex: visibleCards.length - index,
            } as CustomCardStyle}
          >
            <img
              src={card.url ?? undefined}
              alt={index === 0 ? title : ''}
              loading="lazy"
              decoding="async"
              draggable="false"
              onLoad={revealImage}
            />
          </div>
        ))}
        <span
          className="deck-card__quantity"
          aria-label={`${group.count} ${group.count === 1 ? 'copy' : 'copies'}`}
        >
          ×{group.count}
        </span>
        {aspectPenalty > 0 && (
          <span
            className="deck-card__aspect-penalty"
            title={`${aspectPenalty / 2} missing aspect ${
              aspectPenalty === 2 ? 'icon' : 'icons'
            }; costs ${aspectPenalty} additional resources to play`}
          >
            +{aspectPenalty} cost
          </span>
        )}
        {showOwnership && (
          <span
            className={`deck-card__ownership is-${ownership.kind}`}
          >
            {ownership.label}
          </span>
        )}
      </div>
      <div className="deck-card__details">
        <strong>{group.card.name}</strong>
        {group.card.subtitle && <span>{group.card.subtitle}</span>}
        <small>
          {[
            group.card.type,
            group.card.setCode &&
            `${group.card.setCode} ${group.card.cardNumber}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </small>
      </div>
    </article>
  )
}
