import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  AgentImageError,
  createAgentImageStore,
  validateAgentImage,
} from '../server/desktop-image-store.mjs'

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
])

test('agent image store stages session-owned opaque paths and removes them', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swu-image-store-'))
  const store = createAgentImageStore(directory, {
    createToken: () => 'safe-desktop-image-token',
  })
  t.after(async () => {
    await store.close()
    await rm(directory, { recursive: true, force: true })
  })

  const staged = await store.stage(PNG, 'image/png', 'session-one')
  const entry = store.get(staged.token)

  assert.deepEqual(staged, {
    token: 'safe-desktop-image-token',
    contentType: 'image/png',
    size: PNG.length,
  })
  assert.equal(path.dirname(entry.path), directory)
  assert.deepEqual(await readFile(entry.path), PNG)
  assert.equal(await store.remove(staged.token), true)
  assert.equal(store.get(staged.token), null)
  await assert.rejects(access(entry.path), { code: 'ENOENT' })
})

test('agent image claims are session-bound, one-shot, and expiring', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swu-image-store-'))
  const tokens = ['agent-image-token-one', 'agent-image-token-two']
  let timestamp = 1_000
  const store = createAgentImageStore(directory, {
    createToken: () => tokens.shift(),
    now: () => timestamp,
    ttlMs: 500,
  })
  t.after(async () => {
    await store.close()
    await rm(directory, { recursive: true, force: true })
  })

  const claimedImage = await store.stage(PNG, 'image/png', 'session-one')
  assert.equal(await store.claim(claimedImage.token, 'session-two'), null)
  assert.equal(
    (await store.claim(claimedImage.token, 'session-one')).owner,
    'session-one',
  )
  assert.equal(await store.claim(claimedImage.token, 'session-one'), null)

  const expiringImage = await store.stage(PNG, 'image/png', 'session-two')
  timestamp += 501
  assert.equal(await store.claim(expiringImage.token, 'session-two'), null)
  assert.equal(store.get(expiringImage.token), null)
  assert.notEqual(store.get(claimedImage.token), null)
})

test('agent image validation rejects spoofed or unsupported content', () => {
  assert.throws(
    () => validateAgentImage(PNG, 'image/jpeg'),
    (error) =>
      error instanceof AgentImageError &&
      error.status === 415 &&
      /do not match/.test(error.message),
  )
  assert.throws(
    () => validateAgentImage(PNG, 'image/gif'),
    (error) =>
      error instanceof AgentImageError &&
      error.status === 415 &&
      /PNG, JPEG, and WebP/.test(error.message),
  )
})
