import { useState } from 'react'
import { loadPackedCatalog, loadSorCatalog } from './catalog.js'

function App() {
  const [catalog, setCatalog] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [activeLoader, setActiveLoader] = useState(null)

  async function handleLoadCatalog(loaderName) {
    setStatus('loading')
    setError('')
    setActiveLoader(loaderName)

    try {
      const nextCatalog = await (loaderName === 'packed'
        ? loadPackedCatalog()
        : loadSorCatalog())
      setCatalog(nextCatalog)
      setStatus('success')
    } catch (loadError) {
      setCatalog(null)
      setStatus('error')
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'The catalog could not be loaded.',
      )
    } finally {
      setActiveLoader(null)
    }
  }

  return (
    <main className="app">
      <section className="panel">
        <p className="eyebrow">Star Wars: Unlimited</p>
        <h1>Deck Builder</h1>
        <p className="intro">
          Load the Spark of Rebellion catalog from SWU-DB into this browser
          session.
        </p>

        <div className="actions">
          <button
            type="button"
            onClick={() => handleLoadCatalog('packed')}
            disabled={status === 'loading'}
          >
            {activeLoader === 'packed'
              ? 'Unpacking catalog…'
              : 'Load packed catalog'}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => handleLoadCatalog('remote')}
            disabled={status === 'loading'}
          >
            {activeLoader === 'remote' ? 'Loading SOR…' : 'Load remote SOR'}
          </button>
        </div>

        <div className="status" aria-live="polite">
          {status === 'idle' && (
            <p>No card data is loaded. Data remains in memory only.</p>
          )}

          {status === 'loading' && <p>Downloading and normalizing cards…</p>}

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
