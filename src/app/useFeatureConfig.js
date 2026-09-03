import { useEffect, useState } from 'react'

import { resolveGoogleDriveClientId } from '../google-drive-feature.js'

const UNAVAILABLE_AGENT_FEATURE = Object.freeze({
  accessLeaseTtlMs: null,
  authorized: false,
  enabled: false,
  available: false,
  authenticationAvailable: false,
  leaseExpiresAt: null,
})

function initialFeatureConfig(buildGoogleDriveClientId) {
  return {
    agenticFeature: UNAVAILABLE_AGENT_FEATURE,
    agentImageAttachmentsAvailable: false,
    deckPersistenceMode: 'browser',
    desktopGoogleDriveAvailable: false,
    desktopSettingsAvailable: false,
    googleDriveClientId: resolveGoogleDriveClientId(
      null,
      buildGoogleDriveClientId,
    ),
    googleDriveWebAuthorization: 'token',
    resolved: false,
  }
}

export function useFeatureConfig(buildGoogleDriveClientId) {
  const [config, setConfig] = useState(() =>
    initialFeatureConfig(buildGoogleDriveClientId),
  )

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/features', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Feature configuration is unavailable.')
        }
        return response.json()
      })
      .then((features) => {
        setConfig({
          agenticFeature:
            features?.agenticDeckGeneration ?? UNAVAILABLE_AGENT_FEATURE,
          agentImageAttachmentsAvailable:
            features?.agenticDeckGeneration?.imageAttachmentsAvailable === true ||
            features?.desktop?.imageAttachmentsAvailable === true,
          deckPersistenceMode:
            features?.deckPersistence?.mode === 'database'
              ? 'database'
              : 'browser',
          desktopGoogleDriveAvailable:
            features?.desktop?.googleDriveAvailable === true,
          desktopSettingsAvailable:
            features?.desktop?.settingsAvailable === true,
          googleDriveClientId: resolveGoogleDriveClientId(
            features?.googleDrive,
            buildGoogleDriveClientId,
          ),
          googleDriveWebAuthorization:
            features?.googleDrive?.webAuthorization === 'broker'
              ? 'broker'
              : 'token',
          resolved: true,
        })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setConfig({
            ...initialFeatureConfig(buildGoogleDriveClientId),
            resolved: true,
          })
        }
      })

    return () => controller.abort()
  }, [buildGoogleDriveClientId])

  useEffect(() => {
    const expiresAt = Date.parse(config.agenticFeature.leaseExpiresAt)
    if (!Number.isFinite(expiresAt)) return undefined

    const timeoutId = window.setTimeout(() => {
      setConfig((current) => ({
        ...current,
        agenticFeature: {
          ...current.agenticFeature,
          authorized: false,
          enabled: false,
          available: false,
          authenticationAvailable: true,
          leaseExpiresAt: null,
        },
        agentImageAttachmentsAvailable: false,
      }))
    }, Math.max(0, expiresAt - Date.now()))

    return () => window.clearTimeout(timeoutId)
  }, [config.agenticFeature.leaseExpiresAt])

  return config
}
