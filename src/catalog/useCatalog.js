import { useEffect, useState } from 'react'

import { loadPackedCatalog, selectRandomCardFaces } from '../catalog.js'

export function useCatalog() {
  const [state, setState] = useState({
    catalog: null,
    cardFaces: [],
    error: '',
    status: 'loading',
  })

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    async function loadCatalog() {
      try {
        const catalog = await loadPackedCatalog({ signal: controller.signal })
        if (!isCurrent) return
        setState({
          catalog,
          cardFaces: selectRandomCardFaces(catalog),
          error: '',
          status: 'success',
        })
      } catch (error) {
        if (!isCurrent) return
        setState({
          catalog: null,
          cardFaces: [],
          error: error instanceof Error
            ? error.message
            : 'The catalog could not be loaded.',
          status: 'error',
        })
      }
    }

    void loadCatalog()
    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [])

  return state
}
