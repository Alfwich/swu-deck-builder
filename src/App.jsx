import { useEffect, useRef, useState } from 'react'
import {
  generateRandomDeck,
  groupDeckCards,
  loadPackedCatalog,
  selectRandomCardFaces,
} from './catalog.js'
import {
  formatSwudbDeck,
  parseSwudbDeck,
  serializeSwudbDeck,
} from './integrations/swudb.js'
import {
  addDeckRecord,
  loadDeckLibrary,
  renameDeckRecord,
  saveDeckLibrary,
  updateDeckRecord,
  upsertRandomDeckRecord,
} from './deck-library.js'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function revealImage(event) {
  event.currentTarget.classList.add('is-loaded')
}

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

  const allCards = [
    deck.leader,
    deck.secondLeader,
    deck.base,
    ...deck.drawDeck,
    ...(deck.sideboard ?? []),
  ].filter(Boolean)
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
              title={`Cost ${bucket.label}: ${bucket.count} card${bucket.count === 1 ? '' : 's'
                }`}
            >
              <div className="cost-curve__bar-area">
                <span className="cost-curve__count">{bucket.count}</span>
                <span
                  className="cost-curve__bar"
                  style={{
                    '--bucket-height': `${(bucket.count / analysis.maximumBucketCount) * 100
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
      className={`deck-card${featured ? ' deck-card--featured' : ''}${isFlipped ? ' is-flipped' : ''
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
                onLoad={revealImage}
              />
            </span>
            <span className="deck-card__image-frame deck-card__flip-face deck-card__flip-face--back">
              <img
                src={card.backUrl}
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
            src={card.url}
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

const DICTATION_ERROR_MESSAGES = {
  'audio-capture': 'No microphone was found.',
  'network': 'The browser speech service is unavailable.',
  'no-speech': 'No speech was detected. Try again.',
  'not-allowed': 'Microphone permission was denied.',
  'service-not-allowed': 'Speech recognition is blocked by the browser.',
}

function DictationControl({ disabled = false, onTranscript }) {
  const recognitionRef = useRef(null)
  const onTranscriptRef = useRef(onTranscript)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [isSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
  )

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    if (!isSupported) {
      return undefined
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = navigator.language || 'en-US'

    recognition.onstart = () => {
      setError('')
      setIsListening(true)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = (event) => {
      setIsListening(false)
      if (event.error !== 'aborted') {
        setError(
          DICTATION_ERROR_MESSAGES[event.error] ??
            'Dictation stopped unexpectedly.',
        )
      }
    }
    recognition.onresult = (event) => {
      let transcript = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) {
          transcript += event.results[index][0]?.transcript ?? ''
        }
      }

      if (transcript.trim()) {
        onTranscriptRef.current(transcript.trim())
      }
    }

    recognitionRef.current = recognition
    return () => {
      recognition.onstart = null
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      recognition.abort()
      recognitionRef.current = null
    }
  }, [isSupported])

  useEffect(() => {
    if (disabled && isListening) {
      recognitionRef.current?.stop()
    }
  }, [disabled, isListening])

  function toggleDictation() {
    const recognition = recognitionRef.current
    if (!recognition) {
      return
    }

    if (isListening) {
      recognition.stop()
      return
    }

    setError('')
    try {
      recognition.start()
    } catch {
      setError('Dictation is already starting. Please try again.')
    }
  }

  const message = error || (isListening ? 'Listening…' : '')

  return (
    <div className="dictation-control">
      <button
        className={`dictation-button${isListening ? ' is-listening' : ''}`}
        type="button"
        disabled={disabled || !isSupported}
        aria-pressed={isListening}
        title={
          isSupported
            ? 'Dictate this prompt using your browser microphone'
            : 'Speech recognition is not supported by this browser'
        }
        onClick={toggleDictation}
      >
        <span aria-hidden="true">{isListening ? '■' : '●'}</span>
        {isListening ? 'Stop' : 'Dictate'}
      </button>
      <span className={`dictation-control__status${error ? ' is-error' : ''}`} aria-live="polite">
        {message}
      </span>
    </div>
  )
}

function AgentDeckDialog({
  prompt,
  setPrompt,
  status,
  error,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && status !== 'loading') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, status])

  return (
    <div
      className="agent-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && status !== 'loading') {
          onClose()
        }
      }}
    >
      <section
        className="agent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-dialog-title"
      >
        <p className="eyebrow">OpenAI-assisted</p>
        <h2 id="agent-dialog-title">Describe the deck you want</h2>
        <p className="agent-dialog__description">
          The builder will select a leader, base, legal 50-card draw deck, and
          10-card sideboard from the local catalog. You can be as thematic or
          strategic as you like.
        </p>

        <form onSubmit={onSubmit}>
          <div className="agent-dialog__field-header">
            <label htmlFor="agent-deck-prompt">Deck request</label>
            <DictationControl
              disabled={status === 'loading'}
              onTranscript={(transcript) =>
                setPrompt((current) =>
                  [current.trimEnd(), transcript]
                    .filter(Boolean)
                    .join(' ')
                    .slice(0, 4000),
                )
              }
            />
          </div>
          <textarea
            id="agent-deck-prompt"
            autoFocus
            maxLength={4000}
            placeholder="For example: Build an aggressive Mandalorian deck with a low cost curve."
            required
            rows={7}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className="agent-dialog__prompt-meta">
            <span>{prompt.length.toLocaleString()}/4,000</span>
          </div>

          {error && (
            <p className="agent-dialog__error" role="alert">
              {error}
            </p>
          )}

          <div className="agent-dialog__actions">
            <button
              className="copy-button"
              type="button"
              disabled={status === 'loading'}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="generate-button"
              type="submit"
              disabled={status === 'loading' || !prompt.trim()}
            >
              {status === 'loading' ? 'Building deck…' : 'Build deck'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function TransformDeckDialog({
  currentDeck,
  currentDeckName,
  prompt,
  setPrompt,
  status,
  error,
  preview,
  onClose,
  onSubmit,
  onApply,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && status !== 'loading') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, status])

  const beforeAnalysis = currentDeck ? analyzeDeck(currentDeck) : null
  const afterAnalysis = preview?.deck ? analyzeDeck(preview.deck) : null
  const changes = preview?.changes

  return (
    <div
      className="agent-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && status !== 'loading') {
          onClose()
        }
      }}
    >
      <section
        className="agent-dialog transform-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transform-dialog-title"
      >
        <p className="eyebrow">OpenAI-assisted revision</p>
        <h2 id="transform-dialog-title">
          {preview ? 'Review deck transformation' : 'Transform this deck'}
        </h2>

        {!preview ? (
          <>
            <p className="agent-dialog__description">
              Describe exactly what should change. The current deck is sent as
              canonical SWUDB IDs and remains untouched until you approve the
              result.
            </p>
            <div className="transform-dialog__current">
              <strong>{currentDeckName}</strong>
              <span>
                {currentDeck?.leader?.name} · {currentDeck?.base?.name} ·{' '}
                {currentDeck?.drawDeck?.length ?? 0} draw cards ·{' '}
                {currentDeck?.sideboard?.length ?? 0} sideboard cards
              </span>
            </div>

            <form onSubmit={onSubmit}>
              <div className="agent-dialog__field-header">
                <label htmlFor="transform-deck-prompt">
                  Transformation request
                </label>
                <DictationControl
                  disabled={status === 'loading'}
                  onTranscript={(transcript) =>
                    setPrompt((current) =>
                      [current.trimEnd(), transcript]
                        .filter(Boolean)
                        .join(' ')
                        .slice(0, 4000),
                    )
                  }
                />
              </div>
              <textarea
                id="transform-deck-prompt"
                autoFocus
                maxLength={4000}
                placeholder="For example: Lower the average cost without changing the leader or base."
                required
                rows={7}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <div className="agent-dialog__prompt-meta">
                <span>{prompt.length.toLocaleString()}/4,000</span>
              </div>

              {error && (
                <p className="agent-dialog__error" role="alert">
                  {error}
                </p>
              )}

              <div className="agent-dialog__actions">
                <button
                  className="copy-button"
                  type="button"
                  disabled={status === 'loading'}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className="generate-button"
                  type="submit"
                  disabled={status === 'loading' || !prompt.trim()}
                >
                  {status === 'loading' ? 'Transforming deck…' : 'Preview changes'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="agent-dialog__description transform-preview__summary">
              {preview.summary || 'The transformed deck is ready to review.'}
            </p>

            <div className="transform-preview__metrics">
              <div>
                <span>Average cost</span>
                <strong>
                  {beforeAnalysis?.averageCost?.toFixed(1) ?? '—'} →{' '}
                  {afterAnalysis?.averageCost?.toFixed(1) ?? '—'}
                </strong>
              </div>
              <div>
                <span>Nominal value</span>
                <strong>
                  {currencyFormatter.format(beforeAnalysis?.nominalValue ?? 0)} →{' '}
                  {currencyFormatter.format(afterAnalysis?.nominalValue ?? 0)}
                </strong>
              </div>
              <div>
                <span>Sideboard</span>
                <strong>
                  {currentDeck?.sideboard?.length ?? 0} →{' '}
                  {preview.deck?.sideboard?.length ?? 0} cards
                </strong>
              </div>
            </div>

            {(changes?.name || changes?.leader || changes?.base) && (
              <div className="transform-preview__major">
                {changes.name && (
                  <p>
                    <span>Name</span>
                    <strong>{changes.name.from} → {changes.name.to}</strong>
                  </p>
                )}
                {changes.leader && (
                  <p>
                    <span>Leader</span>
                    <strong>
                      {changes.leader.from?.name ?? 'None'} →{' '}
                      {changes.leader.to?.name ?? 'None'}
                    </strong>
                  </p>
                )}
                {changes.base && (
                  <p>
                    <span>Base</span>
                    <strong>
                      {changes.base.from?.name ?? 'None'} →{' '}
                      {changes.base.to?.name ?? 'None'}
                    </strong>
                  </p>
                )}
              </div>
            )}

            <div className="transform-preview__changes">
              <div>
                <h3>Added</h3>
                {changes?.added?.length > 0 ? (
                  <ul>
                    {changes.added.map((change) => (
                      <li key={`add-${change.zone}-${change.id}`}>
                        <strong>+{change.count} {change.name}</strong>
                        <span>{change.id} · {change.zone === 'sideboard' ? 'Sideboard' : 'Draw deck'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No cards added.</p>
                )}
              </div>
              <div>
                <h3>Removed</h3>
                {changes?.removed?.length > 0 ? (
                  <ul>
                    {changes.removed.map((change) => (
                      <li key={`remove-${change.zone}-${change.id}`}>
                        <strong>−{change.count} {change.name}</strong>
                        <span>{change.id} · {change.zone === 'sideboard' ? 'Sideboard' : 'Draw deck'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No cards removed.</p>
                )}
              </div>
            </div>

            <div className="agent-dialog__actions">
              <button className="copy-button" type="button" onClick={onClose}>
                Discard
              </button>
              <button className="generate-button" type="button" onClick={onApply}>
                Apply transformation
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function ImportDeckDialog({ source, setSource, error, onClose, onSubmit }) {
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
      className="agent-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="agent-dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
      >
        <p className="eyebrow">SWUDB compatible</p>
        <h2 id="import-dialog-title">Import a deck</h2>
        <p className="agent-dialog__description">
          Paste an SWUDB JSON deck definition. Every card ID will be resolved
          against the catalog before the current deck is replaced.
        </p>

        <form onSubmit={onSubmit}>
          <label htmlFor="swudb-import-source">SWUDB JSON</label>
          <textarea
            id="swudb-import-source"
            autoFocus
            maxLength={100000}
            placeholder={'{\n  "metadata": { "name": "My deck" },\n  ...\n}'}
            required
            rows={12}
            spellCheck="false"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <div className="agent-dialog__prompt-meta">
            <span>{source.length.toLocaleString()} characters</span>
          </div>

          {error && (
            <p className="agent-dialog__error" role="alert">
              {error}
            </p>
          )}

          <div className="agent-dialog__actions">
            <button className="copy-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="generate-button"
              type="submit"
              disabled={!source.trim()}
            >
              Import deck
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

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

function DeckLibrary({ records, selectedId, onSelect, onRename }) {
  const [editingId, setEditingId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [renameError, setRenameError] = useState('')

  function beginRename(record) {
    setEditingId(record.id)
    setDraftName(record.name)
    setRenameError('')
  }

  function cancelRename() {
    setEditingId(null)
    setDraftName('')
    setRenameError('')
  }

  function submitRename(event) {
    event.preventDefault()

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
    <aside className="deck-library" aria-label="Saved decks">
      <header className="deck-library__header">
        <h2>Decks</h2>
        <strong aria-label={`${records.length} saved decks`}>{records.length}</strong>
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
            >
              <button
                className="deck-library__select"
                type="button"
                aria-pressed={record.id === selectedId}
                onClick={() => onSelect(record.id)}
              >
                <span title={record.name}>{record.name}</span>
                <small>
                  {record.kind === 'random'
                    ? 'Random slot'
                    : record.kind === 'ai'
                      ? 'AI generated'
                      : record.kind === 'imported'
                        ? 'Imported'
                        : 'Saved deck'}
                </small>
              </button>
              <button
                className="deck-library__rename-button"
                type="button"
                aria-label={`Rename ${record.name}`}
                title="Rename deck"
                onClick={() => beginRename(record)}
              >
                <RenameIcon />
              </button>
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
  )
}

function App() {
  const [catalog, setCatalog] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [cardFaces, setCardFaces] = useState([])
  const [savedDecks, setSavedDecks] = useState([])
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const [deckLibraryReady, setDeckLibraryReady] = useState(false)
  const [deckError, setDeckError] = useState('')
  const [copyStatus, setCopyStatus] = useState(null)
  const [agenticFeature, setAgenticFeature] = useState({
    authorized: false,
    enabled: false,
    available: false,
  })
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [agentStatus, setAgentStatus] = useState('idle')
  const [agentError, setAgentError] = useState('')
  const [isTransformDialogOpen, setIsTransformDialogOpen] = useState(false)
  const [transformPrompt, setTransformPrompt] = useState('')
  const [transformStatus, setTransformStatus] = useState('idle')
  const [transformError, setTransformError] = useState('')
  const [transformPreview, setTransformPreview] = useState(null)
  const [undoDeck, setUndoDeck] = useState(null)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importSource, setImportSource] = useState('')
  const [importError, setImportError] = useState('')
  const selectedDeckRecord =
    savedDecks.find((record) => record.id === selectedDeckId) ?? null
  const deck = selectedDeckRecord?.deck ?? null
  const deckName = selectedDeckRecord?.name ?? ''

  useEffect(() => {
    if (
      !copyStatus ||
      copyStatus.type !== 'success' ||
      copyStatus.canUndo
    ) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => setCopyStatus(null), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [copyStatus])

  useEffect(() => {
    if (!deckLibraryReady) {
      return
    }

    try {
      saveDeckLibrary(window.localStorage, savedDecks, selectedDeckId)
    } catch (storageError) {
      setCopyStatus({
        type: 'error',
        message:
          storageError instanceof Error
            ? `Decks could not be saved locally: ${storageError.message}`
            : 'Decks could not be saved locally.',
      })
    }
  }, [deckLibraryReady, savedDecks, selectedDeckId])

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/features', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Feature configuration is unavailable.')
        }
        return response.json()
      })
      .then((features) => {
        setAgenticFeature(
          features?.agenticDeckGeneration ?? {
            authorized: false,
            enabled: false,
            available: false,
          },
        )
      })
      .catch((featureError) => {
        if (featureError.name !== 'AbortError') {
          setAgenticFeature({
            authorized: false,
            enabled: false,
            available: false,
          })
        }
      })

    return () => controller.abort()
  }, [])

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
          const storedLibrary = loadDeckLibrary(window.localStorage)

          if (storedLibrary.records.length > 0) {
            setSavedDecks(storedLibrary.records)
            setSelectedDeckId(storedLibrary.selectedId)
          } else {
            const initialLibrary = upsertRandomDeckRecord(
              [],
              generateRandomDeck(nextCatalog),
            )
            setSavedDecks(initialLibrary.records)
            setSelectedDeckId(initialLibrary.record.id)
          }
          setDeckError('')
        } catch (generationError) {
          setSavedDecks([])
          setSelectedDeckId(null)
          setDeckError(
            generationError instanceof Error
              ? generationError.message
              : 'A random deck could not be generated.',
          )
        }
        setDeckLibraryReady(true)
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
      const result = upsertRandomDeckRecord(
        savedDecks,
        generateRandomDeck(catalog),
      )
      setSavedDecks(result.records)
      setSelectedDeckId(result.record.id)
      setUndoDeck(null)
      setDeckError('')
      setCopyStatus(null)
    } catch (generationError) {
      setDeckError(
        generationError instanceof Error
          ? generationError.message
          : 'A random deck could not be generated.',
      )
    }
  }

  async function handleCopySwudbDeck() {
    try {
      const json = formatSwudbDeck(deck, { name: deckName })

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

  function closeAgentDialog() {
    if (agentStatus !== 'loading') {
      setIsAgentDialogOpen(false)
      setAgentError('')
    }
  }

  async function handleAgentGenerate(event) {
    event.preventDefault()
    setAgentStatus('loading')
    setAgentError('')
    setCopyStatus(null)

    try {
      const response = await fetch('/api/agent/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: agentPrompt.trim(), format: 'premier' }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const details = Array.isArray(payload.issues)
          ? ` ${payload.issues.join(' ')}`
          : ''
        throw new Error(
          `${payload.error ?? `Deck request failed with HTTP ${response.status}.`}${details}`,
        )
      }

      if (!payload.deck?.leader || !payload.deck?.base) {
        throw new Error('The generated deck response was incomplete.')
      }

      const result = addDeckRecord(savedDecks, {
        deck: payload.deck,
        name: payload.name || 'Generated deck',
        kind: 'ai',
      })
      setSavedDecks(result.records)
      setSelectedDeckId(result.record.id)
      setUndoDeck(null)
      setDeckError('')
      setAgentStatus('success')
      setIsAgentDialogOpen(false)
      setCopyStatus({
        type: 'success',
        message: payload.summary || 'OpenAI deck generated successfully.',
      })
    } catch (generationError) {
      setAgentStatus('error')
      setAgentError(
        generationError instanceof Error
          ? generationError.message
          : 'The OpenAI deck could not be generated.',
      )
    }
  }

  function closeTransformDialog() {
    if (transformStatus !== 'loading') {
      setIsTransformDialogOpen(false)
      setTransformError('')
      setTransformPreview(null)
      setTransformStatus('idle')
    }
  }

  async function handleAgentTransform(event) {
    event.preventDefault()
    setTransformStatus('loading')
    setTransformError('')
    setCopyStatus(null)

    try {
      const currentDeck = serializeSwudbDeck(deck, { name: deckName })
      const response = await fetch('/api/agent/decks/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: transformPrompt.trim(),
          format: 'premier',
          currentDeck,
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const details = Array.isArray(payload.issues)
          ? ` ${payload.issues.join(' ')}`
          : ''
        throw new Error(
          `${payload.error ?? `Transformation failed with HTTP ${response.status}.`}${details}`,
        )
      }

      if (!payload.deck?.leader || !payload.deck?.base || !payload.changes) {
        throw new Error('The transformed deck response was incomplete.')
      }

      setTransformPreview({ ...payload, targetDeckId: selectedDeckId })
      setTransformStatus('success')
    } catch (transformationFailure) {
      setTransformStatus('error')
      setTransformError(
        transformationFailure instanceof Error
          ? transformationFailure.message
          : 'The deck could not be transformed.',
      )
    }
  }

  function handleApplyTransformation() {
    if (!transformPreview) {
      return
    }

    const targetDeckId = transformPreview.targetDeckId ?? selectedDeckId
    const targetRecord = savedDecks.find(
      (record) => record.id === targetDeckId,
    )

    if (!targetRecord) {
      setTransformError('The deck selected for transformation is no longer available.')
      return
    }

    const result = updateDeckRecord(
      savedDecks,
      targetDeckId,
      transformPreview.deck,
    )
    setUndoDeck({ deck: targetRecord.deck, deckId: targetDeckId })
    setSavedDecks(result.records)
    setSelectedDeckId(targetDeckId)
    setDeckError('')
    setIsTransformDialogOpen(false)
    setTransformPreview(null)
    setTransformStatus('idle')
    setCopyStatus({
      type: 'success',
      message: 'AI deck transformation applied.',
      canUndo: true,
    })
  }

  function handleUndoTransformation() {
    if (!undoDeck) {
      return
    }

    const result = updateDeckRecord(
      savedDecks,
      undoDeck.deckId,
      undoDeck.deck,
    )
    setSavedDecks(result.records)
    setSelectedDeckId(undoDeck.deckId)
    setUndoDeck(null)
    setCopyStatus({
      type: 'success',
      message: 'AI deck transformation undone.',
    })
  }

  function closeImportDialog() {
    setIsImportDialogOpen(false)
    setImportError('')
  }

  function handleImportDeck(event) {
    event.preventDefault()
    setImportError('')
    setCopyStatus(null)

    try {
      const imported = parseSwudbDeck(importSource, catalog)

      const result = addDeckRecord(savedDecks, {
        deck: imported.deck,
        name: imported.name,
        kind: 'imported',
      })
      setSavedDecks(result.records)
      setSelectedDeckId(result.record.id)
      setUndoDeck(null)
      setDeckError('')
      setIsImportDialogOpen(false)
      setCopyStatus({
        type: 'success',
        message: `${result.record.name} imported from SWUDB JSON.`,
      })
    } catch (importFailure) {
      setImportError(
        importFailure instanceof Error
          ? importFailure.message
          : 'The SWUDB deck could not be imported.',
      )
    }
  }

  function handleSelectDeck(id) {
    if (id === selectedDeckId) {
      return
    }

    setSelectedDeckId(id)
    setUndoDeck(null)
    setCopyStatus(null)
    setDeckError('')
  }

  function handleRenameDeck(id, name) {
    setSavedDecks(renameDeckRecord(savedDecks, id, name))
  }

  const groupedDrawDeck = deck ? groupDeckCards(deck.drawDeck) : []
  const groupedSideboard = deck ? groupDeckCards(deck.sideboard ?? []) : []

  return (
    <main
      className={`app${status !== 'loading' ? ' is-ready' : ''}`}
      aria-busy={status === 'loading'}
    >
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

      <div className="app__workspace">
        <DeckLibrary
          records={savedDecks}
          selectedId={selectedDeckId}
          onSelect={handleSelectDeck}
          onRename={handleRenameDeck}
        />

        <div className="app__content">
        <header className="action-tray">
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
              {status === 'loading' ? 'Loading catalog…' : 'Random Deck'}
            </button>
            <button
              className="import-button"
              type="button"
              disabled={status !== 'success' || !catalog}
              onClick={() => {
                setImportError('')
                setIsImportDialogOpen(true)
              }}
            >
              Import deck
            </button>
            <button
              className="copy-button"
              type="button"
              disabled={!deck}
              onClick={handleCopySwudbDeck}
            >
              Copy SWUDB JSON
            </button>
            {agenticFeature.authorized && agenticFeature.enabled && (
              <>
                <button
                  className="agent-button"
                  type="button"
                  disabled={
                    !agenticFeature.available ||
                    agentStatus === 'loading' ||
                    transformStatus === 'loading'
                  }
                  title={
                    agenticFeature.available
                      ? 'Build a deck from a natural-language request'
                      : 'Set SWU_OPENAI_API_KEY in .env and restart the server'
                  }
                  onClick={() => {
                    setAgentError('')
                    setIsAgentDialogOpen(true)
                  }}
                >
                  {agenticFeature.available ? 'Build with AI' : 'AI key required'}
                </button>
                {agenticFeature.available && (
                  <button
                    className="transform-button"
                    type="button"
                    disabled={
                      !deck ||
                      Boolean(deck.secondLeader) ||
                      agentStatus === 'loading' ||
                      transformStatus === 'loading'
                    }
                    title={
                      deck?.secondLeader
                        ? 'AI transformation currently supports Premier decks only'
                        : 'Revise the current deck from a natural-language request'
                    }
                    onClick={() => {
                      setTransformError('')
                      setTransformPreview(null)
                      setIsTransformDialogOpen(true)
                    }}
                  >
                    Transform with AI
                  </button>
                )}
              </>
            )}
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
              {copyStatus.canUndo && undoDeck && (
                <button
                  className="action-tray__undo"
                  type="button"
                  onClick={handleUndoTransformation}
                >
                  Undo
                </button>
              )}
            </p>
          )}
        </header>

        {deck && (
          <section className="random-deck" id="random-deck">
            <header className="random-deck__header">
              <h1>{deckName}</h1>
            </header>

            <div className="deck-section">
              <h3>{deck.secondLeader ? 'Leaders' : 'Leader'} &amp; Base</h3>
              <div className="featured-cards">
                <Card
                  card={deck.leader}
                  featured
                  flippable
                  key={deck.leader.id}
                />
                {deck.secondLeader && (
                  <Card
                    card={deck.secondLeader}
                    featured
                    flippable
                    key={deck.secondLeader.id}
                  />
                )}
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

            {groupedSideboard.length > 0 && (
              <div className="deck-section">
                <h3>Sideboard <span>{deck.sideboard.length}</span></h3>
                <div className="deck-grid">
                  {groupedSideboard.map((group) => (
                    <DeckCardStack group={group} key={group.key} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        </div>
      </div>

      {isAgentDialogOpen && (
        <AgentDeckDialog
          prompt={agentPrompt}
          setPrompt={setAgentPrompt}
          status={agentStatus}
          error={agentError}
          onClose={closeAgentDialog}
          onSubmit={handleAgentGenerate}
        />
      )}

      {isTransformDialogOpen && (
        <TransformDeckDialog
          currentDeck={deck}
          currentDeckName={deckName}
          prompt={transformPrompt}
          setPrompt={setTransformPrompt}
          status={transformStatus}
          error={transformError}
          preview={transformPreview}
          onClose={closeTransformDialog}
          onSubmit={handleAgentTransform}
          onApply={handleApplyTransformation}
        />
      )}

      {isImportDialogOpen && (
        <ImportDeckDialog
          source={importSource}
          setSource={setImportSource}
          error={importError}
          onClose={closeImportDialog}
          onSubmit={handleImportDeck}
        />
      )}
    </main>
  )
}

export default App
