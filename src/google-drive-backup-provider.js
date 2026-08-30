import {
  createGoogleDriveApi,
  GOOGLE_DRIVE_SCOPE,
  googleDriveError,
} from '../shared/google-drive-api.mjs'

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client'

let identityScriptPromise = null

export function loadGoogleIdentity(documentRef = document, windowRef = window) {
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
      scope: GOOGLE_DRIVE_SCOPE,
      callback(response) {
        const handlers = tokenRequestHandlers
        tokenRequest = null
        tokenRequestHandlers = null
        if (response?.error) {
          handlers?.reject(
            googleDriveError(
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
          googleDriveError(error?.message || 'Google authentication was interrupted.'),
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

  const driveApi = createGoogleDriveApi({
    fetchImpl,
    async getAccessToken({ forceRefresh }) {
      if (forceRefresh) {
        accessToken = ''
        accessTokenExpiresAt = 0
      }
      return requestToken()
    },
  })

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

    load: driveApi.load,
    save: driveApi.save,
  }
}
