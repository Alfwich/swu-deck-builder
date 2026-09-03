import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'

import {
  createGoogleDriveApi,
  GOOGLE_DRIVE_SCOPE,
  googleDriveError,
} from '../shared/google-drive-api.js'

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000

function tokenError(payload, fallback) {
  return googleDriveError(
    payload?.error_description || payload?.error || fallback,
    payload?.error || '',
  )
}

async function requestToken(fetchImpl, parameters) {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    body: new URLSearchParams(parameters),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) {
    throw tokenError(payload, 'Google authorization could not be completed.')
  }
  return payload
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address()))
  })
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()))
}

export async function authorizeGoogleDriveDesktop({
  clientId,
  createServer = http.createServer,
  openExternal,
  timeoutMs = AUTHORIZATION_TIMEOUT_MS,
}) {
  const codeVerifier = randomBytes(64).toString('base64url')
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  const state = randomBytes(32).toString('base64url')
  let settleAuthorization
  const authorization = new Promise((resolve, reject) => {
    settleAuthorization = { reject, resolve }
  })
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (requestUrl.pathname !== '/oauth2/callback') {
      response.writeHead(404).end('Not found.')
      return
    }
    const returnedState = requestUrl.searchParams.get('state') ?? ''
    const code = requestUrl.searchParams.get('code') ?? ''
    const error = requestUrl.searchParams.get('error') ?? ''
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (returnedState !== state) {
      response.writeHead(400).end(
        '<h1>Google Drive connection failed</h1><p>The authorization response could not be verified. Return to SWU Deck Builder and try again.</p>',
      )
      settleAuthorization.reject(
        googleDriveError('The Google authorization response could not be verified.'),
      )
      return
    }
    if (error || !code) {
      response.writeHead(400).end(
        '<h1>Google Drive was not connected</h1><p>You can close this tab and return to SWU Deck Builder.</p>',
      )
      settleAuthorization.reject(
        googleDriveError('Google Drive access was denied.', error),
      )
      return
    }
    response.writeHead(200).end(
      '<h1>Google Drive connected</h1><p>You can close this tab and return to SWU Deck Builder.</p>',
    )
    settleAuthorization.resolve(code)
  })
  const address = await listen(server)
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`
  const parameters = new URLSearchParams({
    access_type: 'offline',
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    include_granted_scopes: 'true',
    prompt: 'consent',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPE,
    state,
  })
  const timeout = setTimeout(() => {
    settleAuthorization.reject(
      googleDriveError('Google authorization timed out. Please try again.'),
    )
  }, timeoutMs)
  timeout.unref?.()

  try {
    await openExternal(`${AUTHORIZATION_ENDPOINT}?${parameters}`)
    return {
      code: await authorization,
      codeVerifier,
      redirectUri,
    }
  } finally {
    clearTimeout(timeout)
    await close(server)
  }
}

export function createDesktopGoogleDriveBackupService({
  authorize = authorizeGoogleDriveDesktop,
  clientId,
  clientSecret,
  fetchImpl = fetch,
  openExternal,
  tokenStore,
}) {
  let accessToken = ''
  let accessTokenExpiresAt = 0
  let tokenRequest = null

  function rememberToken(payload) {
    accessToken = payload.access_token ?? ''
    accessTokenExpiresAt =
      Date.now() + Math.max(0, Number(payload.expires_in ?? 3600) - 60) * 1000
    if (payload.refresh_token) tokenStore.write(payload.refresh_token)
    return accessToken
  }

  async function refreshAccessToken() {
    const refreshToken = tokenStore.read()
    if (!refreshToken) {
      throw googleDriveError(
        'Reconnect Google Drive to continue desktop backups.',
        'reauthorization_required',
      )
    }
    try {
      return rememberToken(await requestToken(fetchImpl, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }))
    } catch (error) {
      if (error?.code === 'invalid_grant') tokenStore.clear()
      throw error
    }
  }

  async function getAccessToken({ forceRefresh = false } = {}) {
    if (!clientId || !clientSecret || !tokenStore.available()) {
      throw new Error('Google Drive backup is not configured for this desktop app.')
    }
    if (!forceRefresh && accessToken && Date.now() < accessTokenExpiresAt) {
      return accessToken
    }
    if (!tokenRequest) {
      tokenRequest = refreshAccessToken().finally(() => {
        tokenRequest = null
      })
    }
    return tokenRequest
  }

  const driveApi = createGoogleDriveApi({ fetchImpl, getAccessToken })

  return {
    id: 'google-drive',

    available() {
      return Boolean(clientId && clientSecret) && tokenStore.available()
    },

    async connect({ interactive = true } = {}) {
      if (!clientId || !clientSecret || !tokenStore.available()) {
        throw new Error('Google Drive backup is not configured for this desktop app.')
      }
      if (tokenStore.read()) {
        try {
          await getAccessToken()
          return
        } catch (error) {
          if (error?.code !== 'invalid_grant') throw error
        }
      }
      if (!interactive) {
        throw googleDriveError(
          'Reconnect Google Drive to continue desktop backups.',
          'reauthorization_required',
        )
      }
      const authorization = await authorize({ clientId, openExternal })
      const payload = await requestToken(fetchImpl, {
        client_id: clientId,
        client_secret: clientSecret,
        code: authorization.code,
        code_verifier: authorization.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: authorization.redirectUri,
      })
      if (!payload.refresh_token) {
        throw new Error('Google did not return a reusable desktop authorization.')
      }
      rememberToken(payload)
    },

    async disconnect() {
      const token = tokenStore.read() || accessToken
      tokenStore.clear()
      accessToken = ''
      accessTokenExpiresAt = 0
      if (!token) return
      await fetchImpl(REVOCATION_ENDPOINT, {
        body: new URLSearchParams({ token }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }).catch(() => {})
    },

    isConnected() {
      return Boolean(accessToken || tokenStore.read())
    },

    load: driveApi.load,
    save: driveApi.save,
  }
}
