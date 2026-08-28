import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DesktopImageError,
  createDesktopImageStore,
  validateDesktopImage,
} from '../server/desktop-image-store.mjs'

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
])

test('desktop image store stages opaque paths and removes them', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swu-image-store-'))
  const store = createDesktopImageStore(directory, {
    createToken: () => 'safe-desktop-image-token',
  })
  t.after(async () => {
    await store.close()
    await rm(directory, { recursive: true, force: true })
  })

  const staged = await store.stage(PNG, 'image/png')
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

test('desktop image validation rejects spoofed or unsupported content', () => {
  assert.throws(
    () => validateDesktopImage(PNG, 'image/jpeg'),
    (error) =>
      error instanceof DesktopImageError &&
      error.status === 415 &&
      /do not match/.test(error.message),
  )
  assert.throws(
    () => validateDesktopImage(PNG, 'image/gif'),
    (error) =>
      error instanceof DesktopImageError &&
      error.status === 415 &&
      /PNG, JPEG, and WebP/.test(error.message),
  )
})
