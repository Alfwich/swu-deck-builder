import {
  useEffect,
  useEffectEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  addAgentPromptHistoryEntry,
  advanceAgentProposalBatchCollectionRevision,
  agentChatDeckContext,
  createAgentCollectionContext,
  createAgentDeckLibrary,
  createAgentGreeting,
  dismissAgentProposalChange,
  loadAgentChat,
  loadAgentPromptHistory,
  saveAgentChat,
  saveAgentPromptHistory,
} from './agent-chat.js'
import {
  createDeckAspectHydrator,
  getCatalogCardId,
} from './catalog.js'
import {
  addCardCollectionCopies,
  applyCardCollectionChange,
  createCollectionCheckpoint,
  getCardCollectionCount,
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
import { getDeckExportDisabledReason } from './integrations/deck-export.js'
import {
  copyTcgplayerDeckToClipboard,
  getTcgplayerCopyDisabledReason,
} from './integrations/tcgplayer-clipboard.js'
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
import { markStarterDeckSeen } from './starter-deck.js'
import {
  agentImageQueuePrompt,
  shouldPresentAgentImageProposal,
} from './agent-image.js'
import {
  databaseSnapshotFingerprint,
  saveLocalDeckDatabase,
  saveLocalDeckSelection,
} from './local-deck-database.js'
import {
  createPlayerDatabaseBackup,
  parsePlayerDatabaseBackup,
  playerDatabaseBackupFilename,
  playerDatabaseBackupSizeError,
} from './player-database-backup.js'
import { applyCardChange } from './deck-changes.js'
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
  deckHistoryEntryAt,
  decksHaveSameState,
  hydratePersistentDeckHistoryEntryAt,
  initializeDeckHistories,
  moveDeckHistory,
  movePersistentDeckHistory,
  normalizePersistentDeckHistory,
  persistentDeckHistoryNeedsMigration,
  persistentDeckHistoryEntryAt,
  removeDeckHistory,
} from './deck-history.js'
import { DesktopSettingsDialog } from './DesktopSettingsDialog.jsx'
import { CloudBackupDialog } from './CloudBackupDialog.jsx'
import { useRemoteBackup } from './use-remote-backup.js'
import { useFeatureConfig } from './app/useFeatureConfig.js'
import { useCopyStatus } from './app/useCopyStatus.js'
import {
  AppFooter,
  AppNotifications,
  CardCascade,
  SiteNav,
} from './app/AppChrome.jsx'
import { useCatalog } from './catalog/useCatalog.js'
import { useCardIndexes } from './catalog/useCardIndexes.js'
import { useAgentCardPreview } from './assistant/useAgentCardPreview.js'
import { useAgentImages } from './assistant/useAgentImages.js'
import { CardChangesDialog } from './deck-changes/CardChangesDialog.jsx'
import {
  ImportDeckDialog,
  PendingDatabaseImportDialog,
} from './player-database/ImportDialogs.jsx'
import { AgentChatPanel } from './assistant/AgentChatPanel.jsx'
import { AgentCardHoverPreview } from './assistant/AgentCardPreview.jsx'
import {
  DiscardDeckHistoryDialog,
} from './decks/DeckLibrary.jsx'
import { DeckWorkspace } from './decks/DeckWorkspace.jsx'
import { useHistoryDiscard } from './decks/useHistoryDiscard.js'
import {
  agentDeckChangeHistoryLabel,
  agentProposalHistoryLabel,
  agentProposalHistoryVisual,
  deckHistoryCardVisual,
} from './deck-changes/history-presentation.js'
import {
  applyAgentProposalChanges,
  createAgentChatProposal,
  proposalStaleError,
} from './assistant/agent-proposals.js'
import {
  assertAgentChatResponse,
  createChatMessageId,
  createRemoteAgentSession,
  createAgentChatUserMessage,
  promptForAgentChat,
  restoreRemoteAgentSession,
  sendAgentChatWithRenewal,
} from './assistant/agent-session.js'
import {
  browserDeckLibrary,
  databaseDeckLibrary,
  deckInitializationError,
} from './player-database/deck-library-loader.js'

function appClassName(status, isElectron) {
  return [
    'app',
    status !== 'loading' ? 'is-ready' : '',
    isElectron ? 'is-electron' : '',
  ].filter(Boolean).join(' ')
}

let initialAgentSessionPromise = null

