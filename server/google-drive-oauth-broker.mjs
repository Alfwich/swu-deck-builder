import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const COOKIE_AAD = Buffer.from('swu-deck-builder.google-drive.refresh-token.v1')

export class GoogleDriveOAuthError extends Error {
  constructor(message, { code = '', status = 502 } = {}) {
    super(message)
    this.code = code
    this.status = status
  }
}

function parseCookie(header, name) {
  for (const entry of String(header ?? '').split(';')) {
    const separator = entry.indexOf('=')
    if (separator === -1 || entry.slice(0, separator).trim() !== name) continue
    return decodeURIComponent(entry.slice(separator + 1).trim())
  }
  return ''
}

function oauthError(payload, fallback, status = 502) {
  const googleCode = String(payload?.error ?? '')
  const reauthorizationRequired = googleCode === 'invalid_grant'
  return new GoogleDriveOAuthError(
    reauthorizationRequired
      ? 'Reconnect Google Drive to continue automatic backups.'
      : payload?.error_description || googleCode || fallback,
    {
      code: reauthorizationRequired ? 'reauthorization_required' : googleCode,
      status: reauthorizationRequired ? 401 : status,
    },
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
    throw oauthError(payload, 'Google authorization could not be completed.')
  }
  if (!payload.access_token) {
    throw new GoogleDriveOAuthError(
      'Google did not return a usable access token.',
    )
  }
  return payload
}

export function createGoogleDriveOAuthBroker(
  config,
  { fetchImpl = fetch, randomBytesImpl = randomBytes } = {},
) {
  const cookieName = config.secureCookies
    ? '__Host-swu-drive-auth'
    : 'swu-drive-auth'
  const cookieOptions = {
    httpOnly: true,
    maxAge: config.cookieMaxAgeMs,
    path: '/',
    sameSite: 'strict',
    secure: config.secureCookies,
  }

  function available() {
    return config.available === true
  }

  function requireAvailable() {
    if (!available()) {
      throw new GoogleDriveOAuthError(
        'Persistent Google Drive authorization is unavailable.',
        { code: 'broker_unavailable', status: 404 },
      )
    }
  }

  function validateOrigin(origin) {
    requireAvailable()
    if (!config.authorizedOrigins.includes(origin)) {
      throw new GoogleDriveOAuthError(
        'The Google authorization origin is not allowed.',
        { code: 'origin_not_allowed', status: 403 },
      )
    }
  }

  function encryptRefreshToken(refreshToken) {
    const iv = randomBytesImpl(12)
    const cipher = createCipheriv('aes-256-gcm', config.encryptionKey, iv)
    cipher.setAAD(COOKIE_AAD)
    const encrypted = Buffer.concat([
      cipher.update(String(refreshToken), 'utf8'),
      cipher.final(),
    ])
    return [
      'v1',
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.')
  }

  function decryptRefreshToken(value) {
    try {
      const [version, ivSource, encryptedSource, tagSource, extra] =
        String(value ?? '').split('.')
      if (version !== 'v1' || !ivSource || !encryptedSource || !tagSource || extra) {
        throw new Error('Invalid token envelope.')
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        config.encryptionKey,
        Buffer.from(ivSource, 'base64url'),
      )
      decipher.setAAD(COOKIE_AAD)
      decipher.setAuthTag(Buffer.from(tagSource, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedSource, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      throw new GoogleDriveOAuthError(
        'Reconnect Google Drive to continue automatic backups.',
        { code: 'reauthorization_required', status: 401 },
      )
    }
  }

  function readRefreshToken(cookieHeader) {
    requireAvailable()
    const encrypted = parseCookie(cookieHeader, cookieName)
    if (!encrypted) {
      throw new GoogleDriveOAuthError(
        'Reconnect Google Drive to continue automatic backups.',
        { code: 'reauthorization_required', status: 401 },
      )
    }
    return decryptRefreshToken(encrypted)
  }

  function accessResponse(payload) {
    return {
      accessToken: payload.access_token,
      expiresIn: Number(payload.expires_in ?? 3600),
    }
  }

  return {
    available,
    cookieName,
    cookieOptions,

    async exchangeCode({ code, origin, redirectUri }) {
      validateOrigin(origin)
      if (redirectUri !== origin || !code) {
        throw new GoogleDriveOAuthError(
          'The Google authorization response is invalid.',
          { code: 'invalid_authorization_response', status: 400 },
        )
      }
      const payload = await requestToken(fetchImpl, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      })
      if (!payload.refresh_token) {
        throw new GoogleDriveOAuthError(
          'Google did not return reusable authorization. Reconnect and grant access again.',
          { code: 'refresh_token_missing' },
        )
      }
      return {
        ...accessResponse(payload),
        cookieValue: encryptRefreshToken(payload.refresh_token),
      }
    },

    async refresh({ cookieHeader, origin }) {
      validateOrigin(origin)
      const refreshToken = readRefreshToken(cookieHeader)
      const payload = await requestToken(fetchImpl, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
      return {
        ...accessResponse(payload),
        cookieValue: encryptRefreshToken(
          payload.refresh_token || refreshToken,
        ),
      }
    },

    async revoke({ cookieHeader, origin }) {
      validateOrigin(origin)
      const refreshToken = readRefreshToken(cookieHeader)
      await fetchImpl(REVOCATION_ENDPOINT, {
        body: new URLSearchParams({ token: refreshToken }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }).catch(() => {})
    },
  }
}
