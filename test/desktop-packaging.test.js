import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const forgeConfig = require('../forge.config.cjs')

test('Electron Forge declares native makers for Windows, macOS, and Linux', () => {
  const makers = new Map(
    forgeConfig.makers.map((maker) => [maker.name, maker.platforms]),
  )

  assert.deepEqual(makers.get('squirrel'), ['win32'])
  assert.deepEqual(makers.get('dmg'), ['darwin', 'mas'])
  assert.deepEqual(makers.get('zip'), ['darwin'])
  assert.deepEqual(makers.get('deb'), ['linux'])
  assert.deepEqual(makers.get('rpm'), ['linux'])
  assert.equal(forgeConfig.packagerConfig.icon, './desktop/assets/icon')
  assert.equal(
    forgeConfig.packagerConfig.appBundleId,
    'ch.wuteri.swu-deck-builder',
  )

  const squirrelConfig = forgeConfig.makers.find(
    (maker) => maker.name === 'squirrel',
  ).configOrConfigFetcher
  assert.equal(squirrelConfig.setupIcon, './desktop/assets/icon.ico')
  assert.equal(
    squirrelConfig.iconUrl,
    'https://raw.githubusercontent.com/Alfwich/swu-deck-builder/master/desktop/assets/icon.ico',
  )

  assert.equal(
    forgeConfig.packagerConfig.ignore.some((pattern) =>
      pattern.test('/shared/google-drive-api.mjs'),
    ),
    false,
  )
})
