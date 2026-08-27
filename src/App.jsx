import { useEffect, useState } from 'react'
import {
  generateRandomDeck,
  groupDeckCards,
  loadPackedCatalog,
  selectRandomCardFaces,
} from './catalog.js'
import { formatSwudbDeck } from './integrations/swudb.js'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function analyzeDeck(deck) {
  const costBuckets = Array.from({ length: 10 }, (_, cost) => ({
    label: cost === 9 ? '9+' : String(cost),
    count: 0,
  }))
  let totalCost = 0
  let cardsWithCost = 0

  deck.drawDeck.forEach((card) => {
    if (card.cost === null) {
      return
    }

    const bucketIndex = Math.min(Math.max(Math.floor(card.cost), 0), 9)
    costBuckets[bucketIndex].count += 1
    totalCost += card.cost
    cardsWithCost += 1
  })

  const allCards = [deck.leader, deck.base, ...deck.drawDeck]
  const pricedCards = allCards.filter((card) => card.nominalPrice !== null)

  return {
    costBuckets,
    maximumBucketCount: Math.max(...costBuckets.map((bucket) => bucket.count), 1),
    averageCost: cardsWithCost > 0 ? totalCost / cardsWithCost : null,
    nominalValue: pricedCards.reduce(
      (total, card) => total + card.nominalPrice,
      0,
    ),
    pricedCardCount: pricedCards.length,
    totalCardCount: allCards.length,
  }
}

