import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
})

test('generated desktop icons contain valid native container headers', async () => {
  const [icns, ico, png] = await Promise.all([
    readFile(new URL('../desktop/assets/icon.icns', import.meta.url)),
    readFile(new URL('../desktop/assets/icon.ico', import.meta.url)),
    readFile(new URL('../desktop/assets/icon.png', import.meta.url)),
  ])

  assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns')
  assert.equal(icns.readUInt32BE(4), icns.length)
  assert.equal(icns.subarray(8, 12).toString('ascii'), 'ic09')
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(png.readUInt32BE(16), 512)
  assert.equal(png.readUInt32BE(20), 512)
})
