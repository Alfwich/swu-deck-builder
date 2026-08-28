import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  agentChatDeckContext,
  clearAgentChat,
  createRecentAgentDeckLibrary,
  createAgentGreeting,
  getAgentAccessNotice,
  loadAgentChat,
  parseAgentCardReferences,
  saveAgentChat,
} from './agent-chat.js'
import {
  createCatalogCardReferenceIndex,
  createDeckAspectHydrator,
  groupDeckCards,
  loadPackedCatalog,
  selectRandomCardFaces,
} from './catalog.js'
import {
  formatSwudbDeck,
  parseSwudbDeck,
  serializeAgentDeckContext,
} from './integrations/swudb.js'
import {
  addDeckRecord,
  createEmptyDeck,
  deleteDeckRecord,
  loadDeckLibrary,
  renameDeckRecord,
  saveDeckLibrary,
  updateDeckRecord,
} from './deck-library.js'
import { createInitialDeck, markStarterDeckSeen } from './starter-deck.js'
import {
  getAspectIcon,
  getCardAspectPenalty,
  getDeckAspectGradient,
  getDeckAspectIcons,
} from './deck-aspects.js'
import {
  getUniqueDeckAspects,
  sortDeckCardGroups,
} from './deck-sorting.js'
import {
  DICTATION_ERROR_MESSAGES,
  getDictationPresentation,
} from './dictation.js'
import {
  deckSnapshotFingerprint,
  loadLocalDeckDatabase,
  loadLocalDeckSelection,
  resolveDatabaseDeckSource,
  saveLocalDeckDatabase,
  saveLocalDeckSelection,
  selectDatabaseDeckId,
} from './local-deck-database.js'
import {
  applyCardChange,
  applyCardChanges,
  createCardChangePresentation,
  summarizeCardChanges,
} from './deck-changes.js'
import { evaluateDeckFormats } from './deck-legality.js'
import { getCardPreviewLayout } from './card-preview.js'
import { createCardSearchIndex, fuzzySearchCards } from './card-search.js'
import {
  addCardToDeck,
  addSecondLeaderToDeck,
  removeCardFromDeck,
  removeSecondLeaderFromDeck,
  replaceBaseInDeck,
  replaceLeaderInDeck,
} from './deck-editing.js'
import { DesktopSettingsDialog } from './DesktopSettingsDialog.jsx'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

let initialAgentSessionPromise = null

function createFirstDeckLibrary(catalog, storage) {
  const initial = addDeckRecord([], createInitialDeck(catalog, storage))
  return { records: initial.records, selectedId: initial.record.id }
}

function browserDeckLibrary(catalog, storage, storedLibrary) {
  return storedLibrary.records.length > 0
    ? storedLibrary
    : createFirstDeckLibrary(catalog, storage)
}

async function databaseDeckLibrary(catalog, storage, storedLibrary, signal) {
  let snapshot = await loadLocalDeckDatabase({ signal })
  let library = resolveDatabaseDeckSource(snapshot, storedLibrary)

  if (library.needsInitialization) {
    library = browserDeckLibrary(catalog, storage, storedLibrary)
    snapshot = await saveLocalDeckDatabase(
      snapshot.revision,
      library.records,
      { signal },
    )
  }

  return {
    records: library.records,
    revision: snapshot.revision,
    selectedId: selectDatabaseDeckId(
      library.records,
      loadLocalDeckSelection(storage),
      library.selectedId,
    ),
  }
}

function deckInitializationError(error, mode) {
  if (mode === 'database') {
    return error instanceof Error
      ? `The local deck database could not be initialized: ${error.message}`
      : 'The local deck database could not be initialized.'
  }
  return error instanceof Error
    ? error.message
    : 'A new deck could not be created.'
}

