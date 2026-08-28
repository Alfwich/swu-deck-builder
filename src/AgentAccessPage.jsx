import { useEffect, useState } from 'react'

const EMPTY_FEATURE = {
  authorized: false,
  enabled: false,
  available: false,
  authenticationAvailable: false,
  leaseExpiresAt: null,
}

async function readAgentFeature(signal) {
  const response = await fetch('/api/features', { signal })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error('AI access status is unavailable.')
  }
  return payload.agenticDeckGeneration ?? EMPTY_FEATURE
}

async function requestAgentAccess(password) {
  const response = await fetch('/api/agent/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error ?? 'AI access could not be enabled.')
  }
  return payload.agenticDeckGeneration
}

function accessExpiration(expiresAt) {
  const expiration = Date.parse(expiresAt)
  return Number.isFinite(expiration)
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'long',
      }).format(expiration)
    : ''
}

function EnabledAccess({ feature }) {
  const expiration = accessExpiration(feature.leaseExpiresAt)

  return (
    <section className="agent-access-page__card" aria-live="polite">
      <span className="agent-access-page__eyebrow">Access granted</span>
      <h1>AI tools are enabled</h1>
      <p>
        {expiration
          ? `This public IP can use the deck assistant until ${expiration}.`
          : 'This IP already has permanent access to the deck assistant.'}
      </p>
      <a className="agent-access-page__primary-link" href="/">
        Open the deck builder →
      </a>
    </section>
  )
}

function AgentAccessPage() {
  const [feature, setFeature] = useState(EMPTY_FEATURE)
  const [resolved, setResolved] = useState(false)
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Enable AI Access · SWU Deck Builder'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    readAgentFeature(controller.signal)
      .then((nextFeature) => {
        setFeature(nextFeature)
        setResolved(true)
      })
      .catch((featureError) => {
        if (featureError.name !== 'AbortError') {
          setError(featureError.message)
          setResolved(true)
        }
      })
    return () => controller.abort()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const nextFeature = await requestAgentAccess(password)
      setFeature(nextFeature)
      setPassword('')
      setStatus('idle')
    } catch (accessError) {
      setError(
        accessError instanceof Error
          ? accessError.message
          : 'AI access could not be enabled.',
      )
      setStatus('error')
    }
  }

  return (
    <main className="agent-access-page">
      <a className="agent-access-page__brand" href="/">
        SWU Deck Builder
      </a>

      {!resolved && (
        <section className="agent-access-page__card" aria-live="polite">
          <span className="agent-access-page__eyebrow">AI access</span>
          <h1>Checking access…</h1>
          <p>Confirming whether this public IP can use the deck assistant.</p>
        </section>
      )}

      {resolved && feature.authorized && <EnabledAccess feature={feature} />}

      {resolved && !feature.authorized && feature.authenticationAvailable && (
        <section className="agent-access-page__card">
          <span className="agent-access-page__eyebrow">AI access</span>
          <h1>Enable the deck assistant</h1>
          <p>
            Enter the shared access password to enable AI tools for this public
            IP for 10 minutes.
          </p>
          <form className="agent-access-page__form" onSubmit={handleSubmit}>
            <label htmlFor="agent-access-password">Access password</label>
            <input
              id="agent-access-password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={512}
              required
              autoFocus
              disabled={status === 'loading'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && <p className="agent-access-page__error" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={status === 'loading' || !password}
            >
              {status === 'loading' ? 'Checking…' : 'Enable for 10 minutes'}
            </button>
          </form>
        </section>
      )}

      {resolved && !feature.authorized && !feature.authenticationAvailable && (
        <section className="agent-access-page__card" aria-live="polite">
          <span className="agent-access-page__eyebrow">AI access</span>
          <h1>Temporary access is unavailable</h1>
          <p>{error || 'The AI access gate is not enabled on this server.'}</p>
          <a className="agent-access-page__secondary-link" href="/">
            Return to the deck builder
          </a>
        </section>
      )}
    </main>
  )
}

export default AgentAccessPage
