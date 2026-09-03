import { useEffect, useRef, useState } from 'react'

import { persistentDeckHistoryFutureCount } from './deck-history.js'
import type { DeckRecord } from '../types/deck.js'

export interface PendingHistoryDiscard {
  count: number
  deckName: string
}

export function useHistoryDiscard() {
  const [pending, setPending] = useState<PendingHistoryDiscard | null>(null)
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)

  useEffect(() => () => {
    resolverRef.current?.(false)
    resolverRef.current = null
  }, [])

  function resolve(confirmed: boolean) {
    const resolver = resolverRef.current
    resolverRef.current = null
    setPending(null)
    resolver?.(confirmed)
  }

  function confirm(targetRecord: DeckRecord | null | undefined): Promise<boolean> {
    const count = persistentDeckHistoryFutureCount(targetRecord?.history)
    if (count === 0) return Promise.resolve(true)
    if (resolverRef.current) return Promise.resolve(false)

    setPending({ count, deckName: targetRecord?.name ?? 'this deck' })
    return new Promise((nextResolver) => {
      resolverRef.current = nextResolver
    })
  }

  return { confirm, pending, resolve }
}
