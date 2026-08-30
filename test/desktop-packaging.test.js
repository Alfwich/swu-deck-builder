import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const require = createRequire(import.meta.url)
const forgeConfig = require('../forge.config.cjs')

test('desktop commands build the web application without redundant lifecycle scripts', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )

  assert.equal(packageJson.scripts['desktop:icons'], undefined)
  for (const operation of ['start', 'package', 'make']) {
    assert.equal(packageJson.scripts[`predesktop:${operation}`], undefined)
    assert.equal(
      packageJson.scripts[`desktop:${operation}`],
      `npm run build && electron-forge ${operation}`,
    )
  }
})

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
