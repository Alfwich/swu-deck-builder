import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const forgeConfig = require('../forge.config.cjs')

test('desktop packaging injects the OAuth client secret only into the staged app', async () => {
  const buildPath = await mkdtemp(path.join(tmpdir(), 'swu-desktop-oauth-'))
  const previous = process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET
  process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET = 'packaged-client-secret'
  try {
    await mkdir(path.join(buildPath, '.runtime', 'desktop'), { recursive: true })
    await new Promise((resolve, reject) => {
      forgeConfig.packagerConfig.afterCopy[0](
        buildPath,
        'test-electron',
        'win32',
        'x64',
        (error) => error ? reject(error) : resolve(),
      )
    })
    const source = await readFile(
      path.join(buildPath, '.runtime', 'desktop', 'google-drive-client-secret.js'),
      'utf8',
    )
    assert.match(source, /packaged-client-secret/)
    assert.doesNotMatch(
      await readFile(
        new URL('../src/desktop/google-drive-client-secret.ts', import.meta.url),
        'utf8',
      ),
      /packaged-client-secret/,
    )
  } finally {
    if (previous === undefined) {
      delete process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET
    } else {
      process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET = previous
    }
    await rm(buildPath, { force: true, recursive: true })
  }
})
