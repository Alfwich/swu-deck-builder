import {
  createContext,
  memo,
  useEffect,
  useEffectEvent,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Markdown from 'react-markdown'
import CardCollectionControl from './CardCollectionDialog.jsx'
import {
  FAN_TOOL_NOTICE,
  formatApplicationVersion,
} from './app-metadata.js'
import {
  AGENT_CHAT_RESIZE_STEP,
  AGENT_CHAT_TOP_BAR_CLEARANCE,
  addAgentPromptHistoryEntry,
  advanceAgentProposalBatchCollectionRevision,
  agentChatDeckContext,
  canNavigateAgentPromptHistory,
  clampAgentChatHeight,
  createAgentCardReferenceMarkdownPlugin,
  createAgentCollectionContext,
  createAgentDeckLibrary,
  createAgentGreeting,
  dismissAgentProposalChange,
  getCompactAgentChatHeight,
  getAgentChatScrollKey,
  getAgentChatSizeAfterResize,
  getAgentAccessNotice,
  hasSavedAgentChatSize,
  loadAgentChat,
  loadAgentChatSize,
  loadAgentPromptHistory,
  navigateAgentPromptHistory,
  saveAgentChat,
  saveAgentChatSize,
  saveAgentPromptHistory,
} from './agent-chat.js'
import {
  createCatalogCardReferenceIndex,
  createCatalogPrintingIndex,
  createDeckAspectHydrator,
  getCatalogCardId,
  groupDeckCards,
  loadPackedCatalog,
  selectRandomCardFaces,
} from './catalog.js'
import {
  addCardCollectionCopies,
  applyCardCollectionChange,
  applyCardCollectionChanges,
  createCollectionCheckpoint,
  createEmptyCardCollection,
  getCardListOwnershipSummary,
  getCardCollectionCount,
  getCardOwnershipStatus,
  getGameplayCardCollectionCount,
  loadCardCollection,
  normalizeCardCollection,
  saveCardCollection,
  setCardCollectionCount,
} from './card-collection.js'
import {
  formatSwudbDeck,
  parseSwudbDeck,
  serializeAgentDeckContext,
} from './integrations/swudb.js'
import {
  TCGPLAYER_MASS_ENTRY_URL,
  createTcgplayerMassEntry,
} from './integrations/tcgplayer.js'
import {
  addDeckRecord,
  alignDeckCollectionCheckpoints,
  createEmptyDeck,
  deleteDeckRecord,
  loadDeckLibrary,
  renameDeckRecord,
  saveDeckLibrary,
  updateDeckRecord,
} from './deck-library.js'
import {
  clearStaleTcgplayerCopyStatus,
  getCopyStatusDismissDelay,
} from './copy-status.js'
import { createInitialDeck, markStarterDeckSeen } from './starter-deck.js'
import DeckAnalysis from './DeckAnalysis.jsx'
import DeckHistoryBar from './DeckHistoryBar.jsx'
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
  isDictationAvailable,
} from './dictation.js'
import {
  AGENT_IMAGE_ACCEPT,
  AGENT_IMAGE_CAMERA_CAPTURE,
  MAX_AGENT_IMAGE_ATTACHMENTS,
  agentImageDisplayName,
  agentImageQueuePrompt,
  agentImageSelectionTitle,
  clipboardImageFiles,
  droppedImageFiles,
  formatAgentImageSize,
  shouldPresentAgentImageProposal,
  validateAgentImageFile,
} from './agent-image.js'
import {
  databaseSnapshotFingerprint,
  loadLocalDeckDatabase,
  loadLocalDeckSelection,
  resolveDatabaseCollectionSource,
  resolveDatabaseDeckSource,
  resolveDatabasePromptHistorySource,
  saveLocalDeckDatabase,
  saveLocalDeckSelection,
  selectDatabaseDeckId,
} from './local-deck-database.js'
import {
  createPlayerDatabaseBackup,
  parsePlayerDatabaseBackup,
  playerDatabaseBackupFilename,
  playerDatabaseBackupSizeError,
} from './player-database-backup.js'
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
import {
  addDeckHistory,
  appendDeckHistory,
  appendPersistentDeckHistory,
  createDeckHistoryVisualStack,
  deckHistoryEntryAt,
  decksHaveSameState,
  initializeDeckHistories,
  moveDeckHistory,
  movePersistentDeckHistory,
  normalizePersistentDeckHistory,
  persistentDeckHistoryEntryAt,
  removeDeckHistory,
} from './deck-history.js'
import { DesktopSettingsDialog } from './DesktopSettingsDialog.jsx'
import { CloudBackupDialog } from './CloudBackupDialog.jsx'
import { cloudBackupButtonLabel } from './cloud-backup-presentation.js'
import { resolveGoogleDriveClientId } from './google-drive-feature.js'
import { useRemoteBackup } from './use-remote-backup.js'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function appClassName(status, isElectron) {
  return [
    'app',
    status !== 'loading' ? 'is-ready' : '',
    isElectron ? 'is-electron' : '',
  ].filter(Boolean).join(' ')
}

function drawDeckOwnershipSummaryClassName(summary) {
  return `deck-section__ownership-summary${
    summary.fullyOwned ? ' is-fully-owned' : ''
  }`
}

function agentDeckChangeHistoryLabel(change) {
  const count = change?.count ?? 1
  const zone = String(change?.zoneLabel ?? change?.zone ?? 'deck').toLowerCase()
  if (change?.type === 'replace') {
    const from = change.from?.name ?? change.from?.id ?? 'a card'
    const to = change.to?.name ?? change.to?.id ?? 'a card'
    return `AI replaced ${from} with ${to} in the ${zone}`
  }

  const card = change?.card?.name ?? change?.card?.id ?? 'a card'
  const quantity = count > 1 ? `${count} copies of ` : ''
  return change?.type === 'remove'
    ? `AI removed ${quantity}${card} from the ${zone}`
    : `AI added ${quantity}${card} to the ${zone}`
}

function agentProposalHistoryLabel(changeCount) {
  const noun = changeCount === 1 ? 'change' : 'changes'
  return `Applied ${changeCount} AI deck ${noun}`
}

function deckHistoryCardVisual(card, kind) {
  return card?.url ? { card, kind } : null
}

function agentDeckChangeHistoryVisual(change, proposal) {
  const visualChanges = proposal?.visualChanges
  const visualChange = [
    ...(visualChanges?.replacements ?? []),
    ...(visualChanges?.additions ?? []),
    ...(visualChanges?.removals ?? []),
  ].find((candidate) => candidate.changeId === change?.id)
  const card = change?.type === 'replace'
    ? visualChange?.to?.card
    : visualChange?.card
  const kind = change?.type === 'remove'
    ? 'removal'
    : change?.type === 'replace'
      ? 'replacement'
      : 'addition'
  const visual = deckHistoryCardVisual(card, kind)
  return visual ? { ...visual, count: change?.count ?? 1 } : null
}

function agentProposalHistoryVisual(changes, proposal) {
  const deckChanges = changes.filter((change) => change.zone !== 'collection')
  const visual = createDeckHistoryVisualStack(
    deckChanges.map((change) =>
      agentDeckChangeHistoryVisual(change, proposal),
    ),
  )
  if (!visual) return null

  const changeIds = new Set(deckChanges.map(({ id }) => id))
  const visualChanges = proposal?.visualChanges
  return {
    ...visual,
    details: {
      name: visualChanges?.name ?? null,
      replacements: (visualChanges?.replacements ?? []).filter(
        ({ changeId }) => changeIds.has(changeId),
      ),
      additions: (visualChanges?.additions ?? []).filter(
        ({ changeId }) => changeIds.has(changeId),
      ),
      removals: (visualChanges?.removals ?? []).filter(
        ({ changeId }) => changeIds.has(changeId),
      ),
    },
  }
}

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

async function databaseDeckLibrary(
  catalog,
  storage,
  storedLibrary,
  storedCollection,
  storedPromptHistory,
  signal,
) {
  let snapshot = await loadLocalDeckDatabase({ signal })
  let library = resolveDatabaseDeckSource(snapshot, storedLibrary)
  const collectionSource = resolveDatabaseCollectionSource(
    snapshot,
    storedCollection,
  )
  const promptHistorySource = resolveDatabasePromptHistorySource(
    snapshot,
    storedPromptHistory,
  )

  if (
    library.needsInitialization ||
    collectionSource.needsInitialization ||
    promptHistorySource.needsInitialization
  ) {
    if (library.needsInitialization) {
      library = browserDeckLibrary(catalog, storage, storedLibrary)
    }
    snapshot = await saveLocalDeckDatabase(
      snapshot.revision,
      library.records,
      collectionSource.collection,
      promptHistorySource.promptHistory,
      { signal },
    )
  }

  return {
    collection: snapshot.collection,
    promptHistory: snapshot.promptHistory,
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
  collection = createEmptyCardCollection(),
  collectionContext = null,
  imageToken = null,
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
      collection: {
        revision: collection.revision,
        cards: collection.cards,
      },
      ...(collectionContext ? { collectionContext } : {}),
      ...(deckLibrary.length > 0 ? { deckLibrary } : {}),
      ...(imageToken ? { imageToken } : {}),
    }),
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

async function uploadAgentImage(file, sessionToken) {
  const response = await fetch('/api/agent/images', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-SWU-Agent-Session': sessionToken,
    },
    body: file,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error ?? 'The image could not be attached.')
  }
  if (typeof payload.token !== 'string' || !payload.token) {
    throw new Error('The image attachment response was invalid.')
  }

  return payload.token
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

function promptForAgentChat(input, imageAttachments) {
  const prompt = input.trim()
  if (prompt) return prompt
  return imageAttachments.length > 0
    ? 'Analyze the attached image in the context of this deck.'
    : ''
}

function handleAgentImageInputChange(event, onImagesSelected) {
  const images = [...(event.currentTarget.files ?? [])]
  if (images.length > 0) onImagesSelected(images)
  event.currentTarget.value = ''
}

function createAgentChatUserMessage(prompt, imageAttachment) {
  const message = {
    id: createChatMessageId(),
    role: 'user',
    text: prompt,
  }
  if (imageAttachment) message.attachmentName = imageAttachment.name
  return message
}

