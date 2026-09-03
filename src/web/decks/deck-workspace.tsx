import DeckAnalysis from './deck-analysis-view.js'
import DeckHistoryBar from './deck-history-bar.js'
import {
  getCardListOwnershipSummary,
  getGameplayCardCollectionCount,
} from '../player-database/card-collection.js'
import { groupDeckCards } from '../catalog/catalog.js'
import { getCardAspectPenalty } from './deck-aspects.js'
import {
  getUniqueDeckAspects,
  sortDeckCardGroups,
  type SortDirection,
} from './deck-sorting.js'
import { DeckCardSearch } from './deck-card-search.js'
import {
  DeckCardStack,
  DeckIdentities,
  RightRail,
} from './deck-cards.js'
import {
  DeckLibrary,
  DrawDeckSortControls,
} from './deck-library.js'
import type { Dispatch, SetStateAction } from 'react'
import type { PreviewEvent } from '../assistant/use-agent-card-preview.js'
import type { CardSearchEntry } from '../catalog/card-search.js'
import type {
  Catalog,
  DeckCard,
  ReadonlyCardReferenceMap,
} from '../types/catalog.js'
import type { CardCollection } from '../types/collection.js'
import type { Deck, DeckRecord } from '../types/deck.js'
import type { DeckHistory, DeckHistoryEntry } from '../types/history.js'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function drawDeckOwnershipSummaryClassName(summary: { fullyOwned: boolean }) {
  return `deck-section__ownership-summary${summary.fullyOwned ? ' is-fully-owned' : ''}`
}

export function DeckWorkspace({
  agentCardReferences,
  cardCollection,
  cardSearchQuery,
  cardSearchResults,
  catalog,
  collectionCardReferences,
  collectionSearchIndex,
  deck,
  deckName,
  deckPersistenceMode,
  deckPersistenceState,
  desktopSettingsAvailable,
  drawDeckAspectSort,
  drawDeckCostSort,
  drawDeckSetSort,
  savedDecks,
  selectedDeckHistory,
  selectedDeckId,
  showDeckCardOwnership,
  setCardSearchQuery,
  setDrawDeckAspectSort,
  setDrawDeckCostSort,
  setDrawDeckSetSort,
  setShowDeckCardOwnership,
  handleAddCard,
  handleAddSecondLeader,
  handleAddToCollection,
  handleDeckHistoryNavigate,
  handleDeleteDeck,
  handleHideAgentCardPreview,
  handleRemoveCard,
  handleRemoveSecondLeader,
  handleRenameDeck,
  handleSelectDeck,
  handleSetCollectionCount,
  handleShowAgentCardPreview,
  handleShowDeckHistoryDetails,
  handleUseBase,
  handleUseLeader,
}: {
  agentCardReferences: ReadonlyCardReferenceMap
  cardCollection: CardCollection
  cardSearchQuery: string
  cardSearchResults: DeckCard[]
  catalog: Catalog | null
  collectionCardReferences: ReadonlyCardReferenceMap
  collectionSearchIndex: CardSearchEntry[]
  deck: Deck | null
  deckName: string
  deckPersistenceMode: 'browser' | 'database'
  deckPersistenceState: 'loading' | 'saving' | 'saved' | 'error'
  desktopSettingsAvailable: boolean
  drawDeckAspectSort: string | null
  drawDeckCostSort: SortDirection
  drawDeckSetSort: SortDirection
  savedDecks: DeckRecord[]
  selectedDeckHistory: DeckHistory | null
  selectedDeckId: string | null
  showDeckCardOwnership: boolean
  setCardSearchQuery: Dispatch<SetStateAction<string>>
  setDrawDeckAspectSort: Dispatch<SetStateAction<string | null>>
  setDrawDeckCostSort: Dispatch<SetStateAction<SortDirection>>
  setDrawDeckSetSort: Dispatch<SetStateAction<SortDirection>>
  setShowDeckCardOwnership: Dispatch<SetStateAction<boolean>>
  handleAddCard(zone: 'drawDeck' | 'sideboard', card: DeckCard): void
  handleAddSecondLeader(card: DeckCard): void
  handleAddToCollection(card: DeckCard): void
  handleDeckHistoryNavigate(position: number): void
  handleDeleteDeck(id: string): void
  handleHideAgentCardPreview(): void
  handleRemoveCard(zone: 'drawDeck' | 'sideboard', card: DeckCard): void
  handleRemoveSecondLeader(): void
  handleRenameDeck(id: string, name: string): void
  handleSelectDeck(id: string): void
  handleSetCollectionCount(cardId: string, count: number): void
  handleShowAgentCardPreview(card: DeckCard, event: PreviewEvent): void
  handleShowDeckHistoryDetails(entry: DeckHistoryEntry, index: number): void
  handleUseBase(card: DeckCard): void
  handleUseLeader(card: DeckCard): void
}) {
  const drawDeckAspects = getUniqueDeckAspects(deck?.drawDeck ?? [])
  const activeDrawDeckAspectSort = drawDeckAspectSort &&
    drawDeckAspects.includes(drawDeckAspectSort)
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
    ? deck.drawDeck.filter((card) => getCardAspectPenalty(card, deck) > 0).length
    : 0
  const sideboardOffAspectCount = deck
    ? (deck.sideboard ?? []).filter(
        (card) => getCardAspectPenalty(card, deck) > 0,
      ).length
    : 0

  return (
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
                onRemove={() => handleRemoveCard('drawDeck', group.cards[0]!)}
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
                  onRemove={() => handleRemoveCard('sideboard', group.cards[0]!)}
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

  )
}
