import {
  createGoogleDriveApi,
  GOOGLE_DRIVE_SCOPE,
  googleDriveError,
} from '../../../shared/google-drive-api.js'

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client'

interface GoogleTokenResponse {
  access_token: string
  expires_in?: number | string
  error?: string
  error_description?: string
}

interface GoogleOAuthError {
  message?: string
}

interface GoogleTokenClient {
  requestAccessToken(options: { prompt: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(options: {
    client_id: string
    scope: string
    callback(response: GoogleTokenResponse): void
    error_callback(error: GoogleOAuthError): void
  }): GoogleTokenClient
  revoke?(token: string, callback: (response?: unknown) => void): void
}

interface GoogleIdentity {
  accounts?: { oauth2?: GoogleOAuth2 }
}

interface GoogleWindow extends Window {
  google?: GoogleIdentity
}

interface TokenRequestHandlers {
  resolve(token: string): void
  reject(error: unknown): void
}

interface GoogleDriveBackupProviderOptions {
  clientId?: string
  documentRef?: Document
  fetchImpl?: typeof fetch
  identityLoader?: (documentRef: Document, windowRef: Window) => Promise<unknown>
  windowRef?: GoogleWindow
}

let identityScriptPromise: Promise<GoogleIdentity | undefined> | null = null

export function loadGoogleIdentity(
  documentRef: Document = document,
  windowRef: GoogleWindow = window,
): Promise<unknown> {
  if (windowRef.google?.accounts?.oauth2) {
    return Promise.resolve(windowRef.google)
  }
  identityScriptPromise ??= new Promise((resolve, reject) => {
    const existing = documentRef.querySelector<HTMLScriptElement>(
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
}: GoogleDriveBackupProviderOptions = {}) {
  let accessToken = ''
  let accessTokenExpiresAt = 0
  let tokenClient: GoogleTokenClient | null = null
  let tokenRequest: Promise<string> | null = null
  let tokenRequestHandlers: TokenRequestHandlers | null = null

  async function initializeTokenClient() {
    if (tokenClient) return tokenClient
    if (!clientId) {
      throw new Error('Google Drive backup is not configured for this site.')
    }
    const google = await identityLoader(documentRef, windowRef) as GoogleIdentity
    const oauth2 = google?.accounts?.oauth2
    if (!oauth2) {
      throw new Error('Google authentication is unavailable.')
    }
    tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback(response: GoogleTokenResponse) {
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
      error_callback(error: GoogleOAuthError) {
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

  async function requestToken(prompt = ''): Promise<string> {
    if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken
    if (tokenRequest) return tokenRequest
    const client = await initializeTokenClient()
    tokenRequest = new Promise<string>((resolve, reject) => {
      tokenRequestHandlers = { reject, resolve }
      client!.requestAccessToken({ prompt })
    })
    return tokenRequest
  }

  const driveApi = createGoogleDriveApi({
    fetchImpl,
    async getAccessToken({ forceRefresh }: { forceRefresh: boolean }) {
      if (forceRefresh) {
        accessToken = ''
        accessTokenExpiresAt = 0
      }
      return requestToken()
    },
  })

  return {
    id: 'google-drive',

    async connect({ previouslyAuthorized = false }: { previouslyAuthorized?: boolean } = {}) {
      await requestToken(previouslyAuthorized ? '' : 'consent')
    },

    async disconnect() {
      if (accessToken && windowRef.google?.accounts?.oauth2?.revoke) {
        const revoke = windowRef.google.accounts.oauth2.revoke
        await new Promise((resolve) => {
          revoke(accessToken, resolve)
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