async function sendAgentChatWithRenewal({
  activeSession,
  contextRecord,
  currentDeck,
  collection,
  collectionContext,
  deckLibrary,
  deckName,
  imageAttachment,
  onRenewed,
  prompt,
  userMessage,
}) {
  const send = async (session) => {
    const imageToken = imageAttachment
      ? await uploadAgentImage(imageAttachment.file, session.token)
      : null
    return sendAgentChatRequest(
      session,
      prompt,
      currentDeck,
      contextRecord.id,
      session.hasConversation ? [] : deckLibrary,
      collection,
      collectionContext,
      imageToken,
    )
  }

  let conversationMessages = [...activeSession.messages, userMessage]
  let result = await send(activeSession)
  if (result.response.status !== 410) {
    return { ...result, activeSession, conversationMessages }
  }

  const renewed = await renewAgentChatSession(
    contextRecord,
    deckName,
    userMessage,
  )
  activeSession = renewed.activeSession
  conversationMessages = renewed.conversationMessages
  onRenewed(activeSession, conversationMessages)
  result = await send(activeSession)
  return { ...result, activeSession, conversationMessages }
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

function createAgentChatProposal(
  payload,
  contextRecord,
  collection,
  cardReferences,
  batchId,
) {
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
  const hasCollectionChanges = changes?.some(
    (change) => change.zone === 'collection',
  ) ?? false
  const hasDeckChanges = changes?.some(
    (change) => change.zone !== 'collection',
  ) ?? false
  return {
    operation: payload.operation,
    name: payload.name || 'AI deck',
    deck: payload.deck,
    changes,
    visualChanges:
      payload.operation === 'modify'
        ? createCardChangePresentation(
            contextRecord.deck,
            payload.deck,
            changes,
            cardReferences,
          )
        : null,
    hasCollectionChanges,
    hasDeckChanges,
    batchId,
    targetCollectionRevision: hasCollectionChanges
      ? collection.revision
      : null,
    targetCollectionHistoryId: hasCollectionChanges
      ? collection.historyId
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

function proposalStaleError(
  proposal,
  targetRecord,
  collection,
  { checkCollection, checkDeck },
) {
  if (checkDeck && !targetRecord) {
    return 'The deck targeted by this proposal no longer exists.'
  }
  if (checkDeck && targetRecord.updatedAt !== proposal.targetDeckUpdatedAt) {
    return 'That deck changed after this proposal was created. Ask the assistant to update it again.'
  }
  if (
    checkCollection &&
    (
      collection.historyId !== proposal.targetCollectionHistoryId ||
      collection.revision !== proposal.targetCollectionRevision
    )
  ) {
    return 'The card library changed after this proposal was created. Ask the assistant to update it again.'
  }
  return ''
}

function applyAgentProposalChanges(deck, collection, changes, referenceDeck) {
  const deckChanges = changes.filter((change) => change.zone !== 'collection')
  const collectionChanges = changes.filter(
    (change) => change.zone === 'collection',
  )
  return {
    collection:
      collectionChanges.length > 0
        ? applyCardCollectionChanges(collection, collectionChanges)
        : collection,
    deck:
      deckChanges.length > 0
        ? applyCardChanges(deck, deckChanges, referenceDeck)
        : deck,
    collectionChanged: collectionChanges.length > 0,
    deckChanged: deckChanges.length > 0,
  }
}

function revealImage(event) {
  event.currentTarget.classList.add('is-loaded')
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

function RightRail({ deck, ...collectionProps }) {
  return (
    <div className="app__right-rail">
      <CardCollectionControl {...collectionProps} />
      {deck && <DeckLegality deck={deck} />}
    </div>
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

function DeckCardStack({
  aspectPenalty = 0,
  group,
  onRemove,
  ownedCount = 0,
  showOwnership = false,
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

function DictationControl({ disabled = false, isElectron = false, onTranscript }) {
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
    if (!isSupported || isElectron) {
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
  }, [isElectron, isSupported])

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

  if (!isDictationAvailable({ isElectron, isSupported })) {
    return null
  }

  const presentation = getDictationPresentation({
    disabled,
    error,
    isListening,
    isProcessing,
  })

  return (
    <div className="dictation-control" title={presentation.title}>
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
      <span
        className={`dictation-control__status${error ? ' is-error' : ''}`}
        aria-live="polite"
      >
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

function ImportDatabaseDialog({ backup, fileName, onClose, onConfirm }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const collectionCopies = backup.collection.cards.reduce(
    (total, entry) => total + entry.count,
    0,
  )

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
        className="agent-dialog database-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-import-dialog-title"
      >
        <p className="eyebrow">Database restore</p>
        <h2 id="database-import-dialog-title">Replace player data?</h2>
        <p className="agent-dialog__description">
          This validated backup will replace every saved deck and every card in
          the current collection. AI settings and chat history are not changed.
        </p>

        <dl className="database-import-dialog__summary">
          <div>
            <dt>Backup file</dt>
            <dd>{fileName}</dd>
          </div>
          <div>
            <dt>Exported</dt>
            <dd>{new Date(backup.exportedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Decks</dt>
            <dd>{backup.decks.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Collection</dt>
            <dd>{collectionCopies.toLocaleString()} cards</dd>
          </div>
        </dl>

        <div className="agent-dialog__actions">
          <button
            autoFocus
            className="copy-button"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="database-import-dialog__confirm"
            type="button"
            onClick={onConfirm}
          >
            Restore backup
          </button>
        </div>
      </section>
    </div>
  )
}

function PendingDatabaseImportDialog({ pending, onClose, onConfirm }) {
  if (!pending) return null
  return (
    <ImportDatabaseDialog
      backup={pending.backup}
      fileName={pending.fileName}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  )
}

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
      {collectionCount === 0 && (
        <button type="button" onClick={() => onAddToCollection(card)}>
          Add to collection
        </button>
      )}
    </span>
  )
}

function DeckCardSearchResult({ collectionCount, deck, card, ...actions }) {
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

function DeckCardSearch({
  collection,
  deck,
  query,
  results,
  onQueryChange,
  ...actions
}) {
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

export function CardChangesDialog({
  eyebrow = 'Proposed deck update',
  onClose,
  proposal,
  subtitle = proposal.targetDeckName,
  title = 'Card changes',
}) {
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
            <span>{eyebrow}</span>
            <h2 id="card-changes-title">{title}</h2>
            <p>{subtitle}</p>
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
        data-agent-card-preview="true"
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
  disabled,
  visualChange,
  onApply,
  onDismiss,
  onHidePreview,
  onPreviewCard,
}) {
  const status = change.status ?? 'pending'
  const zoneLabel = {
    base: 'Base',
    collection: 'Card library',
    drawDeck: 'Draw deck',
    leader: 'Leader',
    secondLeader: 'Second leader',
    sideboard: 'Sideboard',
  }[change.zone] ?? change.zone

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
        <div className="agent-chat-change__actions">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onApply(change.id)}
          >
            Apply
          </button>
          {change.zone === 'collection' && (
            <button
              className="is-dismiss"
              type="button"
              disabled={disabled}
              onClick={() => onDismiss(change.id)}
            >
              Dismiss
            </button>
          )}
        </div>
      ) : (
        <small>{status === 'applied' ? 'Applied' : 'Dismissed'}</small>
      )}
    </article>
  )
}

function AgentChatProposal({
  disabled,
  message,
  onApply,
  onApplyChange,
  onDismiss,
  onDismissChange,
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
          : proposal.hasDeckChanges && proposal.hasCollectionChanges
            ? `Update ${proposal.targetDeckName} and card library`
            : proposal.hasCollectionChanges
              ? 'Update card library'
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
                disabled={disabled}
                key={change.id}
                visualChange={visualChangesById.get(change.id)}
                onApply={(changeId) => onApplyChange(message.id, changeId)}
                onDismiss={(changeId) =>
                  onDismissChange(message.id, changeId)
                }
                onHidePreview={onHidePreview}
                onPreviewCard={onPreviewCard}
              />
            ))}
          </div>
        </>
      )}
      {proposal.status === 'pending' ? (
        <div className="agent-chat__proposal-actions">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDismiss(message.id)}
          >
            {appliedChangeCount > 0 ? 'Dismiss remaining' : 'Dismiss'}
          </button>
          <button
            className="is-primary"
            type="button"
            disabled={disabled}
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

const AgentMarkdownContext = createContext(null)

const AgentCardReference = memo(function AgentCardReference({
  card,
  cardId,
  onHidePreview,
  onPreviewCard,
}) {
  useEffect(() => () => onHidePreview(), [onHidePreview])

  return (
    <button
      className={`agent-chat-card-reference${
        ['Leader', 'Base'].includes(card.type) ? ' is-horizontal' : ''
      }`}
      type="button"
      data-agent-card-preview="true"
      title={`View ${card.name}`}
      aria-label={`View ${card.name}, ${cardId}`}
      onBlur={onHidePreview}
      onFocus={(event) => onPreviewCard(card, event)}
      onPointerEnter={(event) => onPreviewCard(card, event)}
      onPointerMove={(event) => onPreviewCard(card, event)}
      onPointerLeave={(event) => {
        if (event.currentTarget === document.activeElement) {
          onPreviewCard(card, event)
        } else {
          onHidePreview()
        }
      }}
    >
      <img
        src={card.url}
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        onLoad={revealImage}
      />
    </button>
  )
})

function AgentMarkdownLink({ children, href }) {
  return (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  )
}

function AgentMarkdownCardReference({ cardId }) {
  const context = useContext(AgentMarkdownContext)

  return (
    <AgentCardReference
      card={context.cardsById.get(cardId)}
      cardId={cardId}
      onHidePreview={context.onHidePreview}
      onPreviewCard={context.onPreviewCard}
    />
  )
}

const AGENT_MARKDOWN_COMPONENTS = {
  a: AgentMarkdownLink,
  'swu-card': AgentMarkdownCardReference,
}

const AgentMessageText = memo(function AgentMessageText({
  cardsById,
  onHidePreview,
  onPreviewCard,
  text,
}) {
  const cardReferencePlugin = useMemo(
    () => createAgentCardReferenceMarkdownPlugin(cardsById),
    [cardsById],
  )
  const markdownContext = useMemo(
    () => ({ cardsById, onHidePreview, onPreviewCard }),
    [cardsById, onHidePreview, onPreviewCard],
  )
  const remarkPlugins = useMemo(
    () => [cardReferencePlugin],
    [cardReferencePlugin],
  )

  return (
    <AgentMarkdownContext.Provider value={markdownContext}>
      <div className="agent-chat-markdown">
        <Markdown
          components={AGENT_MARKDOWN_COMPONENTS}
          remarkPlugins={remarkPlugins}
          skipHtml
        >
          {text}
        </Markdown>
      </div>
    </AgentMarkdownContext.Provider>
  )
})

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

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const handleChange = (event) => setMatches(event.matches)

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [query])

  return matches
}

function AgentChatPanel({
  accessAvailable,
  available,
  cardReferences,
  desktopSettingsAvailable,
  error,
  featureResolved,
  history,
  imageAttachments,
  imageAttachmentsAvailable,
  imageError,
  input,
  isOpen,
  messages,
  onApplyChange,
  onApplyProposal,
  onDismissProposal,
  onDismissChange,
  onImagesSelected,
  onInputChange,
  onHidePreview,
  onOpenDesktopSettings,
  onPreviewCard,
  onRemoveImage,
  onSubmit,
  onToggle,
  status,
  topBarRef,
}) {
  const messagesRef = useRef(null)
  const panelRef = useRef(null)
  const cameraInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const imageDragDepthRef = useRef(0)
  const resizePointerOffsetRef = useRef(0)
  const historyDraftRef = useRef('')
  const historyIndexRef = useRef(null)
  const hasSavedSizeRef = useRef(
    hasSavedAgentChatSize(window.localStorage),
  )
  const [isImageDragActive, setIsImageDragActive] = useState(false)
  const [agentChatSize, setAgentChatSize] = useState(
    () => loadAgentChatSize(window.localStorage),
  )
  const [isResizing, setIsResizing] = useState(false)
  const [panelHeight, setPanelHeight] = useState(null)
  const isMobileLayout = useMediaQuery('(max-width: 640px)')
  const isCompact = agentChatSize === 'small'
  const scrollKey = getAgentChatScrollKey(messages, status)
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
  }, [scrollKey])

  useEffect(() => {
    historyDraftRef.current = ''
    historyIndexRef.current = null
  }, [history, isOpen])

  useEffect(() => {
    if (!desktopSettingsAvailable || hasSavedSizeRef.current) return

    hasSavedSizeRef.current = true
    setAgentChatSize('small')
    saveAgentChatSize(window.localStorage, 'small')
  }, [desktopSettingsAvailable])

  useLayoutEffect(() => {
    if (!isOpen) return

    const panel = panelRef.current
    if (!panel) return
    const panelBounds = panel.getBoundingClientRect()
    const topBarBottom = topBarRef.current?.getBoundingClientRect().bottom
    const bounds = {
      panelBottom: panelBounds.bottom,
      viewportHeight: window.innerHeight,
      ...(Number.isFinite(topBarBottom)
        ? { topBoundary: topBarBottom + AGENT_CHAT_TOP_BAR_CLEARANCE }
        : {}),
    }

    setPanelHeight((currentHeight) =>
      currentHeight === null && isCompact
        ? getCompactAgentChatHeight(bounds)
        : clampAgentChatHeight({
            ...bounds,
            height: currentHeight ?? panelBounds.height,
          }),
    )
  }, [isCompact, isOpen, topBarRef])

  useEffect(() => {
    if (!isOpen) return undefined

    function clampToViewport() {
      const panel = panelRef.current
      if (!panel) return
      const panelBounds = panel.getBoundingClientRect()
      const topBarBottom = topBarRef.current?.getBoundingClientRect().bottom

      setPanelHeight((currentHeight) =>
        clampAgentChatHeight({
            height: currentHeight ?? panelBounds.height,
            panelBottom: panelBounds.bottom,
            viewportHeight: window.innerHeight,
            ...(Number.isFinite(topBarBottom)
              ? { topBoundary: topBarBottom + AGENT_CHAT_TOP_BAR_CLEARANCE }
              : {}),
          }),
      )
    }

    window.addEventListener('resize', clampToViewport)
    return () => window.removeEventListener('resize', clampToViewport)
  }, [isOpen, topBarRef])

  function resizePanelToPointer(clientY) {
    const panel = panelRef.current
    if (!panel) return

    const panelBottom = panel.getBoundingClientRect().bottom
    const topBarBottom = topBarRef.current?.getBoundingClientRect().bottom
    setPanelHeight(
      clampAgentChatHeight({
        height: panelBottom - clientY + resizePointerOffsetRef.current,
        panelBottom,
        viewportHeight: window.innerHeight,
        ...(Number.isFinite(topBarBottom)
          ? { topBoundary: topBarBottom + AGENT_CHAT_TOP_BAR_CLEARANCE }
          : {}),
      }),
    )
  }

  function handleResizePointerDown(event) {
    if (event.button !== 0) return

    event.preventDefault()
    resizePointerOffsetRef.current =
      event.clientY - panelRef.current.getBoundingClientRect().top
    event.currentTarget.setPointerCapture(event.pointerId)
    setAgentChatSize(getAgentChatSizeAfterResize)
    setIsResizing(true)
  }

  function handleResizePointerMove(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    resizePanelToPointer(event.clientY)
  }

  function finishPanelResize(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizePointerOffsetRef.current = 0
    setIsResizing(false)
  }

  function handleResizeKeyDown(event) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return

    const panel = panelRef.current
    if (!panel) return

    event.preventDefault()
    setAgentChatSize(getAgentChatSizeAfterResize)
    const panelBounds = panel.getBoundingClientRect()
    const topBarBottom = topBarRef.current?.getBoundingClientRect().bottom
    const requestedHeight = event.key === 'ArrowUp'
      ? panelBounds.height + AGENT_CHAT_RESIZE_STEP
      : event.key === 'ArrowDown'
        ? panelBounds.height - AGENT_CHAT_RESIZE_STEP
        : event.key === 'Home'
          ? 0
          : Number.MAX_SAFE_INTEGER
    setPanelHeight(
      clampAgentChatHeight({
        height: requestedHeight,
        panelBottom: panelBounds.bottom,
        viewportHeight: window.innerHeight,
        ...(Number.isFinite(topBarBottom)
          ? { topBoundary: topBarBottom + AGENT_CHAT_TOP_BAR_CLEARANCE }
          : {}),
      }),
    )
  }

  function handlePaste(event) {
    if (!imageAttachmentsAvailable) return

    const images = clipboardImageFiles(event.clipboardData)
    if (images.length === 0) return

    event.preventDefault()
    onImagesSelected(images)
  }

  function handleImageDragEnter(event) {
    if (!imageAttachmentsAvailable || !event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    imageDragDepthRef.current += 1
    setIsImageDragActive(true)
  }

  function handleImageDragOver(event) {
    if (!imageAttachmentsAvailable || !event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect =
      available && status !== 'loading' ? 'copy' : 'none'
  }

  function handleImageDragLeave(event) {
    if (!imageAttachmentsAvailable || !event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1)
    if (imageDragDepthRef.current === 0) setIsImageDragActive(false)
  }

  function handleImageDrop(event) {
    if (!imageAttachmentsAvailable || !event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    imageDragDepthRef.current = 0
    setIsImageDragActive(false)
    if (!available || status === 'loading') return

    const images = droppedImageFiles(event.dataTransfer)
    if (images.length > 0) onImagesSelected(images)
  }

  function handlePanelToggle() {
    imageDragDepthRef.current = 0
    setIsImageDragActive(false)
    setIsResizing(false)
    onToggle()
  }

  function handlePanelSizeChange(nextIsCompact) {
    if (nextIsCompact === isCompact) return

    hasSavedSizeRef.current = true
    saveAgentChatSize(
      window.localStorage,
      nextIsCompact ? 'small' : 'large',
    )

    setPanelHeight(null)
    setAgentChatSize(nextIsCompact ? 'small' : 'large')
  }

  return (
    <div className={`agent-chat${isOpen ? ' is-open' : ''}`}>
      {isOpen && (
        <aside
          ref={panelRef}
          className={`agent-chat__panel${isCompact ? ' is-compact' : ''}${
            isResizing ? ' is-resizing' : ''
          }`}
          aria-label="AI deck assistant"
          onPaste={imageAttachmentsAvailable ? handlePaste : undefined}
          style={panelHeight === null ? undefined : { height: `${panelHeight}px` }}
        >
          <div
            className="agent-chat__resize-handle"
            role="separator"
            aria-label="Resize AI deck assistant"
            aria-orientation="horizontal"
            aria-valuenow={panelHeight ?? undefined}
            tabIndex={0}
            title="Drag to resize. Use the up and down arrow keys for precise control."
            onKeyDown={handleResizeKeyDown}
            onPointerCancel={finishPanelResize}
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={finishPanelResize}
          />
          <header className="agent-chat__header">
            <div>
              <span>AI deck assistant</span>
            </div>
            <div className="agent-chat__header-actions">
              <div
                className="agent-chat__size-toggle"
                role="group"
                aria-label="AI deck assistant size"
              >
                <button
                  type="button"
                  aria-pressed={isCompact}
                  onClick={() => handlePanelSizeChange(true)}
                >
                  Small
                </button>
                <button
                  type="button"
                  aria-pressed={!isCompact}
                  onClick={() => handlePanelSizeChange(false)}
                >
                  Large
                </button>
              </div>
              <button
                type="button"
                onClick={handlePanelToggle}
                aria-label="Close AI deck assistant"
              >
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
                  <span className="agent-chat__message-role">
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
                  {typeof message.attachmentName === 'string' && (
                    <span className="agent-chat__message-attachment">
                      Image · {message.attachmentName}
                    </span>
                  )}
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
                      disabled={status === 'loading'}
                      message={message}
                      onApply={onApplyProposal}
                      onApplyChange={onApplyChange}
                      onDismiss={onDismissProposal}
                      onDismissChange={onDismissChange}
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
            <form
              className={`agent-chat__composer${isImageDragActive ? ' is-image-drag-active' : ''}`}
              onDragEnter={handleImageDragEnter}
              onDragLeave={handleImageDragLeave}
              onDragOver={handleImageDragOver}
              onDrop={handleImageDrop}
              onSubmit={onSubmit}
            >
              {isImageDragActive && (
                <div className="agent-chat__drop-target" role="status">
                  Drop images to queue them
                </div>
              )}
              {status !== 'loading' && imageAttachments.length > 0 && (
                <div className="agent-chat__attachments">
                  {imageAttachments.map((image, index) => (
                    <div className="agent-chat__attachment" key={image.id}>
                      <img
                        src={image.previewUrl}
                        alt={`Attached ${image.name}`}
                      />
                      <div>
                        <strong>{image.name}</strong>
                        <span>
                          {formatAgentImageSize(image.size)} · {index + 1} of{' '}
                          {imageAttachments.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${image.name}`}
                        disabled={status === 'loading'}
                        onClick={() => onRemoveImage(image.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {imageError && (
                <p className="agent-chat__attachment-error" role="alert">
                  {imageError}
                </p>
              )}
              <textarea
                aria-label="Message the AI deck assistant"
                disabled={!available || status === 'loading'}
                maxLength={4000}
                placeholder={
                  isMobileLayout
                    ? 'Ask or modify your deck…'
                    : 'Modify a deck, build a new one, or ask a question…'
                }
                rows={3}
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (canNavigateAgentPromptHistory({
                    altKey: event.altKey,
                    ctrlKey: event.ctrlKey,
                    key: event.key,
                    metaKey: event.metaKey,
                    selectionEnd: event.currentTarget.selectionEnd,
                    selectionStart: event.currentTarget.selectionStart,
                    shiftKey: event.shiftKey,
                    value: event.currentTarget.value,
                  })) {
                    const navigation = navigateAgentPromptHistory({
                      direction: event.key === 'ArrowUp' ? 'up' : 'down',
                      draft: historyDraftRef.current,
                      history,
                      index: historyIndexRef.current,
                      input,
                    })
                    if (navigation) {
                      event.preventDefault()
                      historyDraftRef.current = navigation.draft
                      historyIndexRef.current = navigation.index
                      onInputChange(navigation.input)
                      return
                    }
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
              />
              <div className="agent-chat__composer-actions">
                <div className="agent-chat__composer-tools">
                  <DictationControl
                    disabled={!available || status === 'loading'}
                    isElectron={desktopSettingsAvailable}
                    onTranscript={(transcript) =>
                      onInputChange(
                        [input.trimEnd(), transcript]
                          .filter(Boolean)
                          .join(' ')
                          .slice(0, 4000),
                      )
                    }
                  />
                  {imageAttachmentsAvailable && (
                    <>
                      <input
                        ref={cameraInputRef}
                        className="agent-chat__image-input"
                        type="file"
                        accept={AGENT_IMAGE_ACCEPT}
                        capture={AGENT_IMAGE_CAMERA_CAPTURE}
                        tabIndex={-1}
                        onChange={(event) =>
                          handleAgentImageInputChange(event, onImagesSelected)
                        }
                      />
                      <input
                        ref={imageInputRef}
                        className="agent-chat__image-input"
                        type="file"
                        accept={AGENT_IMAGE_ACCEPT}
                        multiple
                        tabIndex={-1}
                        onChange={(event) =>
                          handleAgentImageInputChange(event, onImagesSelected)
                        }
                      />
                      <button
                        className="agent-chat__attach"
                        type="button"
                        aria-label="Take a photo"
                        disabled={
                          !available ||
                          status === 'loading' ||
                          imageAttachments.length >= MAX_AGENT_IMAGE_ATTACHMENTS
                        }
                        title={agentImageSelectionTitle(
                          imageAttachments.length,
                          'Take a photo with this device',
                        )}
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        Photo
                      </button>
                      <button
                        className="agent-chat__attach"
                        type="button"
                        disabled={
                          !available ||
                          status === 'loading' ||
                          imageAttachments.length >= MAX_AGENT_IMAGE_ATTACHMENTS
                        }
                        title={agentImageSelectionTitle(
                          imageAttachments.length,
                          'Add images',
                        )}
                        onClick={() => imageInputRef.current?.click()}
                      >
                        <span aria-hidden="true">+</span>
                        Images
                      </button>
                    </>
                  )}
                </div>
                <button
                  className="agent-chat__send"
                  type="submit"
                  disabled={
                    !available ||
                    status === 'loading' ||
                    (!input.trim() && imageAttachments.length === 0)
                  }
                >
                  Send
                </button>
              </div>
            </form>
          )}
        </aside>
      )}

      {!isOpen && (
        <button
          className="agent-chat__launcher"
          type="button"
          aria-expanded="false"
          aria-label="Open AI deck assistant"
          title="Open AI deck assistant"
          onClick={handlePanelToggle}
        >
          <span aria-hidden="true">✦</span>
          Deck assistant
        </button>
      )}
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

function SortDirectionControl({ direction, label, onChange }) {
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

function DrawDeckSortControls({
  aspects,
  costDirection,
  onOwnershipChange,
  onAspectChange,
  onCostChange,
  onSetChange,
  ownershipVisible,
  priorityAspect,
  setDirection,
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

function getTcgplayerCopyDisabledReason(deck) {
  return createTcgplayerMassEntry(deck) ? null : 'Add cards to the deck first'
}

function getEmptyTcgplayerCopyMessage({ allDecks, missingOnly }) {
  if (!missingOnly) {
    return 'Add cards to the deck before copying a TCGplayer list.'
  }

  return allDecks
    ? 'Your card library already covers every card across all saved decks.'
    : 'Your card library already covers every card in this deck.'
}

function getSuccessfulTcgplayerCopyMessage({ allDecks, missingOnly }) {
  if (missingOnly) {
    return allDecks
      ? 'Missing cards across all saved decks copied for TCGplayer Mass Entry.'
      : 'Missing cards copied for TCGplayer Mass Entry.'
  }

  return allDecks
    ? 'All saved decks copied for TCGplayer Mass Entry.'
    : 'Full deck copied for TCGplayer Mass Entry.'
}

async function copyTcgplayerDeckToClipboard({
  additionalDecks,
  allDecks,
  cardsById,
  collection,
  deck,
  missingOnly,
}) {
  try {
    const payload = createTcgplayerMassEntry(deck, {
      additionalDecks,
      collection,
      cardsById,
      missingOnly,
    })

    if (!payload) {
      throw new Error(getEmptyTcgplayerCopyMessage({ allDecks, missingOnly }))
    }
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard access is unavailable in this browser.')
    }

    await navigator.clipboard.writeText(payload)
    return {
      type: 'success',
      message: getSuccessfulTcgplayerCopyMessage({ allDecks, missingOnly }),
      autoDismiss: true,
      source: 'tcgplayer',
    }
  } catch (copyError) {
    return {
      type: 'error',
      message:
        copyError instanceof Error
          ? copyError.message
          : 'The TCGplayer Mass Entry list could not be copied.',
      autoDismiss: true,
      source: 'tcgplayer',
    }
  }
}

function App() {
  const [catalog, setCatalog] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [cardFaces, setCardFaces] = useState([])
  const [savedDecks, setSavedDecks] = useState([])
  const [deckHistories, setDeckHistories] = useState({})
  const [deckHistoryDetails, setDeckHistoryDetails] = useState(null)
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const [deckLibraryReady, setDeckLibraryReady] = useState(false)
  const [deckError, setDeckError] = useState('')
  const [deckPersistenceMode, setDeckPersistenceMode] = useState('browser')
  const [deckPersistenceState, setDeckPersistenceState] = useState('loading')
  const [deckPersistenceError, setDeckPersistenceError] = useState('')
  const [copyStatus, setCopyStatus] = useState(null)
  const [tcgplayerMissingOnly, setTcgplayerMissingOnly] = useState(false)
  const [tcgplayerAllDecks, setTcgplayerAllDecks] = useState(false)
  const [agenticFeature, setAgenticFeature] = useState({
    accessLeaseTtlMs: null,
    authorized: false,
    enabled: false,
    available: false,
    authenticationAvailable: false,
    leaseExpiresAt: null,
  })
  const [agenticFeatureResolved, setAgenticFeatureResolved] = useState(false)
  const [desktopSettingsAvailable, setDesktopSettingsAvailable] = useState(false)
  const [agentImageAttachmentsAvailable, setAgentImageAttachmentsAvailable] =
    useState(false)
  const [desktopGoogleDriveAvailable, setDesktopGoogleDriveAvailable] =
    useState(false)
  const [googleDriveClientId, setGoogleDriveClientId] = useState(
    () => resolveGoogleDriveClientId(
      null,
      import.meta.env.GOOGLE_DRIVE_CLIENT_ID,
    ),
  )
  const [googleDriveWebAuthorization, setGoogleDriveWebAuthorization] =
    useState('token')
  const [isDesktopSettingsOpen, setIsDesktopSettingsOpen] = useState(false)
  const [agentChat, setAgentChat] = useState(null)
  const [agentChatInput, setAgentChatInput] = useState('')
  const [agentPromptHistory, setAgentPromptHistory] = useState(() =>
    loadAgentPromptHistory(window.localStorage),
  )
  const [agentChatImages, setAgentChatImages] = useState([])
  const [agentChatImageError, setAgentChatImageError] = useState('')
  const [agentChatStatus, setAgentChatStatus] = useState('idle')
  const [agentChatError, setAgentChatError] = useState('')
  const [isAgentChatOpen, setIsAgentChatOpen] = useState(false)
  const [agentCardPreview, setAgentCardPreview] = useState(null)
  const agentCardPreviewVisible = agentCardPreview !== null
  const [drawDeckCostSort, setDrawDeckCostSort] = useState('none')
  const [drawDeckSetSort, setDrawDeckSetSort] = useState('none')
  const [drawDeckAspectSort, setDrawDeckAspectSort] = useState(null)
  const [showDeckCardOwnership, setShowDeckCardOwnership] = useState(false)
  const agentSessionRequestRef = useRef(0)
  const siteNavRef = useRef(null)

  useEffect(() => {
    if (!agentCardPreviewVisible) return undefined

    const hidePreview = () => setAgentCardPreview(null)
    const hidePreviewOutsideTrigger = (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[data-agent-card-preview]')
      ) {
        hidePreview()
      }
    }

    window.addEventListener('blur', hidePreview)
    window.addEventListener('pointermove', hidePreviewOutsideTrigger, {
      passive: true,
    })
    return () => {
      window.removeEventListener('blur', hidePreview)
      window.removeEventListener('pointermove', hidePreviewOutsideTrigger)
    }
  }, [agentCardPreviewVisible])
  const deckDatabaseRevisionRef = useRef(0)
  const deckDatabasePersistedRef = useRef('')
  const deckDatabaseLatestRef = useRef('')
  const deckDatabaseWriteChainRef = useRef(Promise.resolve())
  const deckDatabaseWritesBlockedRef = useRef(false)
  const databaseImportInputRef = useRef(null)
  const remoteBackupOverrideRef = useRef(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importSource, setImportSource] = useState('')
  const [importError, setImportError] = useState('')
  const [pendingDatabaseImport, setPendingDatabaseImport] = useState(null)
  const [isCloudBackupOpen, setIsCloudBackupOpen] = useState(false)
  const [cardSearchQuery, setCardSearchQuery] = useState('')
  const [cardCollection, setCardCollection] = useState(() =>
    loadCardCollection(window.localStorage),
  )
  const selectedDeckRecord =
    savedDecks.find((record) => record.id === selectedDeckId) ?? null
  const selectedDeckHistory = deckHistories[selectedDeckId] ?? null
  const deck = selectedDeckRecord?.deck ?? null
  const deckName = selectedDeckRecord?.name ?? ''
  const deckExportDisabledReason = getDeckExportDisabledReason(deck)
  const tcgplayerCopyDisabledReason = getTcgplayerCopyDisabledReason(deck)
  const agentCardReferences = useMemo(
    () => (catalog ? createCatalogCardReferenceIndex(catalog) : new Map()),
    [catalog],
  )
  const collectionCardReferences = useMemo(
    () => (catalog ? createCatalogPrintingIndex(catalog) : new Map()),
    [catalog],
  )
  const decodeRemoteDatabase = useMemo(
    () => (source) => parsePlayerDatabaseBackup(source, agentCardReferences),
    [agentCardReferences],
  )
  const handleRemoteDatabaseRestore = useCallback((backup) => {
    setSavedDecks(backup.decks)
    setDeckHistories(
      initializeDeckHistories(
        backup.decks,
        'Restored from Google Drive',
        agentCardReferences,
      ),
    )
    setSelectedDeckId((current) =>
      backup.decks.some((record) => record.id === current)
        ? current
        : backup.decks[0]?.id ?? null,
    )
    setCardCollection(backup.collection)
    setDeckError('')
    setCopyStatus({
      type: 'success',
      message: `${backup.decks.length.toLocaleString()} decks and the card collection were restored from Google Drive.`,
    })
  }, [agentCardReferences])
  const remoteBackup = useRemoteBackup({
    clientId: googleDriveClientId,
    decodeDatabase: decodeRemoteDatabase,
    desktopAvailable: desktopGoogleDriveAvailable,
    desktopRuntime: desktopSettingsAvailable,
    enabled: Boolean(catalog) && agenticFeatureResolved,
    onRestore: handleRemoteDatabaseRestore,
    storage: window.localStorage,
    webAuthorization: googleDriveWebAuthorization,
  })
  const queueRemoteBackup = useEffectEvent((source, options) => {
    remoteBackup.queue(source, options)
  })
  const reconnectRemoteBackup = useEffectEvent((source) => {
    remoteBackup.reconnect(source)
  })

  useEffect(() => {
    if (!deckLibraryReady || !remoteBackup.reconnectAvailable) return
    reconnectRemoteBackup(createPlayerDatabaseBackup({
      collection: cardCollection,
      decks: savedDecks,
      selectedDeckId,
    }))
  }, [
    cardCollection,
    deckLibraryReady,
    remoteBackup.reconnectAvailable,
    savedDecks,
    selectedDeckId,
  ])
  const cardSearchIndex = useMemo(
    () => (catalog ? createCardSearchIndex(catalog) : []),
    [catalog],
  )
  const collectionSearchIndex = useMemo(
    () =>
      catalog
        ? createCardSearchIndex(catalog, { includeVariants: true })
        : [],
    [catalog],
  )
  const cardSearchResults = useMemo(
    () => fuzzySearchCards(cardSearchIndex, cardSearchQuery),
    [cardSearchIndex, cardSearchQuery],
  )
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
    const dismissDelay = getCopyStatusDismissDelay(copyStatus)
    if (dismissDelay === null) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => setCopyStatus(null), dismissDelay)
    return () => window.clearTimeout(timeoutId)
  }, [copyStatus])

  useEffect(() => {
    setCopyStatus(clearStaleTcgplayerCopyStatus)
  }, [
    cardCollection,
    savedDecks,
    selectedDeckId,
    tcgplayerAllDecks,
    tcgplayerMissingOnly,
  ])

  useEffect(() => {
    if (!deckLibraryReady) {
      return undefined
    }

    const queuePersistedSnapshot = () => {
      const force = remoteBackupOverrideRef.current
      remoteBackupOverrideRef.current = false
      queueRemoteBackup(
        createPlayerDatabaseBackup({
          collection: cardCollection,
          decks: savedDecks,
          selectedDeckId,
        }),
        { force },
      )
    }

    if (deckPersistenceMode === 'database') {
      saveLocalDeckSelection(window.localStorage, selectedDeckId)
      const fingerprint = databaseSnapshotFingerprint(
        savedDecks,
        cardCollection,
        agentPromptHistory,
      )
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
              cardCollection,
              agentPromptHistory,
            )
            deckDatabaseRevisionRef.current = snapshot.revision
            deckDatabasePersistedRef.current = fingerprint
            setDeckPersistenceState(
              deckDatabaseLatestRef.current === fingerprint
                ? 'saved'
                : 'saving',
            )
            setDeckPersistenceError('')
            queuePersistedSnapshot()
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
      queuePersistedSnapshot()
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
  }, [
    cardCollection,
    agentPromptHistory,
    deckLibraryReady,
    deckPersistenceMode,
    savedDecks,
    selectedDeckId,
  ])

  useEffect(() => {
    if (!agentChat) {
      return
    }

    saveAgentChat(window.localStorage, agentChat)
  }, [agentChat])

  useEffect(() => {
    saveAgentPromptHistory(window.localStorage, agentPromptHistory)
  }, [agentPromptHistory])

  useEffect(() => {
    saveCardCollection(window.localStorage, cardCollection)
  }, [cardCollection])

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
            accessLeaseTtlMs: null,
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
        setAgentImageAttachmentsAvailable(
          features?.agenticDeckGeneration?.imageAttachmentsAvailable === true ||
            features?.desktop?.imageAttachmentsAvailable === true,
        )
        setDesktopGoogleDriveAvailable(
          features?.desktop?.googleDriveAvailable === true,
        )
        setGoogleDriveClientId(
          resolveGoogleDriveClientId(
            features?.googleDrive,
            import.meta.env.GOOGLE_DRIVE_CLIENT_ID,
          ),
        )
        setGoogleDriveWebAuthorization(
          features?.googleDrive?.webAuthorization === 'broker'
            ? 'broker'
            : 'token',
        )
        setAgenticFeatureResolved(true)
      })
      .catch((featureError) => {
        if (featureError.name !== 'AbortError') {
          setDeckPersistenceMode('browser')
          setAgenticFeature({
            accessLeaseTtlMs: null,
            authorized: false,
            enabled: false,
            available: false,
            authenticationAvailable: false,
            leaseExpiresAt: null,
          })
          setDesktopSettingsAvailable(false)
          setAgentImageAttachmentsAvailable(false)
          setDesktopGoogleDriveAvailable(false)
          setGoogleDriveWebAuthorization('token')
          setAgenticFeatureResolved(true)
        }
      })

    return () => controller.abort()
  }, [])

  const previousAgentChatImagesRef = useRef([])

  useEffect(() => {
    const currentUrls = new Set(
      agentChatImages.map((attachment) => attachment.previewUrl),
    )
    previousAgentChatImagesRef.current.forEach((attachment) => {
      if (!currentUrls.has(attachment.previewUrl)) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
    })
    previousAgentChatImagesRef.current = agentChatImages
  }, [agentChatImages])

  useEffect(
    () => () => {
      previousAgentChatImagesRef.current.forEach((attachment) =>
        URL.revokeObjectURL(attachment.previewUrl),
      )
    },
    [],
  )

  useEffect(() => {
    if (agentImageAttachmentsAvailable) return
    setAgentChatImages([])
    setAgentChatImageError('')
  }, [agentImageAttachmentsAvailable])

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
      setAgentImageAttachmentsAvailable(false)
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
        const storedCollection = loadCardCollection(window.localStorage)
        const storedPromptHistory = loadAgentPromptHistory(window.localStorage)
        const library = deckPersistenceMode === 'database'
          ? await databaseDeckLibrary(
              catalog,
              window.localStorage,
              storedLibrary,
              storedCollection,
              storedPromptHistory,
              controller.signal,
            )
          : {
              ...browserDeckLibrary(catalog, window.localStorage, storedLibrary),
              collection: storedCollection,
              promptHistory: storedPromptHistory,
            }

        if (!isCurrent) {
          return
        }

        if (library.records.length > 0) {
          markStarterDeckSeen(window.localStorage)
        }
        const hydrateDeckAspects = createDeckAspectHydrator(catalog)
        const historyCardsById = createCatalogCardReferenceIndex(catalog)
        const hydratedRecords = library.records.map((record) => {
          const deck = hydrateDeckAspects(record.deck)
          return {
            ...record,
            deck,
            history: normalizePersistentDeckHistory(
              record.history,
              deck,
              record.collectionCheckpoint,
              { cardsById: historyCardsById },
            ),
          }
        })
        const normalizedCollection = normalizeCardCollection(
          library.collection,
        )
        const alignedRecords = alignDeckCollectionCheckpoints(
          hydratedRecords,
          createCollectionCheckpoint(normalizedCollection),
        )
        if (deckPersistenceMode === 'database') {
          const fingerprint = databaseSnapshotFingerprint(
            alignedRecords,
            normalizedCollection,
            library.promptHistory,
          )
          deckDatabaseRevisionRef.current = library.revision
          deckDatabasePersistedRef.current = fingerprint
          deckDatabaseLatestRef.current = fingerprint
          deckDatabaseWritesBlockedRef.current = false
          setDeckPersistenceState('saved')
          setDeckPersistenceError('')
        }
        setSavedDecks(alignedRecords)
        setDeckHistories(
          initializeDeckHistories(
            alignedRecords,
            undefined,
            historyCardsById,
          ),
        )
        setCardCollection(normalizedCollection)
        setAgentPromptHistory(library.promptHistory)
        setSelectedDeckId(library.selectedId)
        setDeckError('')
        setDeckLibraryReady(true)
      } catch (generationError) {
        if (!isCurrent || generationError.name === 'AbortError') {
          return
        }

        setSavedDecks([])
        setDeckHistories({})
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
      collectionCheckpoint: createCollectionCheckpoint(cardCollection),
      historyLabel: 'New deck created',
    })
    setSavedDecks(result.records)
    setDeckHistories((current) =>
      addDeckHistory(current, result.record, 'New deck created'),
    )
    setSelectedDeckId(result.record.id)
    setDeckError('')
    setCopyStatus(null)
  }

  function currentPlayerDatabaseSource() {
    return createPlayerDatabaseBackup({
      collection: cardCollection,
      decks: savedDecks,
      selectedDeckId,
    })
  }

  function handleConnectCloudBackup() {
    remoteBackup.connect(currentPlayerDatabaseSource())
  }

  function handleCloudBackupNow() {
    remoteBackup.backupNow(currentPlayerDatabaseSource())
  }

  function handleExportDatabase() {
    setCopyStatus(null)
    try {
      const source = currentPlayerDatabaseSource()
      const url = URL.createObjectURL(
        new Blob([source], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = playerDatabaseBackupFilename()
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setCopyStatus({
        type: 'success',
        message: 'Player database backup exported.',
      })
    } catch (exportError) {
      setCopyStatus({
        type: 'error',
        message:
          exportError instanceof Error
            ? exportError.message
            : 'The player database could not be exported.',
      })
    }
  }

  async function handleDatabaseImportFile(event) {
    const [file] = event.target.files ?? []
    event.target.value = ''
    if (!file) return

    setCopyStatus(null)
    try {
      const sizeError = playerDatabaseBackupSizeError(file.size)
      if (sizeError) throw new Error(sizeError)
      const backup = parsePlayerDatabaseBackup(
        await file.text(),
        agentCardReferences,
      )
      setPendingDatabaseImport({ backup, fileName: file.name })
    } catch (importFailure) {
      setPendingDatabaseImport(null)
      setCopyStatus({
        type: 'error',
        message:
          importFailure instanceof Error
            ? importFailure.message
            : 'The player database backup could not be imported.',
      })
    }
  }

  function handleConfirmDatabaseImport() {
    const { backup } = pendingDatabaseImport
    remoteBackupOverrideRef.current = true
    setSavedDecks(backup.decks)
    setDeckHistories(
      initializeDeckHistories(
        backup.decks,
        'Imported player database',
        agentCardReferences,
      ),
    )
    setSelectedDeckId(backup.selectedDeckId)
    setCardCollection(backup.collection)
    setDeckError('')
    setPendingDatabaseImport(null)
    setCopyStatus({
      type: 'success',
      message: `${backup.decks.length.toLocaleString()} decks and the card collection were restored.`,
    })
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

  async function handleCopyTcgplayerDeck() {
    setCopyStatus(
      await copyTcgplayerDeckToClipboard({
        additionalDecks: tcgplayerAllDecks
          ? savedDecks
              .filter((record) => record.id !== selectedDeckId)
              .map((record) => record.deck)
          : [],
        allDecks: tcgplayerAllDecks,
        cardsById: agentCardReferences,
        collection: cardCollection,
        deck,
        missingOnly: tcgplayerMissingOnly,
      }),
    )
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
        collectionCheckpoint: createCollectionCheckpoint(cardCollection),
        historyLabel: 'Imported deck',
      })
      setSavedDecks(result.records)
      setDeckHistories((current) =>
        addDeckHistory(current, result.record, 'Imported deck'),
      )
      setSelectedDeckId(result.record.id)
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
    setCopyStatus(null)
    setDeckError('')
  }

  function handleDeckHistoryNavigate(position) {
    if (!selectedDeckRecord || !selectedDeckHistory) {
      return
    }

    const entry = deckHistoryEntryAt(selectedDeckHistory, position)
    if (!entry || position === selectedDeckHistory.position) {
      return
    }

    const history = movePersistentDeckHistory(
      selectedDeckRecord.history,
      position,
    )
    const persistentEntry = persistentDeckHistoryEntryAt(history, position)
    const result = updateDeckRecord(
      savedDecks,
      selectedDeckRecord.id,
      entry.deck,
      persistentEntry?.collectionCheckpoint,
      history,
    )
    setSavedDecks(result.records)
    setDeckHistories((current) =>
      moveDeckHistory(current, selectedDeckRecord.id, position),
    )
    setCopyStatus(null)
    setDeckError('')
  }

  function handleShowDeckHistoryDetails(entry) {
    if (!entry.visual?.details) return

    setAgentCardPreview(null)
    setDeckHistoryDetails({
      label: entry.label,
      proposal: {
        targetDeckName: deckName,
        visualChanges: entry.visual.details,
      },
    })
  }

  function handleRenameDeck(id, name) {
    setSavedDecks(renameDeckRecord(savedDecks, id, name))
  }

  function handleDeleteDeck(id) {
    if (savedDecks.length === 1) {
      const replacement = addDeckRecord([], {
        deck: createEmptyDeck(),
        name: 'New deck',
        collectionCheckpoint: createCollectionCheckpoint(cardCollection),
        historyLabel: 'New deck created',
      })
      setSavedDecks(replacement.records)
      setDeckHistories(
        initializeDeckHistories(replacement.records, 'New deck created'),
      )
      setSelectedDeckId(replacement.record.id)
      setCopyStatus(null)
      setDeckError('')
      return
    }

    const result = deleteDeckRecord(savedDecks, id, selectedDeckId)
    setSavedDecks(result.records)
    setDeckHistories((current) => removeDeckHistory(current, id))
    setSelectedDeckId(result.selectedId)
    setCopyStatus(null)
    setDeckError('')
  }

  function commitDeckVersion(
    targetRecord,
    nextDeck,
    label,
    visual = null,
    checkpointCollection = cardCollection,
  ) {
    if (!targetRecord || decksHaveSameState(targetRecord.deck, nextDeck)) {
      return null
    }

    const collectionCheckpoint = createCollectionCheckpoint(
      checkpointCollection,
    )
    const history = appendPersistentDeckHistory(targetRecord.history, {
      collectionCheckpoint,
      previousDeck: targetRecord.deck,
      nextDeck,
      label,
      visual,
    })
    const result = updateDeckRecord(
      savedDecks,
      targetRecord.id,
      nextDeck,
      collectionCheckpoint,
      history,
    )
    setSavedDecks(result.records)
    setDeckHistories((current) =>
      appendDeckHistory(current, {
        deckId: targetRecord.id,
        previousDeck: targetRecord.deck,
        nextDeck,
        label,
        visual,
      }),
    )
    return result
  }

  function commitManualDeck(nextDeck, message, visual = null) {
    const result = commitDeckVersion(
      selectedDeckRecord,
      nextDeck,
      message,
      visual,
    )
    if (!result) {
      return
    }

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
      deckHistoryCardVisual(card, 'addition'),
    )
  }

  function handleAddToCollection(card) {
    const cardId = getCatalogCardId(card)
    if (!cardId) return
    setCardCollection((current) =>
      getCardCollectionCount(current, cardId) > 0
        ? current
        : addCardCollectionCopies(current, cardId),
    )
  }

  function handleSetCollectionCount(cardId, count) {
    setCardCollection((current) =>
      setCardCollectionCount(current, cardId, count),
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
        deckHistoryCardVisual(card, 'addition'),
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
      deckHistoryCardVisual(card, 'addition'),
    )
  }

  function handleUseBase(card) {
    if (!selectedDeckRecord) {
      return
    }

    commitManualDeck(
      replaceBaseInDeck(selectedDeckRecord.deck, card),
      `${card.name} is now the deck base.`,
      deckHistoryCardVisual(card, 'addition'),
    )
  }

  function handleRemoveSecondLeader() {
    if (!selectedDeckRecord?.deck.secondLeader) {
      return
    }

    const secondLeader = selectedDeckRecord.deck.secondLeader
    const name = secondLeader.name
    commitManualDeck(
      removeSecondLeaderFromDeck(selectedDeckRecord.deck),
      `${name} removed as the second leader.`,
      deckHistoryCardVisual(secondLeader, 'removal'),
    )
  }

  function handleRemoveCard(zone, card) {
    if (!selectedDeckRecord) {
      return
    }

    try {
      const nextDeck = removeCardFromDeck(selectedDeckRecord.deck, zone, card)
      commitManualDeck(
        nextDeck,
        `Removed one copy of ${card.name}.`,
        deckHistoryCardVisual(card, 'removal'),
      )
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

  function handleAgentImagesSelected(files) {
    if (!agentImageAttachmentsAvailable) return

    const selectedFiles = [...files]
    if (
      selectedFiles.length === 0 ||
      agentChatImages.length + selectedFiles.length > MAX_AGENT_IMAGE_ATTACHMENTS
    ) {
      setAgentChatImageError(
        `Attach no more than ${MAX_AGENT_IMAGE_ATTACHMENTS} images at a time.`,
      )
      return
    }

    const validationError = selectedFiles
      .map((file) => validateAgentImageFile(file))
      .find(Boolean)
    if (validationError) {
      setAgentChatImageError(validationError)
      return
    }

    setAgentChatImages((current) => [
      ...current,
      ...selectedFiles.map((file) => ({
        file,
        id: createChatMessageId(),
        name: agentImageDisplayName(file),
        previewUrl: URL.createObjectURL(file),
        size: file.size,
      })),
    ])
    setAgentChatImageError('')
  }

  function handleRemoveAgentImage(imageId) {
    setAgentChatImages((current) =>
      current.filter((attachment) => attachment.id !== imageId),
    )
    setAgentChatImageError('')
  }

  const handleHideAgentCardPreview = useCallback(() => {
    setAgentCardPreview(null)
  }, [])

  const handleShowAgentCardPreview = useCallback((card, event) => {
    const isPointerEvent = event.type.startsWith('pointer')
    const bounds = event.currentTarget.getBoundingClientRect()

    setAgentCardPreview({
      card,
      anchorX: isPointerEvent ? event.clientX : bounds.right,
      anchorY: isPointerEvent
        ? event.clientY
        : bounds.top + bounds.height / 2,
    })
  }, [])

  async function processAgentChatQueue({
    activeSession,
    basePrompt,
    batchId,
    currentDeck,
    onImageCompleted,
    queuedImages,
    requestId,
  }) {
    const turns = queuedImages.length > 0 ? queuedImages : [null]
    for (const [index, imageAttachment] of turns.entries()) {
      const requestPrompt = agentImageQueuePrompt(
        basePrompt,
        index,
        turns.length,
      )
      const userMessage = createAgentChatUserMessage(
        basePrompt,
        imageAttachment,
      )
      setAgentChat({
        ...activeSession,
        messages: [...activeSession.messages, userMessage],
      })
      const result = await sendAgentChatWithRenewal({
        activeSession,
        collection: cardCollection,
        collectionContext: createAgentCollectionContext(
          savedDecks,
          selectedDeckRecord,
          cardCollection,
        ),
        contextRecord: selectedDeckRecord,
        currentDeck,
        deckLibrary: createAgentDeckLibrary(savedDecks),
        deckName,
        imageAttachment,
        onRenewed: (session, messages) => {
          setAgentChat({ ...session, messages })
        },
        prompt: requestPrompt,
        userMessage,
      })
      const { response, payload } = result

      assertAgentChatResponse(response, payload)
      if (requestId !== agentSessionRequestRef.current) return null

      const proposal = shouldPresentAgentImageProposal(index, turns.length)
        ? createAgentChatProposal(
            payload,
            selectedDeckRecord,
            cardCollection,
            agentCardReferences,
            batchId,
          )
        : null
      const assistantMessage = {
        id: createChatMessageId(),
        role: 'assistant',
        text: payload.message || 'The deck assistant completed the request.',
        proposal,
      }
      const messages = [...result.conversationMessages, assistantMessage]
      activeSession = {
        token: payload.session?.token ?? result.activeSession.token,
        expiresAt: payload.session?.expiresAt ?? result.activeSession.expiresAt,
        hasConversation: payload.session?.hasConversation ?? true,
        ...agentChatDeckContext(selectedDeckRecord),
        messages,
      }
      setAgentChat(activeSession)
      if (imageAttachment) onImageCompleted()
    }

    return activeSession
  }

  async function handleAgentChatSubmit(event) {
    event.preventDefault()

    const queuedImages = [...agentChatImages]
    const basePrompt = promptForAgentChat(agentChatInput, queuedImages)
    if (!basePrompt || !agentChat?.token || !selectedDeckRecord) {
      return
    }
    const requestId = agentSessionRequestRef.current
    const batchId = createChatMessageId()
    const currentDeck = serializeAgentDeckContext(deck, {
      name: deckName,
    })
    let activeSession = agentChat
    let completedImageCount = 0

    if (agentChatInput.trim()) {
      setAgentPromptHistory((current) =>
        addAgentPromptHistoryEntry(current, agentChatInput),
      )
    }
    setAgentChatInput('')
    setAgentChatError('')
    setAgentChatImageError('')
    setAgentChatStatus('loading')

    try {
      activeSession = await processAgentChatQueue({
        activeSession,
        basePrompt,
        batchId,
        currentDeck,
        onImageCompleted: () => {
          completedImageCount += 1
        },
        queuedImages,
        requestId,
      })
      if (!activeSession) return

      setAgentChatImages([])
      setAgentChatStatus('idle')
    } catch (chatFailure) {
      if (requestId !== agentSessionRequestRef.current) {
        return
      }

      if (completedImageCount > 0) {
        setAgentChatImages(queuedImages.slice(completedImageCount))
      }
      if (agentChatInput.trim()) setAgentChatInput(basePrompt)
      setAgentChatStatus('error')
      setAgentChatError(
        chatFailure instanceof Error
          ? chatFailure.message
          : 'The AI deck assistant could not complete the request.',
      )
    }
  }

  function updateChatProposal(
    messageId,
    update,
    contextRecord = null,
    collectionRevisionUpdate = null,
  ) {
    setAgentChat((current) =>
      current
        ? {
            ...current,
            ...(contextRecord ? agentChatDeckContext(contextRecord) : {}),
            messages: advanceAgentProposalBatchCollectionRevision(
              current.messages.map((message) =>
                message.id === messageId && message.proposal
                  ? {
                      ...message,
                      proposal: update(message.proposal),
                    }
                  : message,
              ),
              collectionRevisionUpdate ?? {},
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

  function handleDismissChatChange(messageId, changeId) {
    const message = agentChat?.messages.find(
      (candidate) => candidate.id === messageId,
    )
    const change = message?.proposal?.changes?.find(
      (candidate) => candidate.id === changeId,
    )

    if (
      message?.proposal?.operation !== 'modify' ||
      message.proposal.status !== 'pending' ||
      change?.zone !== 'collection' ||
      change.status !== 'pending'
    ) {
      return
    }

    updateChatProposal(messageId, (proposal) =>
      dismissAgentProposalChange(proposal, changeId),
    )
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
        collectionCheckpoint: createCollectionCheckpoint(cardCollection),
        historyLabel: 'AI deck created',
      })
      setSavedDecks(result.records)
      setDeckHistories((current) =>
        addDeckHistory(current, result.record, 'AI deck created'),
      )
      setSelectedDeckId(result.record.id)
      setCopyStatus(null)
      updateProposalStatus(messageId, 'applied', result.record)
      return
    }

    const pendingChanges = proposal.changes.filter(
      (change) => change.status === 'pending',
    )
    const changesDeck = pendingChanges.some(
      (change) => change.zone !== 'collection',
    )
    const changesCollection = pendingChanges.some(
      (change) => change.zone === 'collection',
    )
    const targetRecord = changesDeck
      ? savedDecks.find((record) => record.id === proposal.targetDeckId)
      : null
    const staleError = proposalStaleError(
      proposal,
      targetRecord,
      cardCollection,
      { checkCollection: changesCollection, checkDeck: changesDeck },
    )
    if (staleError) {
      setAgentChatError(staleError)
      return
    }

    let nextState
    try {
      nextState = applyAgentProposalChanges(
        targetRecord?.deck ?? proposal.deck,
        cardCollection,
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

    const deckChangeCount = pendingChanges.filter(
      (change) => change.zone !== 'collection',
    ).length
    const result = nextState.deckChanged
      ? commitDeckVersion(
          targetRecord,
          nextState.deck,
          agentProposalHistoryLabel(deckChangeCount),
          agentProposalHistoryVisual(pendingChanges, proposal),
          nextState.collection,
        )
      : null
    if (result) {
      setSelectedDeckId(targetRecord.id)
    }
    if (nextState.collectionChanged) {
      setCardCollection(nextState.collection)
    }
    setCopyStatus(null)
    setAgentChatError('')
    updateChatProposal(
      messageId,
      (currentProposal) => ({
        ...currentProposal,
        targetDeckUpdatedAt:
          result?.record.updatedAt ?? currentProposal.targetDeckUpdatedAt,
        targetCollectionRevision: nextState.collectionChanged
          ? nextState.collection.revision
          : currentProposal.targetCollectionRevision,
        changes: currentProposal.changes.map((change) =>
          change.status === 'pending'
            ? { ...change, status: 'applied' }
            : change,
        ),
        status: 'applied',
      }),
      result?.record ?? null,
      nextState.collectionChanged
        ? {
            batchId: proposal.batchId,
            fromRevision: cardCollection.revision,
            toRevision: nextState.collection.revision,
          }
        : null,
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

    const changesCollection = change.zone === 'collection'
    const targetRecord = changesCollection
      ? null
      : savedDecks.find((record) => record.id === proposal.targetDeckId)
    const staleError = proposalStaleError(
      proposal,
      targetRecord,
      cardCollection,
      {
        checkCollection: changesCollection,
        checkDeck: !changesCollection,
      },
    )
    if (staleError) {
      setAgentChatError(staleError)
      return
    }

    let nextDeck = targetRecord?.deck ?? proposal.deck
    let nextCollection = cardCollection
    try {
      if (changesCollection) {
        nextCollection = applyCardCollectionChange(cardCollection, change, {
          source: 'assistant',
        })
      } else {
        nextDeck = applyCardChange(targetRecord.deck, change, proposal.deck)
      }
    } catch (changeError) {
      setAgentChatError(
        changeError instanceof Error
          ? changeError.message
          : 'The proposed change could not be applied.',
      )
      return
    }

    const result = changesCollection
      ? null
      : commitDeckVersion(
          targetRecord,
          nextDeck,
          agentDeckChangeHistoryLabel(change),
          agentProposalHistoryVisual([change], proposal),
        )
    if (result) {
      setSelectedDeckId(targetRecord.id)
    } else {
      setCardCollection(nextCollection)
    }
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
          targetDeckUpdatedAt:
            result?.record.updatedAt ?? currentProposal.targetDeckUpdatedAt,
          targetCollectionRevision: changesCollection
            ? nextCollection.revision
            : currentProposal.targetCollectionRevision,
          changes,
          status: changes.every((candidate) => candidate.status === 'applied')
            ? 'applied'
            : 'pending',
        }
      },
      result?.record ?? null,
      changesCollection
        ? {
            batchId: proposal.batchId,
            fromRevision: cardCollection.revision,
            toRevision: nextCollection.revision,
          }
        : null,
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
        setDirection: drawDeckSetSort,
      })
    : []
  const groupedSideboard = deck
    ? sortDeckCardGroups(groupDeckCards(deck.sideboard ?? []))
    : []
  const drawDeckOwnership = getCardListOwnershipSummary(
    deck?.drawDeck,
    cardCollection,
    agentCardReferences,
  )
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
      className={appClassName(status, desktopSettingsAvailable)}
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

      <nav ref={siteNavRef} className="site-nav" aria-label="Site navigation">
        <div className="site-nav__inner">
          <div className="site-nav__primary-actions">
            <div
              className="site-nav__group site-nav__database-actions"
              role="toolbar"
              aria-label="Database backup actions"
            >
              <span className="site-nav__group-label">DB</span>
              <div
                className="site-nav__split-action"
                role="group"
                aria-label="Database backup options"
              >
                <button
                  className="site-nav__action"
                  type="button"
                  aria-label="Export database"
                  disabled={!deckLibraryReady}
                  onClick={handleExportDatabase}
                >
                  Export
                </button>
                <button
                  className="site-nav__action"
                  type="button"
                  aria-label="Import database"
                  disabled={!deckLibraryReady || !catalog}
                  onClick={() => databaseImportInputRef.current?.click()}
                >
                  Import
                </button>
              </div>
              <input
                ref={databaseImportInputRef}
                className="site-nav__file-input"
                type="file"
                accept="application/json,.json"
                tabIndex={-1}
                onChange={handleDatabaseImportFile}
              />
            </div>
            {remoteBackup.available && (
              <div className="site-nav__group site-nav__cloud-actions">
                <span className="site-nav__group-label">Cloud</span>
                <button
                  className={`site-nav__action cloud-backup-button is-${remoteBackup.status}`}
                  type="button"
                  aria-haspopup="dialog"
                  disabled={!deckLibraryReady}
                  onClick={() => setIsCloudBackupOpen(true)}
                >
                  {cloudBackupButtonLabel(
                    remoteBackup.status,
                    remoteBackup.reconnectAvailable,
                  )}
                </button>
              </div>
            )}
            <div
              className="site-nav__group site-nav__deck-actions"
              role="toolbar"
              aria-label="Deck actions"
            >
              <span className="site-nav__group-label">Deck actions</span>
              <div
                className="site-nav__split-action is-primary"
                role="group"
                aria-label="Create or import a deck"
              >
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
              </div>
              <button
                className="site-nav__action"
                type="button"
                disabled={Boolean(deckExportDisabledReason)}
                title={deckExportDisabledReason ?? undefined}
                onClick={handleCopySwudbDeck}
              >
                Copy SWUDB JSON
              </button>
              <div
                className="site-nav__split-action"
                role="group"
                aria-label="TCGplayer copy options"
              >
                <button
                  className="site-nav__action"
                  type="button"
                  disabled={Boolean(tcgplayerCopyDisabledReason)}
                  title={tcgplayerCopyDisabledReason ?? undefined}
                  onClick={handleCopyTcgplayerDeck}
                >
                  Copy TCGplayer list
                </button>
                <button
                  className="site-nav__split-toggle"
                  type="button"
                  aria-pressed={tcgplayerMissingOnly}
                  title="Subtract cards in your library from the copied list"
                  onClick={() => setTcgplayerMissingOnly((current) => !current)}
                >
                  Missing only
                </button>
                <button
                  className="site-nav__split-toggle"
                  type="button"
                  aria-pressed={tcgplayerAllDecks}
                  title="Count cards needed across every saved deck"
                  onClick={() => setTcgplayerAllDecks((current) => !current)}
                >
                  All decks
                </button>
              </div>
            </div>
          </div>

          {desktopSettingsAvailable && (
            <div className="site-nav__group site-nav__external-links">
              <button
                className="site-nav__action"
                type="button"
                onClick={() => setIsDesktopSettingsOpen(true)}
              >
                Desktop settings
              </button>
            </div>
          )}
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
            <>
              <DeckHistoryBar
                history={selectedDeckHistory}
                onHidePreview={handleHideAgentCardPreview}
                onNavigate={handleDeckHistoryNavigate}
                onPreviewCard={handleShowAgentCardPreview}
                onShowDetails={handleShowDeckHistoryDetails}
              />
              <section className="deck-workspace" id="deck-workspace">
            <header className="deck-workspace__header">
              <div className="deck-workspace__title">
                <h1>{deckName}</h1>
              </div>
              <DeckAnalysis currencyFormatter={currencyFormatter} deck={deck} />
              <DeckCardSearch
                collection={cardCollection}
                deck={deck}
                query={cardSearchQuery}
                results={cardSearchResults}
                onAddCard={handleAddCard}
                onAddSecondLeader={handleAddSecondLeader}
                onAddToCollection={handleAddToCollection}
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
              <div className="deck-section__heading deck-section__heading--draw-deck">
                <h3>
                  Draw Deck <span>{deck.drawDeck.length}</span>
                  <span
                    className={drawDeckOwnershipSummaryClassName(
                      drawDeckOwnership,
                    )}
                  >
                    {drawDeckOwnership.label}
                  </span>
                  {drawDeckOffAspectCount > 0 && (
                    <span className="deck-section__aspect-warning">
                      {drawDeckOffAspectCount} off-aspect
                    </span>
                  )}
                </h3>
              </div>
              <DrawDeckSortControls
                aspects={drawDeckAspects}
                costDirection={drawDeckCostSort}
                ownershipVisible={showDeckCardOwnership}
                priorityAspect={activeDrawDeckAspectSort}
                onAspectChange={setDrawDeckAspectSort}
                onCostChange={setDrawDeckCostSort}
                onOwnershipChange={setShowDeckCardOwnership}
                onSetChange={setDrawDeckSetSort}
                setDirection={drawDeckSetSort}
              />
              <div className="deck-grid">
                {groupedDrawDeck.map((group) => (
                  <DeckCardStack
                    aspectPenalty={getCardAspectPenalty(group.card, deck)}
                    group={group}
                    key={group.key}
                    ownedCount={getGameplayCardCollectionCount(
                      cardCollection,
                      group.card,
                      agentCardReferences,
                    )}
                    showOwnership={showDeckCardOwnership}
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
                      ownedCount={getGameplayCardCollectionCount(
                        cardCollection,
                        group.card,
                        agentCardReferences,
                      )}
                      showOwnership={showDeckCardOwnership}
                      onRemove={() => handleRemoveCard('sideboard', group.cards[0])}
                    />
                  ))}
                </div>
              ) : (
                <p className="deck-section__empty">No sideboard cards yet.</p>
              )}
            </div>
              </section>
            </>
          )}
        </div>

        <RightRail
          cardsById={collectionCardReferences}
          catalog={catalog}
          collection={cardCollection}
          deck={deck}
          isElectron={desktopSettingsAvailable}
          onSetCount={handleSetCollectionCount}
          searchIndex={collectionSearchIndex}
        />
      </div>

      <footer className="app-footer">
        <strong>{formatApplicationVersion(import.meta.env.APP_VERSION)}</strong>
        <nav className="app-footer__links" aria-label="Application links">
          <a className="app-footer__link" href="/privacy">
            Privacy
          </a>
          <a className="app-footer__link" href="/terms">
            Terms
          </a>
          <a
            className="app-footer__link"
            href="https://github.com/Alfwich/swu-deck-builder"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
          <a
            className="app-footer__link"
            href="https://swudb.com/decks/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open SWUDB <span aria-hidden="true">↗</span>
          </a>
          <a
            className="app-footer__link"
            href={TCGPLAYER_MASS_ENTRY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            TCGplayer Mass Entry <span aria-hidden="true">↗</span>
          </a>
        </nav>
        <span className="app-footer__notice">{FAN_TOOL_NOTICE}</span>
      </footer>

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
        history={agentPromptHistory}
        imageAttachments={agentChatImages}
        imageAttachmentsAvailable={agentImageAttachmentsAvailable}
        imageError={agentChatImageError}
        input={agentChatInput}
        isOpen={isAgentChatOpen}
        messages={agentChat?.messages ?? []}
        status={agentChatStatus}
        topBarRef={siteNavRef}
        onApplyChange={handleApplyChatChange}
        onApplyProposal={handleApplyChatProposal}
        onDismissProposal={handleDismissChatProposal}
        onDismissChange={handleDismissChatChange}
        onImagesSelected={handleAgentImagesSelected}
        onInputChange={setAgentChatInput}
        onHidePreview={handleHideAgentCardPreview}
        onOpenDesktopSettings={() => setIsDesktopSettingsOpen(true)}
        onPreviewCard={handleShowAgentCardPreview}
        onRemoveImage={handleRemoveAgentImage}
        onSubmit={handleAgentChatSubmit}
        onToggle={handleToggleAgentChat}
      />

      {agentCardPreview && !deckHistoryDetails && (
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

      {deckHistoryDetails && (
        <CardChangesDialog
          eyebrow="Deck history"
          onClose={() => setDeckHistoryDetails(null)}
          proposal={deckHistoryDetails.proposal}
          subtitle={deckHistoryDetails.proposal.targetDeckName}
          title={deckHistoryDetails.label}
        />
      )}

      <PendingDatabaseImportDialog
        pending={pendingDatabaseImport}
        onClose={() => setPendingDatabaseImport(null)}
        onConfirm={handleConfirmDatabaseImport}
      />

      {isCloudBackupOpen && remoteBackup.available && (
        <CloudBackupDialog
          backup={remoteBackup}
          onBackupNow={handleCloudBackupNow}
          onClose={() => setIsCloudBackupOpen(false)}
          onConnect={handleConnectCloudBackup}
          onDisconnect={remoteBackup.disconnect}
          onResolveConflict={remoteBackup.resolveConflict}
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
