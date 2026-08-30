import assert from 'node:assert/strict'
import test from 'node:test'

import { createGoogleDriveOAuthBroker } from '../server/google-drive-oauth-broker.mjs'

function brokerConfig(overrides = {}) {
  return {
    authorizedOrigins: ['https://swu.wuteri.ch'],
    available: true,
    clientId: 'web-client-id',
    clientSecret: 'web-client-secret',
    cookieMaxAgeMs: 15_552_000_000,
    encryptionKey: Buffer.alloc(32, 7),
    secureCookies: true,
    ...overrides,
  }
}

test('OAuth broker encrypts refresh tokens and renews browser access silently', async () => {
  const requests = []
  const responses = [
    new Response(JSON.stringify({
      access_token: 'initial-access-token',
      expires_in: 3600,
      refresh_token: 'private-refresh-token',
    })),
    new Response(JSON.stringify({
      access_token: 'renewed-access-token',
      expires_in: 1800,
    })),
  ]
  const broker = createGoogleDriveOAuthBroker(brokerConfig(), {
    fetchImpl: async (url, options) => {
      requests.push({ options, url })
      return responses.shift()
    },
    randomBytesImpl: (size) => Buffer.alloc(size, 3),
  })

  const initial = await broker.exchangeCode({
    code: 'authorization-code',
    origin: 'https://swu.wuteri.ch',
    redirectUri: 'https://swu.wuteri.ch',
  })
  assert.equal(initial.accessToken, 'initial-access-token')
  assert.equal(initial.cookieValue.includes('private-refresh-token'), false)
  assert.equal(broker.cookieName, '__Host-swu-drive-auth')
  assert.deepEqual(broker.cookieOptions, {
    httpOnly: true,
    maxAge: 15_552_000_000,
    path: '/',
    sameSite: 'strict',
    secure: true,
  })

  const renewed = await broker.refresh({
    cookieHeader: `${broker.cookieName}=${initial.cookieValue}`,
    origin: 'https://swu.wuteri.ch',
  })
  assert.equal(renewed.accessToken, 'renewed-access-token')
  assert.equal(renewed.cookieValue.includes('private-refresh-token'), false)
  assert.match(String(requests[0].options.body), /grant_type=authorization_code/)
  assert.match(String(requests[0].options.body), /client_secret=web-client-secret/)
  assert.match(String(requests[1].options.body), /grant_type=refresh_token/)
  assert.match(String(requests[1].options.body), /refresh_token=private-refresh-token/)
})

test('OAuth broker rejects foreign origins and tampered cookies', async () => {
  const broker = createGoogleDriveOAuthBroker(brokerConfig(), {
    fetchImpl: async () => new Response('{}'),
  })

  await assert.rejects(
    broker.exchangeCode({
      code: 'authorization-code',
      origin: 'https://attacker.example',
      redirectUri: 'https://attacker.example',
    }),
    (error) => error.code === 'origin_not_allowed' && error.status === 403,
  )
  await assert.rejects(
    broker.refresh({
      cookieHeader: `${broker.cookieName}=v1.tampered.value.tag`,
      origin: 'https://swu.wuteri.ch',
    }),
    (error) => error.code === 'reauthorization_required' && error.status === 401,
  )
})

test('OAuth broker maps revoked Google grants to reauthorization', async () => {
  const broker = createGoogleDriveOAuthBroker(brokerConfig(), {
    fetchImpl: async () => new Response(JSON.stringify({
      error: 'invalid_grant',
    }), { status: 400 }),
    randomBytesImpl: (size) => Buffer.alloc(size, 5),
  })
  const seedBroker = createGoogleDriveOAuthBroker(brokerConfig(), {
    fetchImpl: async () => new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    })),
    randomBytesImpl: (size) => Buffer.alloc(size, 5),
  })
  const initial = await seedBroker.exchangeCode({
    code: 'authorization-code',
    origin: 'https://swu.wuteri.ch',
    redirectUri: 'https://swu.wuteri.ch',
  })

  await assert.rejects(
    broker.refresh({
      cookieHeader: `${broker.cookieName}=${initial.cookieValue}`,
      origin: 'https://swu.wuteri.ch',
    }),
    (error) => error.code === 'reauthorization_required' && error.status === 401,
  )
})
