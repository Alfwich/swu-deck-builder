import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const expectedPngs = new Map([
  ['../public/favicon-16x16.png', 16],
  ['../public/favicon-32x32.png', 32],
  ['../public/apple-touch-icon.png', 180],
  ['../public/android-chrome-192x192.png', 192],
  ['../public/android-chrome-512x512.png', 512],
  ['../src/desktop/assets/icon.png', 512],
])

test('the authored icon source is a large transparent PNG', async () => {
  const metadata = await sharp(
    fileURLToPath(new URL('../src/web/assets/app-icon.png', import.meta.url)),
  ).metadata()
  assert.equal(metadata.format, 'png')
  assert.equal(metadata.hasAlpha, true)
  assert.ok(metadata.width >= 512)
  assert.ok(metadata.height >= 512)
})

test('website and desktop PNG icons are transparent square derivatives', async () => {
  for (const [relativePath, size] of expectedPngs) {
    const metadata = await sharp(
      fileURLToPath(new URL(relativePath, import.meta.url)),
    ).metadata()
    assert.equal(metadata.format, 'png', relativePath)
    assert.equal(metadata.width, size, relativePath)
    assert.equal(metadata.height, size, relativePath)
    assert.equal(metadata.hasAlpha, true, relativePath)
  }

  const [websiteIcon, desktopIcon] = await Promise.all([
    readFile(new URL('../public/android-chrome-512x512.png', import.meta.url)),
    readFile(new URL('../src/desktop/assets/icon.png', import.meta.url)),
  ])
  assert.deepEqual(desktopIcon, websiteIcon)
})

test('website and Windows desktop icons share one multi-resolution ICO', async () => {
  const [websiteIcon, desktopIcon] = await Promise.all([
    readFile(new URL('../public/favicon.ico', import.meta.url)),
    readFile(new URL('../src/desktop/assets/icon.ico', import.meta.url)),
  ])

  assert.deepEqual(desktopIcon, websiteIcon)
  assert.equal(websiteIcon.readUInt16LE(0), 0)
  assert.equal(websiteIcon.readUInt16LE(2), 1)
  const entryCount = websiteIcon.readUInt16LE(4)
  assert.equal(entryCount, 4)
  const sizes = Array.from({ length: entryCount }, (_, index) => {
    const encodedSize = websiteIcon.readUInt8(6 + index * 16)
    return encodedSize || 256
  })
  assert.deepEqual(sizes.sort((left, right) => left - right), [16, 32, 48, 256])
})

test('macOS icon includes native and Retina PNG representations', async () => {
  const icns = await readFile(
    new URL('../src/desktop/assets/icon.icns', import.meta.url),
  )
  assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns')
  assert.equal(icns.readUInt32BE(4), icns.length)

  const entryTypes = []
  for (let offset = 8; offset < icns.length; ) {
    entryTypes.push(icns.subarray(offset, offset + 4).toString('ascii'))
    offset += icns.readUInt32BE(offset + 4)
  }
  assert.deepEqual(entryTypes, [
    'icp4',
    'icp5',
    'icp6',
    'ic07',
    'ic08',
    'ic09',
    'ic10',
    'ic11',
    'ic12',
    'ic13',
    'ic14',
  ])
})
