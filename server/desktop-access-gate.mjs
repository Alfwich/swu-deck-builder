import { timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'swu-desktop-access'
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join('; ')

function readCookie(header, name) {
  for (const entry of String(header ?? '').split(';')) {
    const separator = entry.indexOf('=')
    if (separator === -1 || entry.slice(0, separator).trim() !== name) {
      continue
    }

    return entry.slice(separator + 1).trim()
  }
  return ''
}

function tokensMatch(candidate, expected) {
  const candidateBuffer = Buffer.from(String(candidate ?? ''))
  const expectedBuffer = Buffer.from(expected)
  return candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
}

export function installDesktopAccessGate(expressApp, accessToken) {
  if (!accessToken) {
    return
  }

  expressApp.get('/desktop/bootstrap', (request, response) => {
    if (!tokensMatch(request.query.token, accessToken)) {
      response.status(401).send('Desktop access denied.')
      return
    }

    response.set('Cache-Control', 'no-store')
    response.cookie(COOKIE_NAME, accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    })
    response.redirect(302, '/')
  })

  expressApp.use((request, response, next) => {
    response.set({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })

    const cookie = readCookie(request.get('Cookie'), COOKIE_NAME)
    if (!tokensMatch(cookie, accessToken)) {
      response.set('Cache-Control', 'no-store')
      response.status(401).send('Desktop access denied.')
      return
    }

    next()
  })
}
