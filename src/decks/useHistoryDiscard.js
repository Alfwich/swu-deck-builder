import { useEffect, useRef, useState } from 'react'

import { persistentDeckHistoryFutureCount } from '../deck-history.js'

export function useHistoryDiscard() {
  const [pending, setPending] = useState(null)
  const resolverRef = useRef(null)

  useEffect(() => () => {
    resolverRef.current?.(false)
    resolverRef.current = null
  }, [])

  function resolve(confirmed) {
    const resolver = resolverRef.current
    resolverRef.current = null
    setPending(null)
    resolver?.(confirmed)
  }

  function confirm(targetRecord) {
    const count = persistentDeckHistoryFutureCount(targetRecord?.history)
    if (count === 0) return Promise.resolve(true)
    if (resolverRef.current) return Promise.resolve(false)

    setPending({ count, deckName: targetRecord.name })
    return new Promise((nextResolver) => {
      resolverRef.current = nextResolver
    })
  }

  return { confirm, pending, resolve }
}
