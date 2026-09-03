import { useMemo, useState } from 'react'

import {
  createCatalogCardReferenceIndex,
  createCatalogPrintingIndex,
} from './catalog.js'
import { createCardSearchIndex, fuzzySearchCards } from './card-search.js'
import type { Catalog } from '../types/catalog.js'

export function useCardIndexes(catalog: Catalog | null) {
  const [query, setQuery] = useState('')
  const agentCardReferences = useMemo(
    () => (catalog ? createCatalogCardReferenceIndex(catalog) : new Map()),
    [catalog],
  )
  const collectionCardReferences = useMemo(
    () => (catalog ? createCatalogPrintingIndex(catalog) : new Map()),
    [catalog],
  )
  const deckSearchIndex = useMemo(
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
  const results = useMemo(
    () => fuzzySearchCards(deckSearchIndex, query),
    [deckSearchIndex, query],
  )

  return {
    agentCardReferences,
    collectionCardReferences,
    collectionSearchIndex,
    query,
    results,
    setQuery,
  }
}
