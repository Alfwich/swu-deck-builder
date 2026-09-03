import DeckAnalysis from '../DeckAnalysis.jsx'
import DeckHistoryBar from '../DeckHistoryBar.jsx'
import {
  getCardListOwnershipSummary,
  getGameplayCardCollectionCount,
} from '../card-collection.js'
import { groupDeckCards } from '../catalog.js'
import { getCardAspectPenalty } from '../deck-aspects.js'
import {
  getUniqueDeckAspects,
  sortDeckCardGroups,
} from '../deck-sorting.js'
import { DeckCardSearch } from './DeckCardSearch.jsx'
import {
  DeckCardStack,
  DeckIdentities,
  RightRail,
} from './DeckCards.jsx'
import {
  DeckLibrary,
  DrawDeckSortControls,
} from './DeckLibrary.jsx'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function drawDeckOwnershipSummaryClassName(summary) {
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
}) {
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

  )
}
