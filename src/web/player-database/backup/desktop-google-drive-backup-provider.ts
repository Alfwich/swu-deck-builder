interface CodedError extends Error {
  code: string
}

interface DesktopGoogleDriveBackupProviderOptions {
  fetchImpl?: typeof fetch
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}))
  const error = new Error(payload?.error || fallback) as CodedError
  error.code = payload?.code || ''
  return error
}

export function createDesktopGoogleDriveBackupProvider(
  { fetchImpl = fetch }: DesktopGoogleDriveBackupProviderOptions = {},
) {
  let connected = false

  async function request(
    url: string,
    options: RequestInit | undefined,
    fallback: string,
  ) {
    const response = await fetchImpl(url, options)
    if (!response.ok) throw await responseError(response, fallback)
    return response
  }

  return {
    id: 'google-drive',
    supportsAutomaticReconnect: true,
    supportsStartupReconnect: true,

    async connect({ interactive = true } = {}) {
      await request(
        `/api/desktop/google-drive/connection?interactive=${interactive}`,
        { method: 'POST' },
        'Google Drive could not be connected.',
      )
      connected = true
    },

    async disconnect() {
      await request(
        '/api/desktop/google-drive/connection',
        { method: 'DELETE' },
        'Google Drive could not be disconnected.',
      )
      connected = false
    },

    isConnected() {
      return connected
    },

    async loadMetadata() {
      const response = await request(
        '/api/desktop/google-drive/metadata',
        undefined,
        'Google Drive sync metadata could not be read.',
      )
      return response.json()
    },

    async persistMetadata(metadata: unknown) {
      await request(
        '/api/desktop/google-drive/metadata',
        {
          body: JSON.stringify(metadata),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
        'Google Drive sync metadata could not be saved.',
      )
    },

    async load() {
      const response = await request(
        '/api/desktop/google-drive/backup',
        undefined,
        'The Google Drive backup could not be read.',
      )
      return response.json()
    },

    async save(source: string, {
      expectedSnapshotId = '',
      expectedVersion = '',
      force = false,
    }: {
      expectedSnapshotId?: string
      expectedVersion?: string
      force?: boolean
    } = {}) {
      const parameters = new URLSearchParams({
        expectedSnapshotId,
        expectedVersion,
      })
      if (force) parameters.set('force', 'true')
      const response = await request(
        `/api/desktop/google-drive/backup?${parameters}`,
        {
          body: source,
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
        'The Google Drive backup could not be saved.',
      )
      return response.json()
    },
  }
}
