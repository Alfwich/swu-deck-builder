export type DesktopAgentProvider =
  | 'auto'
  | 'codex-cli'
  | 'claude-cli'
  | 'disabled'

export interface DesktopSettings {
  provider: DesktopAgentProvider
  executablePath: string
  model: string
  reasoningEffort: string
  webSearchEnabled: boolean
}

export interface EffectiveDesktopSettings {
  enabled: boolean
  available: boolean
  provider?: 'codex-cli' | 'claude-cli'
  executablePath?: string
  unavailableReason?: string
}

interface DesktopSettingsPayload {
  error?: string
  settings?: DesktopSettings
  effective?: EffectiveDesktopSettings
  [key: string]: unknown
}

async function readPayload(response: Response): Promise<DesktopSettingsPayload> {
  return response.json().catch(() => ({})) as Promise<DesktopSettingsPayload>
}

export async function loadDesktopSettings(
  { signal }: { signal?: AbortSignal } = {},
) {
  const response = await fetch('/api/desktop/settings', { signal })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw new Error(payload.error ?? 'Desktop settings could not be loaded.')
  }
  return payload
}

export async function saveDesktopSettings(settings: DesktopSettings) {
  const response = await fetch('/api/desktop/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw new Error(payload.error ?? 'Desktop settings could not be saved.')
  }
  return payload
}