function createChatMessageId() {
  return globalThis.crypto?.randomUUID?.() ??
    `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function createRemoteAgentSession() {
  const response = await fetch('/api/agent/session', { method: 'POST' })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error ?? 'An AI deck session could not be created.')
  }

  return payload
}

async function restoreRemoteAgentSession(token) {
  const response = await fetch('/api/agent/session', {
    headers: { 'X-SWU-Agent-Session': token },
  })

  if (response.status === 410) {
    return null
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error ?? 'The AI deck session could not be restored.')
  }

  return payload
}

async function sendAgentChatRequest(
  session,
  prompt,
  currentDeck,
  deckId,
  deckLibrary = [],
) {
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SWU-Agent-Session': session.token,
    },
    body: JSON.stringify({
      prompt,
      deckId,
      format: 'premier',
      currentDeck,
      ...(deckLibrary.length > 0 ? { deckLibrary } : {}),
    }),
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

async function renewAgentChatSession(contextRecord, deckName, userMessage) {
  const session = await createRemoteAgentSession()
  const activeSession = {
    token: session.token,
    expiresAt: session.expiresAt,
    hasConversation: session.hasConversation ?? false,
    ...agentChatDeckContext(contextRecord),
    messages: [],
  }
  const conversationMessages = [
    { ...createAgentGreeting(deckName), id: createChatMessageId() },
    {
      id: createChatMessageId(),
      role: 'system',
      text: 'The previous session expired, so a new conversation was started.',
    },
    userMessage,
  ]
  return { activeSession, conversationMessages }
}

function assertAgentChatResponse(response, payload) {
  if (response.ok) {
    return
  }
  const details = Array.isArray(payload.issues) ? ` ${payload.issues.join(' ')}` : ''
  throw new Error(
    `${payload.error ?? `AI deck chat failed with HTTP ${response.status}.`}${details}`,
  )
}

function createAgentChatProposal(payload, contextRecord) {
  if (payload.operation === 'answer') {
    return null
  }

  const changes =
    payload.operation === 'modify'
      ? (payload.changes ?? []).map((change) => ({
          ...change,
          status: 'pending',
        }))
      : null
  return {
    operation: payload.operation,
    name: payload.name || 'AI deck',
    deck: payload.deck,
    changes,
    visualChanges:
      payload.operation === 'modify'
        ? createCardChangePresentation(contextRecord.deck, payload.deck, changes)
        : null,
    targetDeckId: contextRecord.id,
    targetDeckName: contextRecord.name,
    targetDeckUpdatedAt: contextRecord.updatedAt,
    status: 'pending',
  }
}

function proposalActionLabel(proposal, pendingChangeCount) {
  if (proposal.operation === 'build') {
    return 'Save new deck'
  }
  return pendingChangeCount < proposal.changes.length ? 'Apply remaining' : 'Apply all'
}

function proposalStatusLabel(status) {
  if (status === 'applied') {
    return 'Applied'
  }
  return status === 'partial' ? 'Partially applied' : 'Dismissed'
}

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
  }
}

function DeckAnalysis({ deck }) {
  const analysis = analyzeDeck(deck)

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
          <strong
            aria-label={`Nominal value ${currencyFormatter.format(
              analysis.nominalValue,
            )}`}
          >
            {currencyFormatter.format(analysis.nominalValue)}
          </strong>
        </div>
      </div>

      <div className="cost-curve">
        <div className="cost-curve__plot">
          {analysis.costBuckets.map((bucket) => (
            <div
              className="cost-curve__bucket"
              key={bucket.label}
              title={`Cost ${bucket.label}: ${bucket.count} card${bucket.count === 1 ? '' : 's'
                }`}
            >
              <div className="cost-curve__bar-area">
                <span
                  className={`cost-curve__count${
                    bucket.count === 0 ? ' is-empty' : ''
                  }`}
                >
                  {bucket.count}
                </span>
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

function DeckLegality({ deck }) {
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

function Card({ card, featured = false, flippable = false, onRemove = null }) {
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

function EmptyIdentityCard({ type }) {
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

function DeckIdentities({ deck, onRemoveSecondLeader }) {
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

function DeckCardStack({ aspectPenalty = 0, group, onRemove }) {
  const visibleCards = group.cards.slice(0, 3)
  const stackDepth = Math.min(group.count - 1, 2)
  const title = [group.card.name, group.card.subtitle]
    .filter(Boolean)
    .join(' — ')

  return (
    <article
      className={`deck-card deck-card--stacked${
        aspectPenalty > 0 ? ' is-out-of-aspect' : ''
      }`}
      style={{ '--stack-depth': stackDepth }}
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

function DictationControl({ disabled = false, onTranscript }) {
  const recognitionRef = useRef(null)
  const onTranscriptRef = useRef(onTranscript)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
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
      setIsProcessing(false)
      setIsListening(true)
    }
    recognition.onend = () => {
      setIsListening(false)
      setIsProcessing(false)
    }
    recognition.onerror = (event) => {
      setIsListening(false)
      setIsProcessing(false)
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
      setIsProcessing(false)
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
      setIsListening(false)
      setIsProcessing(true)
      try {
        recognition.stop()
      } catch {
        setIsProcessing(false)
        setError('Dictation could not be stopped. Please try again.')
      }
      return
    }

    setError('')
    setIsProcessing(false)
    try {
      recognition.start()
    } catch {
      setError('Dictation is already starting. Please try again.')
    }
  }

  const presentation = getDictationPresentation({
    disabled,
    error,
    isListening,
    isProcessing,
    isSupported,
  })

  return (
    <div className="dictation-control">
      <button
        className={`dictation-button is-${presentation.state}`}
        type="button"
        disabled={presentation.buttonDisabled}
        aria-pressed={isListening}
        aria-busy={isProcessing}
        title={presentation.title}
        onClick={toggleDictation}
      >
        <span aria-hidden="true">
          {isProcessing ? '' : isListening ? '■' : '●'}
        </span>
        {presentation.label}
      </button>
      <span className={`dictation-control__status${error ? ' is-error' : ''}`} aria-live="polite">
        {presentation.message}
      </span>
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

function DeckCardSearchActions({
  deck,
  card,
  type,
  isCurrentBase,
  isCurrentLeader,
  isCurrentSecondLeader,
  onAddCard,
  onAddSecondLeader,
  onUseBase,
  onUseLeader,
}) {
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
    </span>
  )
}

function DeckCardSearchResult({ deck, card, ...actions }) {
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
          src={card.url}
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
      </span>
      <DeckCardSearchActions
        {...actions}
        card={card}
        deck={deck}
        type={type}
        isCurrentBase={isCurrentBase}
        isCurrentLeader={isCurrentLeader}
        isCurrentSecondLeader={isCurrentSecondLeader}
      />
    </article>
  )
}

function DeckCardSearch({ deck, query, results, onQueryChange, ...actions }) {
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
              deck={deck}
              key={card.id}
            />
          ))}
        </div>
      )}
    </section>
  )
}

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

export function CardChangesDialog({ proposal, onClose }) {
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
            <span>Proposed deck update</span>
            <h2 id="card-changes-title">Card changes</h2>
            <p>{proposal.targetDeckName}</p>
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

function AgentChatChangeCard({ entry, onHidePreview, onPreviewCard }) {
  const title = [entry?.name, entry?.subtitle].filter(Boolean).join(' — ')
  const isHorizontal = ['leader', 'secondLeader', 'base'].includes(entry?.zone)

  return (
    <div
      className={`agent-chat-change__card${isHorizontal ? ' is-horizontal' : ''}`}
    >
      <button
        type="button"
        className={`agent-chat-change__art${isHorizontal ? ' is-horizontal' : ''}`}
        aria-label={`View ${title}`}
        title={`View ${title}`}
        disabled={!entry?.card?.url}
        onBlur={onHidePreview}
        onFocus={(event) => entry?.card && onPreviewCard(entry.card, event)}
        onPointerEnter={(event) =>
          entry?.card && onPreviewCard(entry.card, event)
        }
        onPointerMove={(event) =>
          entry?.card && onPreviewCard(entry.card, event)
        }
        onPointerLeave={(event) => {
          if (event.currentTarget === document.activeElement) {
            onPreviewCard(entry.card, event)
          } else {
            onHidePreview()
          }
        }}
      >
        {entry?.card?.url ? (
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
      </button>
      <span title={title}>{entry?.name ?? entry?.id}</span>
    </div>
  )
}

function AgentChatChangeRow({
  change,
  visualChange,
  onApply,
  onHidePreview,
  onPreviewCard,
}) {
  const status = change.status ?? 'pending'
  const zoneLabel =
    change.zone === 'secondLeader'
      ? 'Second leader'
      : change.zone === 'sideboard'
        ? 'Sideboard'
        : 'Draw deck'

  return (
    <article className={`agent-chat-change is-${change.type} is-${status}`}>
      <div className="agent-chat-change__heading">
        <strong>{change.type}</strong>
        <span>{zoneLabel} · ×{change.count}</span>
      </div>
      <div className="agent-chat-change__cards">
        {change.type === 'replace' ? (
          <>
            <AgentChatChangeCard
              entry={visualChange?.from}
              onHidePreview={onHidePreview}
              onPreviewCard={onPreviewCard}
            />
            <span className="agent-chat-change__arrow" aria-hidden="true">→</span>
            <AgentChatChangeCard
              entry={visualChange?.to}
              onHidePreview={onHidePreview}
              onPreviewCard={onPreviewCard}
            />
          </>
        ) : (
          <AgentChatChangeCard
            entry={visualChange}
            onHidePreview={onHidePreview}
            onPreviewCard={onPreviewCard}
          />
        )}
      </div>
      {status === 'pending' ? (
        <button type="button" onClick={() => onApply(change.id)}>
          Apply
        </button>
      ) : (
        <small>{status === 'applied' ? 'Applied' : 'Dismissed'}</small>
      )}
    </article>
  )
}

function AgentChatProposal({
  message,
  onApply,
  onApplyChange,
  onDismiss,
  onHidePreview,
  onPreviewCard,
}) {
  const proposal = message.proposal
  const pendingChangeCount =
    proposal.changes?.filter((change) => change.status === 'pending').length ?? 0
  const appliedChangeCount =
    proposal.changes?.filter((change) => change.status === 'applied').length ?? 0
  const visualChanges =
    proposal.visualChanges ??
    createCardChangePresentation(null, proposal.deck, proposal.changes)
  const summary = summarizeCardChanges(visualChanges)
  const visualChangesById = new Map(
    [
      ...(visualChanges?.replacements ?? []),
      ...(visualChanges?.additions ?? []),
      ...(visualChanges?.removals ?? []),
    ].map((change) => [change.changeId, change]),
  )

  return (
    <div className="agent-chat__proposal">
      <strong>
        {proposal.operation === 'build'
          ? `New deck: ${proposal.name}`
          : `Update ${proposal.targetDeckName}`}
      </strong>
      {proposal.operation === 'modify' && (
        <>
          <small>
            {summary.replacements} replacements · {summary.additions} additions ·{' '}
            {summary.removals} removals
          </small>
          <div className="agent-chat-change-list">
            {proposal.changes.map((change) => (
              <AgentChatChangeRow
                change={change}
                key={change.id}
                visualChange={visualChangesById.get(change.id)}
                onApply={(changeId) => onApplyChange(message.id, changeId)}
                onHidePreview={onHidePreview}
                onPreviewCard={onPreviewCard}
              />
            ))}
          </div>
        </>
      )}
      {proposal.status === 'pending' ? (
        <div className="agent-chat__proposal-actions">
          <button type="button" onClick={() => onDismiss(message.id)}>
            {appliedChangeCount > 0 ? 'Dismiss remaining' : 'Dismiss'}
          </button>
          <button
            className="is-primary"
            type="button"
            onClick={() => onApply(message.id)}
          >
            {proposalActionLabel(proposal, pendingChangeCount)}
          </button>
        </div>
      ) : (
        <small className={`is-${proposal.status}`}>
          {proposalStatusLabel(proposal.status)}
        </small>
      )}
    </div>
  )
}

function AgentMessageText({
  cardsById,
  onHidePreview,
  onPreviewCard,
  text,
}) {
  const segments = parseAgentCardReferences(text, cardsById)

  return (
    <p>
      {segments.map((segment, index) =>
        segment.type === 'card' ? (
          <button
            className={`agent-chat-card-reference${
              ['Leader', 'Base'].includes(segment.card.type)
                ? ' is-horizontal'
                : ''
            }`}
            type="button"
            key={`${segment.id}-${index}`}
            title={`View ${segment.card.name}`}
            aria-label={`View ${segment.card.name}, ${segment.id}`}
            onBlur={onHidePreview}
            onFocus={(event) => onPreviewCard(segment.card, event)}
            onPointerEnter={(event) => onPreviewCard(segment.card, event)}
            onPointerMove={(event) => onPreviewCard(segment.card, event)}
            onPointerLeave={(event) => {
              if (event.currentTarget === document.activeElement) {
                onPreviewCard(segment.card, event)
              } else {
                onHidePreview()
              }
            }}
          >
            <img
              src={segment.card.url}
              alt=""
              loading="lazy"
              decoding="async"
              draggable="false"
              onLoad={revealImage}
            />
          </button>
        ) : (
          <span key={`text-${index}`}>{segment.text}</span>
        ),
      )}
    </p>
  )
}

function AgentCardHoverPreview({ preview }) {
  const title = [preview.card.name, preview.card.subtitle]
    .filter(Boolean)
    .join(' — ')
  const isHorizontal = ['Leader', 'Base'].includes(preview.card.type)
  const layout = getCardPreviewLayout({
    anchorX: preview.anchorX,
    anchorY: preview.anchorY,
    horizontal: isHorizontal,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  })

  return (
    <aside
      aria-hidden="true"
      className={`agent-card-hover-preview${isHorizontal ? ' is-horizontal' : ''}`}
      style={layout}
    >
      <img
        src={preview.card.url}
        alt={title}
        decoding="async"
        draggable="false"
        onLoad={revealImage}
      />
    </aside>
  )
}

function AgentChatPanel({
  accessAvailable,
  available,
  cardReferences,
  desktopSettingsAvailable,
  error,
  featureResolved,
  input,
  isOpen,
  messages,
  onApplyChange,
  onApplyProposal,
  onDismissProposal,
  onInputChange,
  onHidePreview,
  onNewSession,
  onOpenDesktopSettings,
  onPreviewCard,
  onSubmit,
  onToggle,
  status,
}) {
  const messagesRef = useRef(null)
  const accessNotice = getAgentAccessNotice({
    resolved: featureResolved,
    available: accessAvailable,
    desktopSettingsAvailable,
  })

  useEffect(() => {
    const container = messagesRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages, status])

  return (
    <div className={`agent-chat${isOpen ? ' is-open' : ''}`}>
      {isOpen && (
        <aside className="agent-chat__panel" aria-label="AI deck assistant">
          <header className="agent-chat__header">
            <div>
              <span>AI deck assistant</span>
            </div>
            <div className="agent-chat__header-actions">
              {accessAvailable && (
                <button
                  type="button"
                  disabled={!available}
                  onClick={onNewSession}
                  title="Start a new session"
                >
                  New
                </button>
              )}
              <button type="button" onClick={onToggle} aria-label="Close AI deck assistant">
                ×
              </button>
            </div>
          </header>

          <div className="agent-chat__messages" ref={messagesRef} aria-live="polite">
            {accessNotice && (
              <article className="agent-chat__availability">
                <h2>{accessNotice.title}</h2>
                <p>{accessNotice.text}</p>
                {accessNotice.features?.length > 0 && (
                  <section className="agent-chat__availability-features">
                    <h3>{accessNotice.featureTitle}</h3>
                    <ul>
                      {accessNotice.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {accessNotice.link && (
                  <a
                    href={accessNotice.link}
                    rel={accessNotice.externalLink ? 'noreferrer' : undefined}
                    target={accessNotice.externalLink ? '_blank' : undefined}
                  >
                    {accessNotice.linkLabel}
                  </a>
                )}
                {accessNotice.action === 'open-desktop-settings' && (
                  <button
                    className="agent-chat__availability-action"
                    type="button"
                    onClick={onOpenDesktopSettings}
                  >
                    {accessNotice.actionLabel}
                  </button>
                )}
              </article>
            )}

            {!accessNotice &&
              messages.map((message) => (
                <article
                  className={`agent-chat__message is-${message.role}`}
                  key={message.id}
                >
                  <span>
                    {message.role === 'user'
                      ? 'You'
                      : message.role === 'system'
                        ? 'Session'
                        : 'Deck assistant'}
                  </span>
                  <AgentMessageText
                    cardsById={cardReferences}
                    onHidePreview={onHidePreview}
                    onPreviewCard={onPreviewCard}
                    text={message.text}
                  />
                  {Array.isArray(message.features) && (
                    <ul className="agent-chat__message-features">
                      {message.features
                        .filter((feature) => typeof feature === 'string')
                        .map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                  )}
                  {typeof message.followup === 'string' && (
                    <p className="agent-chat__message-followup">
                      {message.followup}
                    </p>
                  )}

                  {message.proposal && (
                    <AgentChatProposal
                      message={message}
                      onApply={onApplyProposal}
                      onApplyChange={onApplyChange}
                      onDismiss={onDismissProposal}
                      onHidePreview={onHidePreview}
                      onPreviewCard={onPreviewCard}
                    />
                  )}
                </article>
              ))}

            {!accessNotice && status === 'loading' && (
              <div className="agent-chat__thinking" role="status">
                <span />
                <span />
                <span />
                Thinking
              </div>
            )}
          </div>

          {accessAvailable && error && (
            <p className="agent-chat__error" role="alert">
              {error}
            </p>
          )}

          {accessAvailable && (
            <form className="agent-chat__composer" onSubmit={onSubmit}>
              <textarea
                aria-label="Message the AI deck assistant"
                disabled={!available || status === 'loading'}
                maxLength={4000}
                placeholder="Modify a deck, build a new one, or ask a question…"
                rows={3}
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
              />
              <div className="agent-chat__composer-actions">
                <DictationControl
                  disabled={!available || status === 'loading'}
                  onTranscript={(transcript) =>
                    onInputChange(
                      [input.trimEnd(), transcript]
                        .filter(Boolean)
                        .join(' ')
                        .slice(0, 4000),
                    )
                  }
                />
                <button
                  className="agent-chat__send"
                  type="submit"
                  disabled={!available || status === 'loading' || !input.trim()}
                >
                  Send
                </button>
              </div>
            </form>
          )}
        </aside>
      )}

      <button
        className="agent-chat__launcher"
        type="button"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close AI deck assistant' : 'Open AI deck assistant'}
        title="Open AI deck assistant"
        onClick={onToggle}
      >
        <span aria-hidden="true">✦</span>
        {isOpen ? 'Close' : 'Deck assistant'}
      </button>
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

function DeckAspectBadges({ deck }) {
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

function DrawDeckSortControls({
  aspects,
  costDirection,
  onAspectChange,
  onCostChange,
  priorityAspect,
}) {
  return (
    <div className="draw-deck-sort" aria-label="Draw deck sorting controls">
      <div className="draw-deck-sort__group" role="group" aria-label="Sort by cost">
        <span>Cost</span>
        <button
          type="button"
          aria-label={
            costDirection === 'asc'
              ? 'Clear ascending cost sort'
              : 'Sort by cost ascending'
          }
          aria-pressed={costDirection === 'asc'}
          onClick={() =>
            onCostChange(costDirection === 'asc' ? 'none' : 'asc')
          }
        >
          ASC
        </button>
        <button
          type="button"
          aria-label={
            costDirection === 'desc'
              ? 'Clear descending cost sort'
              : 'Sort by cost descending'
          }
          aria-pressed={costDirection === 'desc'}
          onClick={() =>
            onCostChange(costDirection === 'desc' ? 'none' : 'desc')
          }
        >
          DESC
        </button>
      </div>

      {aspects.length > 0 && (
        <div
          className="draw-deck-sort__group is-aspects"
          role="group"
          aria-label="Prioritize an aspect"
        >
          <span>Aspect first</span>
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

function DeleteDeckDialog({ record, onCancel, onConfirm }) {
  useEffect(() => {
    function handleKeyDown(event) {
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
          removes it from this browser and cannot be undone.
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

function DeckLibrary({
  records,
  selectedId,
  persistenceMode,
  persistenceState,
  onSelect,
  onRename,
  onDelete,
}) {
  const [editingId, setEditingId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

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
              }}
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

function getDeckExportDisabledReason(deck) {
  if (!deck?.leader || !deck?.base) {
    return 'Choose a leader and base first'
  }
  if (deck.drawDeck.length < 30) {
    return 'Add at least 30 draw-deck cards first'
  }
  return null
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
  const [deckPersistenceMode, setDeckPersistenceMode] = useState('browser')
  const [deckPersistenceState, setDeckPersistenceState] = useState('loading')
  const [deckPersistenceError, setDeckPersistenceError] = useState('')
  const [copyStatus, setCopyStatus] = useState(null)
  const [agenticFeature, setAgenticFeature] = useState({
    authorized: false,
    enabled: false,
    available: false,
    authenticationAvailable: false,
    leaseExpiresAt: null,
  })
  const [agenticFeatureResolved, setAgenticFeatureResolved] = useState(false)
  const [desktopSettingsAvailable, setDesktopSettingsAvailable] = useState(false)
  const [isDesktopSettingsOpen, setIsDesktopSettingsOpen] = useState(false)
  const [agentChat, setAgentChat] = useState(null)
  const [agentChatInput, setAgentChatInput] = useState('')
  const [agentChatStatus, setAgentChatStatus] = useState('idle')
  const [agentChatError, setAgentChatError] = useState('')
  const [isAgentChatOpen, setIsAgentChatOpen] = useState(false)
  const [agentCardPreview, setAgentCardPreview] = useState(null)
  const [drawDeckCostSort, setDrawDeckCostSort] = useState('none')
  const [drawDeckAspectSort, setDrawDeckAspectSort] = useState(null)
  const agentSessionRequestRef = useRef(0)
  const deckDatabaseRevisionRef = useRef(0)
  const deckDatabasePersistedRef = useRef('')
  const deckDatabaseLatestRef = useRef('')
  const deckDatabaseWriteChainRef = useRef(Promise.resolve())
  const deckDatabaseWritesBlockedRef = useRef(false)
  const [undoDeck, setUndoDeck] = useState(null)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importSource, setImportSource] = useState('')
  const [importError, setImportError] = useState('')
  const [cardSearchQuery, setCardSearchQuery] = useState('')
  const selectedDeckRecord =
    savedDecks.find((record) => record.id === selectedDeckId) ?? null
  const deck = selectedDeckRecord?.deck ?? null
  const deckName = selectedDeckRecord?.name ?? ''
  const deckExportDisabledReason = getDeckExportDisabledReason(deck)
  const agentCardReferences = useMemo(
    () => (catalog ? createCatalogCardReferenceIndex(catalog) : new Map()),
    [catalog],
  )
  const cardSearchIndex = useMemo(
    () => (catalog ? createCardSearchIndex(catalog) : []),
    [catalog],
  )
  const cardSearchResults = useMemo(
    () => fuzzySearchCards(cardSearchIndex, cardSearchQuery),
    [cardSearchIndex, cardSearchQuery],
  )

  const handleNewAgentSession = useCallback(async () => {
    if (!agenticFeature.available || !selectedDeckRecord) {
      return
    }

    const contextRecord = selectedDeckRecord
    const previousToken = agentChat?.token
    const requestId = ++agentSessionRequestRef.current
    setAgentChatStatus('loading')
    setAgentChatError('')
    setAgentChat({
      token: null,
      expiresAt: null,
      hasConversation: false,
      ...agentChatDeckContext(contextRecord),
      messages: [
        {
          ...createAgentGreeting(contextRecord.name),
          id: createChatMessageId(),
        },
      ],
    })

    try {
      if (previousToken) {
        await fetch('/api/agent/session', {
          method: 'DELETE',
          headers: { 'X-SWU-Agent-Session': previousToken },
        }).catch(() => null)
      }

      clearAgentChat(window.localStorage)
      const session = await createRemoteAgentSession()
      if (requestId !== agentSessionRequestRef.current) {
        await fetch('/api/agent/session', {
          method: 'DELETE',
          headers: { 'X-SWU-Agent-Session': session.token },
        }).catch(() => null)
        return
      }

      setAgentChat({
        token: session.token,
        expiresAt: session.expiresAt,
        hasConversation: session.hasConversation ?? false,
        ...agentChatDeckContext(contextRecord),
        messages: [
          {
            ...createAgentGreeting(contextRecord.name),
            id: createChatMessageId(),
          },
        ],
      })
      setAgentChatInput('')
      setAgentChatStatus('idle')
    } catch (sessionError) {
      if (requestId !== agentSessionRequestRef.current) {
        return
      }

      setAgentChatStatus('error')
      setAgentChatError(
        sessionError instanceof Error
          ? sessionError.message
          : 'A new AI deck session could not be started.',
      )
    }
  }, [agentChat?.token, agenticFeature.available, selectedDeckRecord])

  const initializeAgentSession = useEffectEvent((requestId, isCurrent) => {
    const contextRecord = selectedDeckRecord
    if (!contextRecord) {
      return
    }

    const restored = loadAgentChat(window.localStorage)
    const canRestore = Boolean(restored?.token)
    initialAgentSessionPromise ??= (async () => {
      const remote = canRestore
        ? await restoreRemoteAgentSession(restored.token)
        : null
      return remote ?? createRemoteAgentSession()
    })()

    initialAgentSessionPromise
      .then((session) => {
        if (!isCurrent() || requestId !== agentSessionRequestRef.current) {
          return
        }

        setAgentChat({
          token: session.token,
          expiresAt: session.expiresAt,
          hasConversation: session.hasConversation ?? false,
          ...(canRestore
            ? {
                deckId: restored.deckId ?? null,
                deckName: restored.deckName ?? '',
                deckUpdatedAt: restored.deckUpdatedAt ?? null,
              }
            : agentChatDeckContext(contextRecord)),
          messages:
            canRestore &&
            restored?.token === session.token &&
            restored.messages.length > 0
              ? restored.messages
              : [
                  {
                    ...createAgentGreeting(contextRecord.name),
                    id: createChatMessageId(),
                  },
                ],
        })
        setAgentChatError('')
      })
      .catch((sessionError) => {
        initialAgentSessionPromise = null
        if (isCurrent() && requestId === agentSessionRequestRef.current) {
          setAgentChatError(
            sessionError instanceof Error
              ? sessionError.message
              : 'The AI deck session could not be initialized.',
          )
        }
      })
  })

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
      return undefined
    }

    if (deckPersistenceMode === 'database') {
      saveLocalDeckSelection(window.localStorage, selectedDeckId)
      const fingerprint = deckSnapshotFingerprint(savedDecks)
      deckDatabaseLatestRef.current = fingerprint
      if (
        deckDatabaseWritesBlockedRef.current ||
        fingerprint === deckDatabasePersistedRef.current
      ) {
        return undefined
      }

      const records = savedDecks
      const timeoutId = window.setTimeout(() => {
        setDeckPersistenceState('saving')
        const save = async () => {
          if (
            deckDatabaseWritesBlockedRef.current ||
            fingerprint === deckDatabasePersistedRef.current
          ) {
            return
          }

          try {
            const snapshot = await saveLocalDeckDatabase(
              deckDatabaseRevisionRef.current,
              records,
            )
            deckDatabaseRevisionRef.current = snapshot.revision
            deckDatabasePersistedRef.current = fingerprint
            setDeckPersistenceState(
              deckDatabaseLatestRef.current === fingerprint
                ? 'saved'
                : 'saving',
            )
            setDeckPersistenceError('')
          } catch (storageError) {
            deckDatabaseWritesBlockedRef.current = true
            setDeckPersistenceState('error')
            setDeckPersistenceError(
              storageError?.code === 'revision_conflict'
                ? 'The local deck database changed in another browser tab. Reload before making more changes.'
                : storageError instanceof Error
                  ? `Decks could not be saved to the local database: ${storageError.message}`
                  : 'Decks could not be saved to the local database.',
            )
          }
        }

        deckDatabaseWriteChainRef.current =
          deckDatabaseWriteChainRef.current.then(save, save)
      }, 350)

      return () => window.clearTimeout(timeoutId)
    }

    let statusTimeoutId
    try {
      saveDeckLibrary(window.localStorage, savedDecks, selectedDeckId)
    } catch (storageError) {
      statusTimeoutId = window.setTimeout(() => {
        setCopyStatus({
          type: 'error',
          message:
            storageError instanceof Error
              ? `Decks could not be saved locally: ${storageError.message}`
              : 'Decks could not be saved locally.',
        })
      }, 0)
    }

    return () => window.clearTimeout(statusTimeoutId)
  }, [deckLibraryReady, deckPersistenceMode, savedDecks, selectedDeckId])

  useEffect(() => {
    if (!agentChat) {
      return
    }

    saveAgentChat(window.localStorage, agentChat)
  }, [agentChat])

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
        setDeckPersistenceMode(
          features?.deckPersistence?.mode === 'database'
            ? 'database'
            : 'browser',
        )
        setAgenticFeature(
          features?.agenticDeckGeneration ?? {
            authorized: false,
            enabled: false,
            available: false,
            authenticationAvailable: false,
            leaseExpiresAt: null,
          },
        )
        setDesktopSettingsAvailable(
          features?.desktop?.settingsAvailable === true,
        )
        setAgenticFeatureResolved(true)
      })
      .catch((featureError) => {
        if (featureError.name !== 'AbortError') {
          setDeckPersistenceMode('browser')
          setAgenticFeature({
            authorized: false,
            enabled: false,
            available: false,
            authenticationAvailable: false,
            leaseExpiresAt: null,
          })
          setDesktopSettingsAvailable(false)
          setAgenticFeatureResolved(true)
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const expiresAt = Date.parse(agenticFeature.leaseExpiresAt)
    if (!Number.isFinite(expiresAt)) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setAgenticFeature((current) => ({
        ...current,
        authorized: false,
        enabled: false,
        available: false,
        authenticationAvailable: true,
        leaseExpiresAt: null,
      }))
    }, Math.max(0, expiresAt - Date.now()))

    return () => window.clearTimeout(timeoutId)
  }, [agenticFeature.leaseExpiresAt])

  useEffect(() => {
    if (!agenticFeature.available || !deckLibraryReady) {
      return undefined
    }

    let isCurrent = true
    const requestId = ++agentSessionRequestRef.current
    initializeAgentSession(requestId, () => isCurrent)

    return () => {
      isCurrent = false
    }
  }, [agenticFeature.available, deckLibraryReady])

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

  useEffect(() => {
    if (!catalog || !agenticFeatureResolved || deckLibraryReady) {
      return undefined
    }

    const controller = new AbortController()
    let isCurrent = true

    async function initializeDeckLibrary() {
      try {
        const storedLibrary = loadDeckLibrary(window.localStorage)
        const library = deckPersistenceMode === 'database'
          ? await databaseDeckLibrary(
              catalog,
              window.localStorage,
              storedLibrary,
              controller.signal,
            )
          : browserDeckLibrary(catalog, window.localStorage, storedLibrary)

        if (!isCurrent) {
          return
        }

        if (library.records.length > 0) {
          markStarterDeckSeen(window.localStorage)
        }
        const hydrateDeckAspects = createDeckAspectHydrator(catalog)
        const hydratedRecords = library.records.map((record) => ({
          ...record,
          deck: hydrateDeckAspects(record.deck),
        }))
        if (deckPersistenceMode === 'database') {
          const fingerprint = deckSnapshotFingerprint(hydratedRecords)
          deckDatabaseRevisionRef.current = library.revision
          deckDatabasePersistedRef.current = fingerprint
          deckDatabaseLatestRef.current = fingerprint
          deckDatabaseWritesBlockedRef.current = false
          setDeckPersistenceState('saved')
          setDeckPersistenceError('')
        }
        setSavedDecks(hydratedRecords)
        setSelectedDeckId(library.selectedId)
        setDeckError('')
        setDeckLibraryReady(true)
      } catch (generationError) {
        if (!isCurrent || generationError.name === 'AbortError') {
          return
        }

        setSavedDecks([])
        setSelectedDeckId(null)
        if (deckPersistenceMode === 'database') {
          setDeckPersistenceState('error')
          setDeckPersistenceError(deckInitializationError(
            generationError,
            deckPersistenceMode,
          ))
        } else {
          setDeckError(deckInitializationError(generationError, deckPersistenceMode))
        }
      }
    }

    initializeDeckLibrary()

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [
    agenticFeatureResolved,
    catalog,
    deckLibraryReady,
    deckPersistenceMode,
  ])

  function handleNewDeck() {
    const result = addDeckRecord(savedDecks, {
      deck: createEmptyDeck(),
      name: 'New deck',
    })
    setSavedDecks(result.records)
    setSelectedDeckId(result.record.id)
    setUndoDeck(null)
    setDeckError('')
    setCopyStatus(null)
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

  function handleDeleteDeck(id) {
    if (savedDecks.length === 1) {
      const replacement = addDeckRecord([], {
        deck: createEmptyDeck(),
        name: 'New deck',
      })
      setSavedDecks(replacement.records)
      setSelectedDeckId(replacement.record.id)
      setUndoDeck(null)
      setCopyStatus(null)
      setDeckError('')
      return
    }

    const result = deleteDeckRecord(savedDecks, id, selectedDeckId)
    setSavedDecks(result.records)
    setSelectedDeckId(result.selectedId)
    setUndoDeck(null)
    setCopyStatus(null)
    setDeckError('')
  }

  function commitManualDeck(nextDeck, message) {
    if (!selectedDeckRecord) {
      return
    }

    const result = updateDeckRecord(savedDecks, selectedDeckRecord.id, nextDeck)
    setSavedDecks(result.records)
    setUndoDeck(null)
    setDeckError('')
    setCopyStatus({
      type: 'success',
      message,
    })
  }

  function handleAddCard(zone, card) {
    if (!selectedDeckRecord) {
      return
    }

    const zoneLabel = zone === 'sideboard' ? 'sideboard' : 'draw deck'
    commitManualDeck(
      addCardToDeck(selectedDeckRecord.deck, zone, card),
      `${card.name} added to the ${zoneLabel}.`,
    )
  }

  function handleAddSecondLeader(card) {
    if (!selectedDeckRecord) {
      return
    }

    try {
      commitManualDeck(
        addSecondLeaderToDeck(selectedDeckRecord.deck, card),
        `${card.name} added as the second leader.`,
      )
    } catch (leaderError) {
      setCopyStatus({
        type: 'error',
        message:
          leaderError instanceof Error
            ? leaderError.message
            : 'The second leader could not be added.',
      })
    }
  }

  function handleUseLeader(card) {
    if (!selectedDeckRecord) {
      return
    }

    commitManualDeck(
      replaceLeaderInDeck(selectedDeckRecord.deck, card),
      `${card.name} is now the deck leader.`,
    )
  }

  function handleUseBase(card) {
    if (!selectedDeckRecord) {
      return
    }

    commitManualDeck(
      replaceBaseInDeck(selectedDeckRecord.deck, card),
      `${card.name} is now the deck base.`,
    )
  }

  function handleRemoveSecondLeader() {
    if (!selectedDeckRecord?.deck.secondLeader) {
      return
    }

    const name = selectedDeckRecord.deck.secondLeader.name
    commitManualDeck(
      removeSecondLeaderFromDeck(selectedDeckRecord.deck),
      `${name} removed as the second leader.`,
    )
  }

  function handleRemoveCard(zone, card) {
    if (!selectedDeckRecord) {
      return
    }

    try {
      const nextDeck = removeCardFromDeck(selectedDeckRecord.deck, zone, card)
      const result = updateDeckRecord(savedDecks, selectedDeckRecord.id, nextDeck)
      setSavedDecks(result.records)
      setUndoDeck(null)
      setDeckError('')
      setCopyStatus({
        type: 'success',
        message: `Removed one copy of ${card.name}.`,
      })
    } catch (removeError) {
      setCopyStatus({
        type: 'error',
        message:
          removeError instanceof Error
            ? removeError.message
            : 'The card could not be removed.',
      })
    }
  }

  function handleToggleAgentChat() {
    if (isAgentChatOpen) {
      setIsAgentChatOpen(false)
      return
    }

    setIsAgentChatOpen(true)
  }

  function handleShowAgentCardPreview(card, event) {
    const isPointerEvent = event.type.startsWith('pointer')
    const bounds = event.currentTarget.getBoundingClientRect()

    setAgentCardPreview({
      card,
      anchorX: isPointerEvent ? event.clientX : bounds.right,
      anchorY: isPointerEvent
        ? event.clientY
        : bounds.top + bounds.height / 2,
    })
  }

  async function handleAgentChatSubmit(event) {
    event.preventDefault()

    const prompt = agentChatInput.trim()
    if (!prompt || !agentChat?.token || !selectedDeckRecord) {
      return
    }
    const requestId = agentSessionRequestRef.current
    const userMessage = {
      id: createChatMessageId(),
      role: 'user',
      text: prompt,
    }
    const currentDeck = serializeAgentDeckContext(deck, {
      name: deckName,
    })
    let activeSession = agentChat
    let conversationMessages = [...agentChat.messages, userMessage]

    setAgentChat({ ...agentChat, messages: conversationMessages })
    setAgentChatInput('')
    setAgentChatError('')
    setAgentChatStatus('loading')

    try {
      let { response, payload } = await sendAgentChatRequest(
        activeSession,
        prompt,
        currentDeck,
        selectedDeckRecord.id,
        activeSession.hasConversation
          ? []
          : createRecentAgentDeckLibrary(savedDecks),
      )

      if (response.status === 410) {
        const renewed = await renewAgentChatSession(
          selectedDeckRecord,
          deckName,
          userMessage,
        )
        activeSession = renewed.activeSession
        conversationMessages = renewed.conversationMessages
        setAgentChat({ ...activeSession, messages: conversationMessages })
        const retried = await sendAgentChatRequest(
          activeSession,
          prompt,
          currentDeck,
          selectedDeckRecord.id,
          activeSession.hasConversation
            ? []
            : createRecentAgentDeckLibrary(savedDecks),
        )
        response = retried.response
        payload = retried.payload
      }

      assertAgentChatResponse(response, payload)

      if (requestId !== agentSessionRequestRef.current) {
        return
      }

      const proposal = createAgentChatProposal(payload, selectedDeckRecord)
      const assistantMessage = {
        id: createChatMessageId(),
        role: 'assistant',
        text: payload.message || 'The deck assistant completed the request.',
        proposal,
      }

      setAgentChat({
        token: payload.session?.token ?? activeSession.token,
        expiresAt: payload.session?.expiresAt ?? activeSession.expiresAt,
        hasConversation:
          payload.session?.hasConversation ?? activeSession.hasConversation,
        ...agentChatDeckContext(selectedDeckRecord),
        messages: [...conversationMessages, assistantMessage],
      })
      setAgentChatStatus('idle')
    } catch (chatFailure) {
      if (requestId !== agentSessionRequestRef.current) {
        return
      }

      setAgentChatStatus('error')
      setAgentChatError(
        chatFailure instanceof Error
          ? chatFailure.message
          : 'The AI deck assistant could not complete the request.',
      )
    }
  }

  function updateChatProposal(messageId, update, contextRecord = null) {
    setAgentChat((current) =>
      current
        ? {
            ...current,
            ...(contextRecord ? agentChatDeckContext(contextRecord) : {}),
            messages: current.messages.map((message) =>
              message.id === messageId && message.proposal
                ? {
                    ...message,
                    proposal: update(message.proposal),
                  }
                : message,
            ),
          }
        : current,
    )
  }

  function updateProposalStatus(
    messageId,
    proposalStatus,
    contextRecord = null,
  ) {
    updateChatProposal(
      messageId,
      (proposal) => ({
        ...proposal,
        status: proposalStatus,
      }),
      contextRecord,
    )
  }

  function handleDismissChatProposal(messageId) {
    updateChatProposal(messageId, (proposal) => {
      const changes = proposal.changes?.map((change) =>
        change.status === 'pending'
          ? { ...change, status: 'dismissed' }
          : change,
      )
      const hasAppliedChange = changes?.some(
        (change) => change.status === 'applied',
      )

      return {
        ...proposal,
        changes,
        status: hasAppliedChange ? 'partial' : 'dismissed',
      }
    })
  }

  function handleApplyChatProposal(messageId) {
    const message = agentChat?.messages.find(
      (candidate) => candidate.id === messageId,
    )
    const proposal = message?.proposal

    if (!proposal || proposal.status !== 'pending') {
      return
    }

    if (proposal.operation === 'build') {
      const result = addDeckRecord(savedDecks, {
        deck: proposal.deck,
        name: proposal.name,
        kind: 'ai',
      })
      setSavedDecks(result.records)
      setSelectedDeckId(result.record.id)
      setUndoDeck(null)
      setCopyStatus(null)
      updateProposalStatus(messageId, 'applied', result.record)
      return
    }

    const targetRecord = savedDecks.find(
      (record) => record.id === proposal.targetDeckId,
    )
    if (!targetRecord) {
      setAgentChatError('The deck targeted by this proposal no longer exists.')
      return
    }

    if (targetRecord.updatedAt !== proposal.targetDeckUpdatedAt) {
      setAgentChatError(
        'That deck changed after this proposal was created. Ask the assistant to update it again.',
      )
      return
    }

    const pendingChanges = proposal.changes.filter(
      (change) => change.status === 'pending',
    )
    let nextDeck
    try {
      nextDeck = applyCardChanges(
        targetRecord.deck,
        pendingChanges,
        proposal.deck,
      )
    } catch (changeError) {
      setAgentChatError(
        changeError instanceof Error
          ? changeError.message
          : 'The proposed changes could not be applied.',
      )
      return
    }

    const result = updateDeckRecord(savedDecks, targetRecord.id, nextDeck)
    setUndoDeck({ deck: targetRecord.deck, deckId: targetRecord.id })
    setSavedDecks(result.records)
    setSelectedDeckId(targetRecord.id)
    setCopyStatus(null)
    setAgentChatError('')
    updateChatProposal(
      messageId,
      (currentProposal) => ({
        ...currentProposal,
        targetDeckUpdatedAt: result.record.updatedAt,
        changes: currentProposal.changes.map((change) =>
          change.status === 'pending'
            ? { ...change, status: 'applied' }
            : change,
        ),
        status: 'applied',
      }),
      result.record,
    )
  }

  function handleApplyChatChange(messageId, changeId) {
    const message = agentChat?.messages.find(
      (candidate) => candidate.id === messageId,
    )
    const proposal = message?.proposal
    const change = proposal?.changes?.find(
      (candidate) => candidate.id === changeId,
    )

    if (
      !proposal ||
      proposal.operation !== 'modify' ||
      proposal.status !== 'pending' ||
      change?.status !== 'pending'
    ) {
      return
    }

    const targetRecord = savedDecks.find(
      (record) => record.id === proposal.targetDeckId,
    )
    if (!targetRecord) {
      setAgentChatError('The deck targeted by this proposal no longer exists.')
      return
    }
    if (targetRecord.updatedAt !== proposal.targetDeckUpdatedAt) {
      setAgentChatError(
        'That deck changed after this proposal was created. Ask the assistant to update it again.',
      )
      return
    }

    let nextDeck
    try {
      nextDeck = applyCardChange(targetRecord.deck, change, proposal.deck)
    } catch (changeError) {
      setAgentChatError(
        changeError instanceof Error
          ? changeError.message
          : 'The proposed change could not be applied.',
      )
      return
    }

    const result = updateDeckRecord(savedDecks, targetRecord.id, nextDeck)
    setUndoDeck({ deck: targetRecord.deck, deckId: targetRecord.id })
    setSavedDecks(result.records)
    setSelectedDeckId(targetRecord.id)
    setCopyStatus(null)
    setAgentChatError('')
    updateChatProposal(
      messageId,
      (currentProposal) => {
        const changes = currentProposal.changes.map((candidate) =>
          candidate.id === changeId
            ? { ...candidate, status: 'applied' }
            : candidate,
        )

        return {
          ...currentProposal,
          targetDeckUpdatedAt: result.record.updatedAt,
          changes,
          status: changes.every((candidate) => candidate.status === 'applied')
            ? 'applied'
            : 'pending',
        }
      },
      result.record,
    )
  }

  const drawDeckAspects = getUniqueDeckAspects(deck?.drawDeck ?? [])
  const activeDrawDeckAspectSort = drawDeckAspects.includes(drawDeckAspectSort)
    ? drawDeckAspectSort
    : null
  const groupedDrawDeck = deck
    ? sortDeckCardGroups(groupDeckCards(deck.drawDeck), {
        costDirection: drawDeckCostSort,
        priorityAspect: activeDrawDeckAspectSort,
      })
    : []
  const groupedSideboard = deck ? groupDeckCards(deck.sideboard ?? []) : []
  const drawDeckOffAspectCount = deck
    ? deck.drawDeck.filter((card) => getCardAspectPenalty(card, deck) > 0)
        .length
    : 0
  const sideboardOffAspectCount = deck
    ? (deck.sideboard ?? []).filter(
        (card) => getCardAspectPenalty(card, deck) > 0,
      ).length
    : 0

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

      <nav className="site-nav" aria-label="Site navigation">
        <div className="site-nav__inner">
          <div
            className="site-nav__group site-nav__deck-actions"
            role="toolbar"
            aria-label="Deck actions"
          >
            <span className="site-nav__group-label">Deck actions</span>
            <button
              className="site-nav__action is-primary"
              type="button"
              disabled={status !== 'success' || !catalog}
              onClick={handleNewDeck}
            >
              {status === 'loading' ? 'Loading catalog…' : 'New Deck'}
            </button>
            <button
              className="site-nav__action"
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
              className="site-nav__action"
              type="button"
              disabled={Boolean(deckExportDisabledReason)}
              title={deckExportDisabledReason ?? undefined}
              onClick={handleCopySwudbDeck}
            >
              Copy SWUDB JSON
            </button>
          </div>

          <div className="site-nav__group site-nav__external-links">
            <span className="site-nav__group-label">Links</span>
            {desktopSettingsAvailable && (
              <button
                className="site-nav__action"
                type="button"
                onClick={() => setIsDesktopSettingsOpen(true)}
              >
                Desktop settings
              </button>
            )}
            <a
              className="site-nav__link"
              href="https://github.com/Alfwich/swu-deck-builder"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub <span aria-hidden="true">↗</span>
            </a>
            <a
              className="site-nav__link"
              href="https://swudb.com/decks/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open SWUDB <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </nav>

      {(status === 'error' || deckError || deckPersistenceError || copyStatus) && (
        <div className="app-notifications">
          {(status === 'error' || deckError || deckPersistenceError) && (
            <p className="app-notice is-error" role="alert">
              {deckPersistenceError || deckError || error}
            </p>
          )}
          {copyStatus && (
            <p
              className={`app-notice is-${copyStatus.type}`}
              role={copyStatus.type === 'error' ? 'alert' : 'status'}
            >
              {copyStatus.message}
              {copyStatus.canUndo && undoDeck && (
                <button
                  className="app-notice__undo"
                  type="button"
                  onClick={handleUndoTransformation}
                >
                  Undo
                </button>
              )}
            </p>
          )}
        </div>
      )}

      <div className="app__workspace">
        <DeckLibrary
          records={savedDecks}
          selectedId={selectedDeckId}
          persistenceMode={deckPersistenceMode}
          persistenceState={deckPersistenceState}
          onSelect={handleSelectDeck}
          onRename={handleRenameDeck}
          onDelete={handleDeleteDeck}
        />

        <div className="app__content">
        {deck && (
          <section className="deck-workspace" id="deck-workspace">
            <header className="deck-workspace__header">
              <h1>{deckName}</h1>
              <DeckAnalysis deck={deck} />
              <DeckCardSearch
                deck={deck}
                query={cardSearchQuery}
                results={cardSearchResults}
                onAddCard={handleAddCard}
                onAddSecondLeader={handleAddSecondLeader}
                onQueryChange={setCardSearchQuery}
                onUseBase={handleUseBase}
                onUseLeader={handleUseLeader}
              />
            </header>

            <div className="deck-section">
              <h3>{deck.secondLeader ? 'Leaders' : 'Leader'} &amp; Base</h3>
              <DeckIdentities
                deck={deck}
                onRemoveSecondLeader={handleRemoveSecondLeader}
              />
            </div>

            <div className="deck-section">
              <div className="deck-section__heading">
                <h3>
                  Draw Deck <span>{deck.drawDeck.length}</span>
                  {drawDeckOffAspectCount > 0 && (
                    <span className="deck-section__aspect-warning">
                      {drawDeckOffAspectCount} off-aspect
                    </span>
                  )}
                </h3>
                <DrawDeckSortControls
                  aspects={drawDeckAspects}
                  costDirection={drawDeckCostSort}
                  priorityAspect={activeDrawDeckAspectSort}
                  onAspectChange={setDrawDeckAspectSort}
                  onCostChange={setDrawDeckCostSort}
                />
              </div>
              <div className="deck-grid">
                {groupedDrawDeck.map((group) => (
                  <DeckCardStack
                    aspectPenalty={getCardAspectPenalty(group.card, deck)}
                    group={group}
                    key={group.key}
                    onRemove={() => handleRemoveCard('drawDeck', group.cards[0])}
                  />
                ))}
              </div>
            </div>

            <div className="deck-section">
              <div className="deck-section__heading">
                <h3>
                  Sideboard <span>{deck.sideboard.length}</span>
                  {sideboardOffAspectCount > 0 && (
                    <span className="deck-section__aspect-warning">
                      {sideboardOffAspectCount} off-aspect
                    </span>
                  )}
                </h3>
              </div>
              {groupedSideboard.length > 0 ? (
                <div className="deck-grid">
                  {groupedSideboard.map((group) => (
                    <DeckCardStack
                      aspectPenalty={getCardAspectPenalty(group.card, deck)}
                      group={group}
                      key={group.key}
                      onRemove={() => handleRemoveCard('sideboard', group.cards[0])}
                    />
                  ))}
                </div>
              ) : (
                <p className="deck-section__empty">No sideboard cards yet.</p>
              )}
            </div>
          </section>
        )}
        </div>

        {deck && <DeckLegality deck={deck} />}
      </div>

      <AgentChatPanel
        accessAvailable={agenticFeature.available}
        available={
          agenticFeature.available &&
          Boolean(agentChat?.token) &&
          Boolean(deck)
        }
        cardReferences={agentCardReferences}
        desktopSettingsAvailable={desktopSettingsAvailable}
        error={agentChatError}
        featureResolved={agenticFeatureResolved}
        input={agentChatInput}
        isOpen={isAgentChatOpen}
        messages={agentChat?.messages ?? []}
        status={agentChatStatus}
        onApplyChange={handleApplyChatChange}
        onApplyProposal={handleApplyChatProposal}
        onDismissProposal={handleDismissChatProposal}
        onInputChange={setAgentChatInput}
        onHidePreview={() => setAgentCardPreview(null)}
        onNewSession={handleNewAgentSession}
        onOpenDesktopSettings={() => setIsDesktopSettingsOpen(true)}
        onPreviewCard={handleShowAgentCardPreview}
        onSubmit={handleAgentChatSubmit}
        onToggle={handleToggleAgentChat}
      />

      {agentCardPreview && (
        <AgentCardHoverPreview preview={agentCardPreview} />
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

      {isDesktopSettingsOpen && (
        <DesktopSettingsDialog
          onClose={() => setIsDesktopSettingsOpen(false)}
        />
      )}

    </main>
  )
}

export default App
