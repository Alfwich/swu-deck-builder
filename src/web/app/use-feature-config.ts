import { useEffect, useState } from 'react'

import { resolveGoogleDriveClientId } from '../player-database/backup/google-drive-feature.js'

export interface AgenticFeatureConfig {
  accessLeaseTtlMs: number | null
  authorized: boolean
  enabled: boolean
  available: boolean
  authenticationAvailable: boolean
  leaseExpiresAt: string | null
}

export interface FeatureConfig {
  agenticFeature: AgenticFeatureConfig
  agentImageAttachmentsAvailable: boolean
  deckPersistenceMode: 'browser' | 'database'
  desktopGoogleDriveAvailable: boolean
  desktopSettingsAvailable: boolean
  googleDriveClientId: string
  googleDriveWebAuthorization: 'token' | 'broker'
  resolved: boolean
}

interface FeatureResponse {
  agenticDeckGeneration?: Partial<AgenticFeatureConfig> & {
    imageAttachmentsAvailable?: boolean
  }
  deckPersistence?: { mode?: string }
  desktop?: {
    googleDriveAvailable?: boolean
    imageAttachmentsAvailable?: boolean
    settingsAvailable?: boolean
  }
  googleDrive?: {
    clientId?: string
    webAuthorization?: string
  }
}

const UNAVAILABLE_AGENT_FEATURE: Readonly<AgenticFeatureConfig> = Object.freeze({
  accessLeaseTtlMs: null,
  authorized: false,
  enabled: false,
  available: false,
  authenticationAvailable: false,
  leaseExpiresAt: null,
})

function initialFeatureConfig(
  buildGoogleDriveClientId: string | undefined,
): FeatureConfig {
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

export function useFeatureConfig(buildGoogleDriveClientId: string | undefined) {
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
      .then((features: FeatureResponse) => {
        setConfig({
          agenticFeature:
            features?.agenticDeckGeneration
              ? { ...UNAVAILABLE_AGENT_FEATURE, ...features.agenticDeckGeneration }
              : UNAVAILABLE_AGENT_FEATURE,
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
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setConfig({
            ...initialFeatureConfig(buildGoogleDriveClientId),
            resolved: true,
          })
        }
      })

    return () => controller.abort()
  }, [buildGoogleDriveClientId])

  useEffect(() => {
    const expiresAt = config.agenticFeature.leaseExpiresAt
      ? Date.parse(config.agenticFeature.leaseExpiresAt)
      : Number.NaN
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
