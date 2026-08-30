const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const DRIVE_FILE_NAME = 'swu-deck-builder-player-database.json'
const DRIVE_FIELDS = 'id,name,modifiedTime,version,size'
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client'

let identityScriptPromise = null

function loadGoogleIdentity(documentRef = document, windowRef = window) {
  if (windowRef.google?.accounts?.oauth2) {
    return Promise.resolve(windowRef.google)
  }
  identityScriptPromise ??= new Promise((resolve, reject) => {
    const existing = documentRef.querySelector(
      `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
    )
    const script = existing ?? documentRef.createElement('script')
    script.addEventListener('load', () => resolve(windowRef.google), {
      once: true,
    })
    script.addEventListener(
      'error',
      () => reject(new Error('Google authentication could not be loaded.')),
      { once: true },
    )
    if (!existing) {
      script.async = true
      script.src = GOOGLE_IDENTITY_SCRIPT
      documentRef.head.append(script)
    }
  })
  return identityScriptPromise
}

function driveError(message, code = '') {
  const error = new Error(message)
  error.code = code
  return error
}

async function responseError(response, fallback) {
  const payload = await response.json().catch(() => ({}))
  return driveError(payload?.error?.message || fallback)
}

export function createGoogleDriveBackupProvider({
  clientId,
  documentRef = document,
  fetchImpl = fetch,
  identityLoader = loadGoogleIdentity,
  windowRef = window,
} = {}) {
  let accessToken = ''
  let accessTokenExpiresAt = 0
  let tokenClient = null
  let tokenRequest = null
  let tokenRequestHandlers = null

  async function initializeTokenClient() {
    if (tokenClient) return tokenClient
    if (!clientId) {
      throw new Error('Google Drive backup is not configured for this site.')
    }
    const google = await identityLoader(documentRef, windowRef)
    if (!google?.accounts?.oauth2) {
      throw new Error('Google authentication is unavailable.')
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback(response) {
        const handlers = tokenRequestHandlers
        tokenRequest = null
        tokenRequestHandlers = null
        if (response?.error) {
          handlers?.reject(
            driveError(
              response.error_description || 'Google Drive access was denied.',
            ),
          )
          return
        }
        accessToken = response.access_token
        accessTokenExpiresAt =
          Date.now() + Math.max(0, Number(response.expires_in ?? 3600) - 60) * 1000
        handlers?.resolve(accessToken)
      },
      error_callback(error) {
        const handlers = tokenRequestHandlers
        tokenRequest = null
        tokenRequestHandlers = null
        handlers?.reject(
          driveError(error?.message || 'Google authentication was interrupted.'),
        )
      },
    })
    return tokenClient
  }

  async function requestToken(prompt = '') {
    if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken
    if (tokenRequest) return tokenRequest
    const client = await initializeTokenClient()
    tokenRequest = new Promise((resolve, reject) => {
      tokenRequestHandlers = { reject, resolve }
      client.requestAccessToken({ prompt })
    })
    return tokenRequest
  }

  async function authorizedFetch(url, options = {}, retry = true) {
    const token = await requestToken()
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    })
    if (response.status === 401 && retry) {
      accessToken = ''
      accessTokenExpiresAt = 0
      return authorizedFetch(url, options, false)
    }
    return response
  }

  async function listBackups() {
    const parameters = new URLSearchParams({
      fields: `files(${DRIVE_FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageSize: '10',
      q: `name = '${DRIVE_FILE_NAME}' and trashed = false`,
      spaces: 'appDataFolder',
    })
    const response = await authorizedFetch(
      `https://www.googleapis.com/drive/v3/files?${parameters}`,
    )
    if (!response.ok) {
      throw await responseError(response, 'Google Drive backups could not be listed.')
    }
    const payload = await response.json()
    return payload.files ?? []
  }

  async function readBackup(file) {
    const response = await authorizedFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    )
    if (!response.ok) {
      throw await responseError(response, 'The Google Drive backup could not be read.')
    }
    return {
      fileId: file.id,
      savedAt: file.modifiedTime,
      source: await response.text(),
      version: String(file.version ?? ''),
    }
  }

  async function createBackupFile(source) {
    const boundary = `swu-backup-${globalThis.crypto.randomUUID()}`
    const metadata = JSON.stringify({
      mimeType: 'application/json',
      name: DRIVE_FILE_NAME,
      parents: ['appDataFolder'],
    })
    const body = [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      metadata,
      `\r\n--${boundary}\r\n`,
      'Content-Type: application/json\r\n\r\n',
      source,
      `\r\n--${boundary}--`,
    ].join('')
    const parameters = new URLSearchParams({
      fields: DRIVE_FIELDS,
      uploadType: 'multipart',
    })
    const response = await authorizedFetch(
      `https://www.googleapis.com/upload/drive/v3/files?${parameters}`,
      {
        body,
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        method: 'POST',
      },
    )
    if (!response.ok) {
      throw await responseError(response, 'The Google Drive backup file could not be created.')
    }
    return response.json()
  }

  async function uploadBackup(file, source) {
    const parameters = new URLSearchParams({
      fields: DRIVE_FIELDS,
      uploadType: 'media',
    })
    const response = await authorizedFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?${parameters}`,
      {
        body: source,
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )
    if (!response.ok) {
      throw await responseError(response, 'The Google Drive backup could not be uploaded.')
    }
    return response.json()
  }

  return {
    id: 'google-drive',

    async connect({ previouslyAuthorized = false } = {}) {
      await requestToken(previouslyAuthorized ? '' : 'consent')
    },

    async disconnect() {
      if (accessToken && windowRef.google?.accounts?.oauth2?.revoke) {
        await new Promise((resolve) => {
          windowRef.google.accounts.oauth2.revoke(accessToken, resolve)
        })
      }
      accessToken = ''
      accessTokenExpiresAt = 0
    },

    isConnected() {
      return Boolean(accessToken)
    },

    async load() {
      const [file] = await listBackups()
      return file ? readBackup(file) : null
    },

    async save(source, { expectedVersion = '', force = false } = {}) {
      const [existing] = await listBackups()
      if (
        existing &&
        (!expectedVersion || String(existing.version ?? '') !== expectedVersion) &&
        !force
      ) {
        throw driveError(
          'The Google Drive backup changed on another device.',
          'remote_conflict',
        )
      }
      const saved = existing
        ? await uploadBackup(existing, source)
        : await createBackupFile(source)
      return {
        fileId: saved.id,
        savedAt: saved.modifiedTime,
        source,
        version: String(saved.version ?? ''),
      }
    },
  }
}
