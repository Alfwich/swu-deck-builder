import { useEffect, useState } from 'react'
import {
  loadPackedCatalog,
  selectRandomCardFaces,
} from './catalog.js'

function App() {
  const [catalog, setCatalog] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [cardFaces, setCardFaces] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    async function loadCatalog() {
      try {
        const nextCatalog = await loadPackedCatalog({
          signal: controller.signal,
        })

        if (!isCurrent) {
          return
        }

        setCatalog(nextCatalog)
        setCardFaces(selectRandomCardFaces(nextCatalog))
        setStatus('success')
      } catch (loadError) {
        if (!isCurrent) {
          return
        }

        setCatalog(null)
        setCardFaces([])
        setStatus('error')
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'The catalog could not be loaded.',
        )
      }
    }

    loadCatalog()

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [])

  return (
    <main className="app">
      {cardFaces.length > 0 && (
        <div className="card-cascade" aria-hidden="true">
          <div className="card-cascade__grid">
            {[...cardFaces, ...cardFaces].map((face, index) => (
              <div
                className="card-cascade__tile"
                key={`${face.url}-${index}`}
              >
                <img
                  src={face.url}
                  alt=""
                  draggable="false"
                  decoding="async"
                  onLoad={(event) =>
                    event.currentTarget.classList.add('is-loaded')
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="panel">
        <p className="eyebrow">Star Wars: Unlimited</p>
        <h1>Deck Builder</h1>
        <p className="intro">
          Your local Star Wars: Unlimited card archive, ready for deck building.
        </p>

        <div className="status" aria-live="polite">
          {status === 'loading' && <p>Unpacking your local card archive…</p>}

          {status === 'error' && <p className="error">{error}</p>}

          {status === 'success' && catalog && (
            <div className="success">
              <strong>
                {catalog.printingCount.toLocaleString()} printings loaded
              </strong>
              <span>
                {catalog.setCount.toLocaleString()} set
                {catalog.setCount === 1 ? '' : 's'} ·{' '}
                {catalog.loadedAt.toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
