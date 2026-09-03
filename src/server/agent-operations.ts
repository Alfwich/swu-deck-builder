import { applyCollectionOperations } from './card-collection.js'
import { applyDeckOperations } from './deck-operations.js'

export function applyAgentOperations(currentDeck, collection, operations, catalog) {
  const deckOperations = []
  const deckIndexes = []
  const collectionOperations = []
  const collectionIndexes = []

  operations.forEach((operation, index) => {
    if (operation?.zone === 'collection') {
      collectionOperations.push(operation)
      collectionIndexes.push(index)
    } else {
      deckOperations.push(operation)
      deckIndexes.push(index)
    }
  })

  const deckResult = applyDeckOperations(
    currentDeck,
    deckOperations,
    catalog,
    deckIndexes,
  )
  const collectionResult = applyCollectionOperations(
    collection,
    collectionOperations,
    catalog,
    collectionIndexes,
  )
  const changesById = new Map(
    [...deckResult.changes, ...collectionResult.changes].map((change) => [
      change.id,
      change,
    ]),
  )

  return {
    deck: deckResult.deck,
    collection: collectionResult.collection,
    changes: operations.map((_operation, index) =>
      changesById.get(`change-${index + 1}`),
    ),
  }
}
