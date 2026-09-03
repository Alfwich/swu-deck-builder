import { createGoogleDriveApi, GOOGLE_DRIVE_SCOPE } from '../../../shared/google-drive-api.js'
import { loadGoogleIdentity } from './google-drive-backup-provider.js'

interface CodedError extends Error {
  code: string
}

interface GoogleCodeResponse {
  code?: string
  error?: string
  error_description?: string
}

interface GoogleCodeClient {
  requestCode(): void
}

interface GoogleOAuthError {
  message?: string
}

interface GoogleIdentity {
  accounts?: {
    oauth2?: {
      initCodeClient(options: {
        client_id: string
        include_granted_scopes: boolean
        scope: string
        ux_mode: 'popup'
        callback(response: GoogleCodeResponse): void
        error_callback(error: GoogleOAuthError): void
      }): GoogleCodeClient
    }
  }
}

interface GoogleWindow extends Window {
  google?: GoogleIdentity
}

interface AccessTokenPayload {
  accessToken: string
  expiresIn?: number | string
}

interface CodeRequestHandlers {
  resolve(token: string): void
  reject(error: unknown): void
}

interface GoogleDriveCodeBackupProviderOptions {
  clientId?: string
  documentRef?: Document
  fetchImpl?: typeof fetch
  identityLoader?: (documentRef: Document, windowRef: Window) => Promise<unknown>
  windowRef?: GoogleWindow
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}))
  const error = new Error(payload?.error || fallback) as CodedError
  error.code = payload?.code || ''
  return error
}

export function createGoogleDriveCodeBackupProvider({
  clientId,
  documentRef = document,
  fetchImpl = fetch,
  identityLoader = loadGoogleIdentity,
  windowRef = window,
}: GoogleDriveCodeBackupProviderOptions = {}) {
  let accessToken = ''
  let accessTokenExpiresAt = 0
  let codeClient: GoogleCodeClient | null = null
  let codeRequest: Promise<string> | null = null
  let codeRequestHandlers: CodeRequestHandlers | null = null

  function acceptAccessToken(payload: AccessTokenPayload) {
    accessToken = payload.accessToken
    accessTokenExpiresAt =
      Date.now() + Math.max(0, Number(payload.expiresIn ?? 3600) - 60) * 1000
    return accessToken
  }

  async function brokerRequest(
    url: string,
    options: RequestInit,
    fallback: string,
  ) {
    const response = await fetchImpl(url, options)
    if (!response.ok) throw await responseError(response, fallback)
    return acceptAccessToken(await response.json() as AccessTokenPayload)
  }

  async function refreshAccessToken() {
    return brokerRequest(
      '/api/google-drive/auth/token',
      { method: 'POST' },
      'Google Drive could not be reconnected.',
    )
  }

  async function initializeCodeClient() {
    if (codeClient) return codeClient
    if (!clientId) {
      throw new Error('Google Drive backup is not configured for this site.')
    }
    const google = await identityLoader(documentRef, windowRef) as GoogleIdentity
    const oauth2 = google?.accounts?.oauth2
    if (!oauth2) {
      throw new Error('Google authentication is unavailable.')
    }
    // Code clients handle consent themselves and do not support the token
    // client's `prompt` option.
    codeClient = oauth2.initCodeClient({
      client_id: clientId,
      include_granted_scopes: true,
      scope: GOOGLE_DRIVE_SCOPE,
      ux_mode: 'popup',
      callback(response: GoogleCodeResponse) {
        const handlers = codeRequestHandlers
        if (response?.error || !response?.code) {
          handlers?.reject(
            new Error(response?.error_description || 'Google Drive access was denied.'),
          )
          return
        }
        brokerRequest(
          '/api/google-drive/auth/code',
          {
            body: JSON.stringify({
              code: response.code,
              redirectUri: windowRef.location.origin,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
          'Google Drive authorization could not be completed.',
        ).then(handlers?.resolve, handlers?.reject)
      },
      error_callback(error: GoogleOAuthError) {
        const handlers = codeRequestHandlers
        handlers?.reject(
          new Error(error?.message || 'Google authentication was interrupted.'),
        )
      },
    })
    return codeClient
  }

  async function requestAuthorizationCode() {
    if (codeRequest) return codeRequest
    const client = await initializeCodeClient()
    codeRequest = new Promise<string>((resolve, reject) => {
      codeRequestHandlers = { reject, resolve }
      client!.requestCode()
    })
    try {
      return await codeRequest
    } finally {
      codeRequest = null
      codeRequestHandlers = null
    }
  }

  const driveApi = createGoogleDriveApi({
    fetchImpl,
    async getAccessToken({ forceRefresh }: { forceRefresh: boolean }) {
      if (!forceRefresh && accessToken && Date.now() < accessTokenExpiresAt) {
        return accessToken
      }
      accessToken = ''
      accessTokenExpiresAt = 0
      return refreshAccessToken()
    },
  })

  return {
    id: 'google-drive',
    supportsAutomaticReconnect: true,

    async connect({ interactive = true }: { interactive?: boolean } = {}) {
      if (accessToken && Date.now() < accessTokenExpiresAt) return
      if (interactive) {
        await requestAuthorizationCode()
        return
      }
      await refreshAccessToken()
    },

    async disconnect() {
      try {
        const response = await fetchImpl('/api/google-drive/auth', {
          method: 'DELETE',
        })
        if (!response.ok) {
          throw await responseError(
            response,
            'Google Drive could not be disconnected.',
          )
        }
      } finally {
        accessToken = ''
        accessTokenExpiresAt = 0
      }
    },

    isConnected() {
      return Boolean(accessToken)
    },

    load: driveApi.load,
    save: driveApi.save,
  }
}
