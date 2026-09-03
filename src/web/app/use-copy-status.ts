import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

import {
  clearStaleTcgplayerCopyStatus,
  getCopyStatusDismissDelay,
  type CopyStatus,
} from './copy-status.js'
import type { CardCollection } from '../types/collection.js'
import type { DeckRecord } from '../types/deck.js'

export function useCopyStatus({
  cardCollection,
  savedDecks,
  selectedDeckId,
  tcgplayerAllDecks,
  tcgplayerMissingOnly,
}: {
  cardCollection: CardCollection
  savedDecks: DeckRecord[]
  selectedDeckId: string | null
  tcgplayerAllDecks: boolean
  tcgplayerMissingOnly: boolean
}): [CopyStatus | null, Dispatch<SetStateAction<CopyStatus | null>>] {
  const [status, setStatus] = useState<CopyStatus | null>(null)

  useEffect(() => {
    const dismissDelay = getCopyStatusDismissDelay(status)
    if (dismissDelay === null) return undefined
    const timeoutId = window.setTimeout(() => setStatus(null), dismissDelay)
    return () => window.clearTimeout(timeoutId)
  }, [status])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setStatus(clearStaleTcgplayerCopyStatus)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [
    cardCollection,
    savedDecks,
    selectedDeckId,
    tcgplayerAllDecks,
    tcgplayerMissingOnly,
  ])

  return [status, setStatus]
}
