async function responseError(response, fallback) {
  const payload = await response.json().catch(() => ({}))
  const error = new Error(payload?.error || fallback)
  error.code = payload?.code || ''
  return error
}

export function createDesktopGoogleDriveBackupProvider({ fetchImpl = fetch } = {}) {
  let connected = false

  async function request(url, options, fallback) {
    const response = await fetchImpl(url, options)
    if (!response.ok) throw await responseError(response, fallback)
    return response
  }

  return {
    id: 'google-drive',
    supportsAutomaticReconnect: true,

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

    async load() {
      const response = await request(
        '/api/desktop/google-drive/backup',
        undefined,
        'The Google Drive backup could not be read.',
      )
      return response.json()
    },

    async save(source, { expectedVersion = '', force = false } = {}) {
      const parameters = new URLSearchParams({ expectedVersion })
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
