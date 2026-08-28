import { useEffect, useMemo, useState } from 'react'

import {
  loadDesktopSettings,
  saveDesktopSettings,
} from './desktop-settings.js'

const EMPTY_SETTINGS = {
  provider: 'auto',
  executablePath: '',
  model: '',
  reasoningEffort: '',
  webSearchEnabled: false,
}

const PROVIDER_LABELS = {
  'codex-cli': 'Codex CLI',
  'claude-cli': 'Claude CLI',
}

function reasoningOptions(provider) {
  const options = ['', 'low', 'medium', 'high', 'xhigh']
  if (provider === 'codex-cli') {
    options.splice(1, 0, 'minimal')
  }
  if (provider === 'claude-cli') {
    options.push('max')
  }
  return options
}

function connectionDescription(effective) {
  if (!effective?.enabled) {
    return 'AI Deck Assistant is disabled.'
  }
  if (effective.available) {
    return `${PROVIDER_LABELS[effective.provider] ?? 'Local CLI'} is ready.`
  }
  return effective?.unavailableReason || 'No supported local CLI was detected.'
}

export function DesktopSettingsDialog({ onClose }) {
  const [settings, setSettings] = useState(EMPTY_SETTINGS)
  const [effective, setEffective] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const availableReasoningOptions = useMemo(
    () => reasoningOptions(settings.provider),
    [settings.provider],
  )
  const isDisabled = settings.provider === 'disabled'

  useEffect(() => {
    const controller = new AbortController()
    loadDesktopSettings({ signal: controller.signal })
      .then((payload) => {
        setSettings(payload.settings ?? EMPTY_SETTINGS)
        setEffective(payload.effective ?? null)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message)
          setStatus('error')
        }
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && status !== 'saving') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, status])

  function updateSetting(name, value) {
    setSettings((current) => ({ ...current, [name]: value }))
  }

  function handleProviderChange(event) {
    const provider = event.target.value
    const options = reasoningOptions(provider)
    setSettings((current) => ({
      ...current,
      provider,
      reasoningEffort: options.includes(current.reasoningEffort)
        ? current.reasoningEffort
        : '',
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('saving')
    setError('')
    try {
      await saveDesktopSettings(settings)
      setStatus('restarting')
    } catch (saveError) {
      setError(saveError.message)
      setStatus('error')
    }
  }

  const isBusy = status === 'loading' || status === 'saving' ||
    status === 'restarting'

  return (
    <div
      className="agent-dialog-backdrop desktop-settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) {
          onClose()
        }
      }}
    >
      <section
        className="agent-dialog desktop-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-settings-title"
      >
        <p className="eyebrow">Desktop application</p>
        <h2 id="desktop-settings-title">AI provider settings</h2>
        <p className="agent-dialog__description">
          Connect the Deck Assistant to a Codex or Claude CLI authenticated as
          your current operating-system user.
        </p>

        {effective && (
          <div
            className={`desktop-settings__connection${
              effective.available ? ' is-ready' : ''
            }`}
            role="status"
          >
            <span aria-hidden="true" />
            <div>
              <strong>Current connection</strong>
              <p>{connectionDescription(effective)}</p>
              {effective.executablePath && (
                <code>{effective.executablePath}</code>
              )}
            </div>
          </div>
        )}

        {status === 'loading' ? (
          <p className="desktop-settings__loading" role="status">
            Loading desktop settings…
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="desktop-settings__fields">
              <label htmlFor="desktop-provider">
                Provider
                <select
                  id="desktop-provider"
                  value={settings.provider}
                  disabled={isBusy}
                  onChange={handleProviderChange}
                >
                  <option value="auto">Auto-detect Codex, then Claude</option>
                  <option value="codex-cli">Codex CLI</option>
                  <option value="claude-cli">Claude CLI</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <label htmlFor="desktop-executable-path">
                Executable override
                <input
                  id="desktop-executable-path"
                  type="text"
                  maxLength="1000"
                  placeholder={
                    settings.provider === 'claude-cli'
                      ? 'C:\\path\\to\\claude.cmd'
                      : 'C:\\path\\to\\codex.cmd'
                  }
                  value={settings.executablePath}
                  disabled={isBusy || isDisabled || settings.provider === 'auto'}
                  onChange={(event) =>
                    updateSetting('executablePath', event.target.value)
                  }
                />
                <small>
                  Optional for an explicit provider. Leave empty to search PATH.
                </small>
              </label>

              <div className="desktop-settings__row">
                <label htmlFor="desktop-model">
                  Model
                  <input
                    id="desktop-model"
                    type="text"
                    maxLength="160"
                    placeholder="CLI default"
                    value={settings.model}
                    disabled={isBusy || isDisabled}
                    onChange={(event) => updateSetting('model', event.target.value)}
                  />
                </label>

                <label htmlFor="desktop-reasoning-effort">
                  Reasoning effort
                  <select
                    id="desktop-reasoning-effort"
                    value={settings.reasoningEffort}
                    disabled={isBusy || isDisabled}
                    onChange={(event) =>
                      updateSetting('reasoningEffort', event.target.value)
                    }
                  >
                    {availableReasoningOptions.map((effort) => (
                      <option value={effort} key={effort || 'default'}>
                        {effort || 'CLI default'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="desktop-settings__checkbox">
                <input
                  type="checkbox"
                  checked={settings.webSearchEnabled}
                  disabled={isBusy || isDisabled}
                  onChange={(event) =>
                    updateSetting('webSearchEnabled', event.target.checked)
                  }
                />
                <span>
                  <strong>Allow CLI web search</strong>
                  <small>
                    Lets the selected CLI consult current policy and metagame
                    information when a request benefits from it.
                  </small>
                </span>
              </label>
            </div>

            {error && (
              <p className="agent-dialog__error" role="alert">{error}</p>
            )}
            {status === 'restarting' && (
              <p className="desktop-settings__restart" role="status">
                Settings saved. Restarting the desktop app…
              </p>
            )}

            <div className="agent-dialog__actions">
              <button
                className="copy-button"
                type="button"
                disabled={isBusy}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="generate-button"
                type="submit"
                disabled={isBusy}
              >
                {status === 'saving' || status === 'restarting'
                  ? 'Restarting…'
                  : 'Save and restart'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