function DeckAnalysis({ deck }) {
  const analysis = analyzeDeck(deck)
  const midline = Math.ceil(analysis.maximumBucketCount / 2)

  return (
    <aside className="deck-analysis" aria-label="Deck cost and value summary">
      <div className="deck-analysis__header">
        <div>
          <h3>Cost curve</h3>
          <span>
            {analysis.averageCost === null
              ? 'No cost data'
              : `${analysis.averageCost.toFixed(1)} average cost`}
          </span>
        </div>
        <div className="deck-value">
          <span>Nominal value</span>
          <strong>{currencyFormatter.format(analysis.nominalValue)}</strong>
          <small>
            {analysis.pricedCardCount}/{analysis.totalCardCount} cards priced
          </small>
        </div>
      </div>

      <div className="cost-curve">
        <div className="cost-curve__axis" aria-hidden="true">
          <span>{analysis.maximumBucketCount}</span>
          <span>{midline}</span>
          <span>0</span>
        </div>
        <div className="cost-curve__plot">
          {analysis.costBuckets.map((bucket) => (
            <div
              className="cost-curve__bucket"
              key={bucket.label}
              title={`Cost ${bucket.label}: ${bucket.count} card${
                bucket.count === 1 ? '' : 's'
              }`}
            >
              <div className="cost-curve__bar-area">
                <span className="cost-curve__count">{bucket.count}</span>
                <span
                  className="cost-curve__bar"
                  style={{
                    '--bucket-height': `${
                      (bucket.count / analysis.maximumBucketCount) * 100
                    }%`,
                  }}
                />
              </div>
              <span className="cost-curve__label">{bucket.label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

function Card({ card, featured = false, flippable = false }) {
  const [isFlipped, setIsFlipped] = useState(false)
  const title = [card.name, card.subtitle].filter(Boolean).join(' — ')
  const canFlip = flippable && Boolean(card.backUrl)

  return (
    <article
      className={`deck-card${featured ? ' deck-card--featured' : ''}${
        isFlipped ? ' is-flipped' : ''
      }`}
    >
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
                src={card.url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
              />
            </span>
            <span className="deck-card__image-frame deck-card__flip-face deck-card__flip-face--back">
              <img
                src={card.backUrl}
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
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
            src={card.url}
            alt={title}
            loading="lazy"
            decoding="async"
            draggable="false"
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

function DeckCardStack({ group }) {
  const visibleCards = group.cards.slice(0, 3)
  const stackDepth = Math.min(group.count - 1, 2)
  const title = [group.card.name, group.card.subtitle]
    .filter(Boolean)
    .join(' — ')

  return (
    <article
      className="deck-card deck-card--stacked"
      style={{ '--stack-depth': stackDepth }}
    >
      <div className="deck-card__stack">
        {visibleCards.map((card, index) => (
          <div
            className="deck-card__image-frame"
            key={`${card.id}-${index}`}
            style={{
              '--stack-index': index,
              zIndex: visibleCards.length - index,
            }}
          >
            <img
              src={card.url}
              alt={index === 0 ? title : ''}
              loading="lazy"
              decoding="async"
              draggable="false"
            />
          </div>
        ))}
        <span
          className="deck-card__quantity"
          aria-label={`${group.count} ${group.count === 1 ? 'copy' : 'copies'}`}
        >
          ×{group.count}
        </span>
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

function App() {
  const [catalog, setCatalog] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [cardFaces, setCardFaces] = useState([])
  const [deck, setDeck] = useState(null)
  const [deckError, setDeckError] = useState('')
  const [copyStatus, setCopyStatus] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    async function loadCatalog() {
      try {
        const nextCatalog = await loadPackedCatalog({
          signal: controller.signal,
        })

        if (!isCurrent) {
          return
        }

        setCatalog(nextCatalog)
        setCardFaces(selectRandomCardFaces(nextCatalog))
        try {
          setDeck(generateRandomDeck(nextCatalog))
          setDeckError('')
        } catch (generationError) {
          setDeck(null)
          setDeckError(
            generationError instanceof Error
              ? generationError.message
              : 'A random deck could not be generated.',
          )
        }
        setStatus('success')
      } catch (loadError) {
        if (!isCurrent) {
          return
        }

        setCatalog(null)
        setCardFaces([])
        setStatus('error')
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'The catalog could not be loaded.',
        )
      }
    }

    loadCatalog()

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [])

  function handleGenerateDeck() {
    try {
      setDeck(generateRandomDeck(catalog))
      setDeckError('')
      setCopyStatus(null)
    } catch (generationError) {
      setDeck(null)
      setDeckError(
        generationError instanceof Error
          ? generationError.message
          : 'A random deck could not be generated.',
      )
    }
  }

  async function handleCopySwudbDeck() {
    try {
      const json = formatSwudbDeck(deck, { name: 'Random deck' })

      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.')
      }

      await navigator.clipboard.writeText(json)
      setCopyStatus({
        type: 'success',
        message: 'SWUDB JSON copied to your clipboard.',
      })
    } catch (copyError) {
      setCopyStatus({
        type: 'error',
        message:
          copyError instanceof Error
            ? copyError.message
            : 'The SWUDB JSON could not be copied.',
      })
    }
  }

  const groupedDrawDeck = deck ? groupDeckCards(deck.drawDeck) : []

  return (
    <main className="app">
      {cardFaces.length > 0 && (
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
      )}

      <nav className="site-nav" aria-label="External links">
        <div className="site-nav__inner">
          <a
            className="site-nav__link"
            href="https://swudb.com/decks/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open SWUDB <span aria-hidden="true">↗</span>
          </a>
        </div>
      </nav>

      <div className="app__content">
        <header className="action-tray">
          <div className="action-tray__identity">
            <p className="eyebrow">Current deck</p>
            <h1>Random deck</h1>
          </div>

          {deck && <DeckAnalysis deck={deck} />}

          <div
            className="action-tray__actions"
            role="toolbar"
            aria-label="Deck actions"
          >
            <button
              className="generate-button"
              type="button"
              disabled={status !== 'success' || !catalog}
              onClick={handleGenerateDeck}
            >
              {status === 'loading' ? 'Loading catalog…' : 'Generate deck'}
            </button>
            <button
              className="copy-button"
              type="button"
              disabled={!deck}
              onClick={handleCopySwudbDeck}
            >
              Copy SWUDB JSON
            </button>
          </div>

          {(status === 'error' || deckError) && (
            <p className="error action-tray__error" role="alert">
              {deckError || error}
            </p>
          )}

          {copyStatus && (
            <p
              className={`action-tray__notice is-${copyStatus.type}`}
              role={copyStatus.type === 'error' ? 'alert' : 'status'}
            >
              {copyStatus.message}
            </p>
          )}
        </header>

        {deck && (
          <section className="random-deck" id="random-deck">
            <div className="deck-section">
              <h3>Leader &amp; Base</h3>
              <div className="featured-cards">
                <Card
                  card={deck.leader}
                  featured
                  flippable
                  key={deck.leader.id}
                />
                <Card card={deck.base} featured />
              </div>
            </div>

            <div className="deck-section">
              <h3>Draw Deck <span>{deck.drawDeck.length}</span></h3>
              <div className="deck-grid">
                {groupedDrawDeck.map((group) => (
                  <DeckCardStack group={group} key={group.key} />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

export default App
