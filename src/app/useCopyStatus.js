import { useEffect, useState } from 'react'

import {
  clearStaleTcgplayerCopyStatus,
  getCopyStatusDismissDelay,
} from '../copy-status.js'

export function useCopyStatus({
  cardCollection,
  savedDecks,
  selectedDeckId,
  tcgplayerAllDecks,
  tcgplayerMissingOnly,
}) {
  const [status, setStatus] = useState(null)

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