function App() {
  const { catalog, cardFaces, error, status } = useCatalog()
  const [savedDecks, setSavedDecks] = useState([])
  const [deckHistories, setDeckHistories] = useState({})
  const [deckHistoryDetails, setDeckHistoryDetails] = useState(null)
  const [selectedDeckId, setSelectedDeckId] = useState(null)
  const [deckLibraryReady, setDeckLibraryReady] = useState(false)
  const [deckError, setDeckError] = useState('')
  const [deckPersistenceState, setDeckPersistenceState] = useState('loading')
  const [deckPersistenceError, setDeckPersistenceError] = useState('')
  const [tcgplayerMissingOnly, setTcgplayerMissingOnly] = useState(false)
  const [tcgplayerAllDecks, setTcgplayerAllDecks] = useState(false)
  const {
    agenticFeature,
    agentImageAttachmentsAvailable,
    deckPersistenceMode,
    desktopGoogleDriveAvailable,
    desktopSettingsAvailable,
    googleDriveClientId,
    googleDriveWebAuthorization,
    resolved: agenticFeatureResolved,
  } = useFeatureConfig(import.meta.env.GOOGLE_DRIVE_CLIENT_ID)
  const [isDesktopSettingsOpen, setIsDesktopSettingsOpen] = useState(false)
  const [agentChat, setAgentChat] = useState(null)
  const [agentChatInput, setAgentChatInput] = useState('')
  const [agentPromptHistory, setAgentPromptHistory] = useState(() =>
    loadAgentPromptHistory(window.localStorage),
  )
  const {
    add: handleAgentImagesSelected,
    error: agentChatImageError,
    images: agentChatImages,
    remove: handleRemoveAgentImage,
    setError: setAgentChatImageError,
    setImages: setAgentChatImages,
  } = useAgentImages(agentImageAttachmentsAvailable)
  const [agentChatStatus, setAgentChatStatus] = useState('idle')
  const [agentChatError, setAgentChatError] = useState('')
  const [isAgentChatOpen, setIsAgentChatOpen] = useState(false)
  const {
    hide: handleHideAgentCardPreview,
    preview: agentCardPreview,
    show: handleShowAgentCardPreview,
  } = useAgentCardPreview()
  const [drawDeckCostSort, setDrawDeckCostSort] = useState('none')
  const [drawDeckSetSort, setDrawDeckSetSort] = useState('none')
  const [drawDeckAspectSort, setDrawDeckAspectSort] = useState(null)
  const [showDeckCardOwnership, setShowDeckCardOwnership] = useState(false)
  const agentSessionRequestRef = useRef(0)
  const siteNavRef = useRef(null)

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
  const [cardCollection, setCardCollection] = useState(() =>
    loadCardCollection(window.localStorage),
  )
  const [copyStatus, setCopyStatus] = useCopyStatus({
    cardCollection,
    savedDecks,
    selectedDeckId,
    tcgplayerAllDecks,
    tcgplayerMissingOnly,
  })
  const {
    confirm: confirmHistoryDiscard,
    pending: pendingHistoryDiscard,
    resolve: resolveHistoryDiscard,
  } = useHistoryDiscard()

  const selectedDeckRecord =
    savedDecks.find((record) => record.id === selectedDeckId) ?? null
  const selectedDeckHistory = deckHistories[selectedDeckId] ?? null
  const deck = selectedDeckRecord?.deck ?? null
  const deckName = selectedDeckRecord?.name ?? ''
  const deckExportDisabledReason = getDeckExportDisabledReason(deck)
  const tcgplayerCopyDisabledReason = getTcgplayerCopyDisabledReason(deck)
  const {
    agentCardReferences,
    collectionCardReferences,
    collectionSearchIndex,
    query: cardSearchQuery,
    results: cardSearchResults,
    setQuery: setCardSearchQuery,
  } = useCardIndexes(catalog)
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
  }, [agentCardReferences, setCopyStatus])
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
    setCopyStatus,
  ])
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
    setCopyStatus,
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
        const historiesNeedMigration = library.records.some((record) =>
          persistentDeckHistoryNeedsMigration(record.history),
        )
        const hydrateDeckAspects = createDeckAspectHydrator(catalog)
        const historyCardsById = agentCardReferences
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
          deckDatabasePersistedRef.current = historiesNeedMigration
            ? ''
            : fingerprint
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
    agentCardReferences,
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
    if (!selectedDeckRecord || !selectedDeckHistory || pendingHistoryDiscard) {
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
    const hydratedEntry = hydratePersistentDeckHistoryEntryAt(
      history,
      position,
      agentCardReferences,
    )
    if (!hydratedEntry) return
    const result = updateDeckRecord(
      savedDecks,
      selectedDeckRecord.id,
      hydratedEntry.deck,
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

    handleHideAgentCardPreview()
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

  async function commitDeckVersion(
    targetRecord,
    nextDeck,
    label,
    visual = null,
    checkpointCollection = cardCollection,
  ) {
    if (!targetRecord || decksHaveSameState(targetRecord.deck, nextDeck)) {
      return null
    }

    if (!await confirmHistoryDiscard(targetRecord)) {
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

  async function commitManualDeck(nextDeck, message, visual = null) {
    const result = await commitDeckVersion(
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

  async function commitOptionalDeckVersion(
    shouldCommit,
    targetRecord,
    nextDeck,
    label,
    visual,
    checkpointCollection,
  ) {
    if (!shouldCommit) return { cancelled: false, result: null }
    const result = await commitDeckVersion(
      targetRecord,
      nextDeck,
      label,
      visual,
      checkpointCollection,
    )
    return { cancelled: !result, result }
  }

  async function handleApplyChatProposal(messageId) {
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
    const deckCommit = await commitOptionalDeckVersion(
      nextState.deckChanged,
      targetRecord,
      nextState.deck,
      agentProposalHistoryLabel(deckChangeCount),
      agentProposalHistoryVisual(pendingChanges, proposal),
      nextState.collection,
    )
    if (deckCommit.cancelled) return
    const { result } = deckCommit
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

  async function handleApplyChatChange(messageId, changeId) {
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

    const deckCommit = await commitOptionalDeckVersion(
      !changesCollection,
      targetRecord,
      nextDeck,
      agentDeckChangeHistoryLabel(change),
      agentProposalHistoryVisual([change], proposal),
    )
    if (deckCommit.cancelled) return
    const { result } = deckCommit
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

  return (
    <main
      className={appClassName(status, desktopSettingsAvailable)}
      aria-busy={status === 'loading'}
    >
      <CardCascade cardFaces={cardFaces} />

      <SiteNav
        catalogReady={Boolean(catalog)}
        databaseImportInputRef={databaseImportInputRef}
        deckExportDisabledReason={deckExportDisabledReason}
        deckLibraryReady={deckLibraryReady}
        desktopSettingsAvailable={desktopSettingsAvailable}
        remoteBackup={remoteBackup}
        status={status}
        tcgplayerAllDecks={tcgplayerAllDecks}
        tcgplayerCopyDisabledReason={tcgplayerCopyDisabledReason}
        tcgplayerMissingOnly={tcgplayerMissingOnly}
        topBarRef={siteNavRef}
        onCloudBackupOpen={() => setIsCloudBackupOpen(true)}
        onCopySwudbDeck={handleCopySwudbDeck}
        onCopyTcgplayerDeck={handleCopyTcgplayerDeck}
        onDatabaseExport={handleExportDatabase}
        onDatabaseImport={handleDatabaseImportFile}
        onDesktopSettingsOpen={() => setIsDesktopSettingsOpen(true)}
        onImportDeckOpen={() => {
          setImportError('')
          setIsImportDialogOpen(true)
        }}
        onNewDeck={handleNewDeck}
        onTcgplayerAllDecksChange={setTcgplayerAllDecks}
        onTcgplayerMissingOnlyChange={setTcgplayerMissingOnly}
      />

      <AppNotifications
        copyStatus={copyStatus}
        deckError={deckError}
        deckPersistenceError={deckPersistenceError}
        error={error}
        status={status}
      />

      <DeckWorkspace
        agentCardReferences={agentCardReferences}
        cardCollection={cardCollection}
        cardSearchQuery={cardSearchQuery}
        cardSearchResults={cardSearchResults}
        catalog={catalog}
        collectionCardReferences={collectionCardReferences}
        collectionSearchIndex={collectionSearchIndex}
        deck={deck}
        deckName={deckName}
        deckPersistenceMode={deckPersistenceMode}
        deckPersistenceState={deckPersistenceState}
        desktopSettingsAvailable={desktopSettingsAvailable}
        drawDeckAspectSort={drawDeckAspectSort}
        drawDeckCostSort={drawDeckCostSort}
        drawDeckSetSort={drawDeckSetSort}
        savedDecks={savedDecks}
        selectedDeckHistory={selectedDeckHistory}
        selectedDeckId={selectedDeckId}
        showDeckCardOwnership={showDeckCardOwnership}
        setCardSearchQuery={setCardSearchQuery}
        setDrawDeckAspectSort={setDrawDeckAspectSort}
        setDrawDeckCostSort={setDrawDeckCostSort}
        setDrawDeckSetSort={setDrawDeckSetSort}
        setShowDeckCardOwnership={setShowDeckCardOwnership}
        handleAddCard={handleAddCard}
        handleAddSecondLeader={handleAddSecondLeader}
        handleAddToCollection={handleAddToCollection}
        handleDeckHistoryNavigate={handleDeckHistoryNavigate}
        handleDeleteDeck={handleDeleteDeck}
        handleHideAgentCardPreview={handleHideAgentCardPreview}
        handleRemoveCard={handleRemoveCard}
        handleRemoveSecondLeader={handleRemoveSecondLeader}
        handleRenameDeck={handleRenameDeck}
        handleSelectDeck={handleSelectDeck}
        handleSetCollectionCount={handleSetCollectionCount}
        handleShowAgentCardPreview={handleShowAgentCardPreview}
        handleShowDeckHistoryDetails={handleShowDeckHistoryDetails}
        handleUseBase={handleUseBase}
        handleUseLeader={handleUseLeader}
      />

      <AppFooter version={import.meta.env.APP_VERSION} />

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

      {pendingHistoryDiscard && (
        <DiscardDeckHistoryDialog
          pending={pendingHistoryDiscard}
          onCancel={() => resolveHistoryDiscard(false)}
          onConfirm={() => resolveHistoryDiscard(true)}
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
