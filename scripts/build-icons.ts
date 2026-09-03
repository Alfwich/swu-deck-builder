import { mkdir, readFile, writeFile } from 'node:fs/promises'

import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const iconSource = new URL('../src/web/assets/app-icon.png', import.meta.url)
const publicDirectory = new URL('../public/', import.meta.url)
const desktopDirectory = new URL('../src/desktop/assets/', import.meta.url)
const transparent = { alpha: 0, b: 0, g: 0, r: 0 }
const requiredSizes = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024]

function createIcns(pngBySize) {
  const definitions = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ]
  const entries = definitions.map(([type, size]) => {
    const png = pngBySize.get(size)
    const entry = Buffer.alloc(8 + png.length)
    entry.write(type, 0, 'ascii')
    entry.writeUInt32BE(entry.length, 4)
    png.copy(entry, 8)
    return entry
  })
  const totalLength = 8 + entries.reduce((total, entry) => total + entry.length, 0)
  const icns = Buffer.alloc(totalLength)
  icns.write('icns', 0, 'ascii')
  icns.writeUInt32BE(icns.length, 4)
  let offset = 8
  for (const entry of entries) {
    entry.copy(icns, offset)
    offset += entry.length
  }
  return icns
}

const source = await readFile(iconSource)
const metadata = await sharp(source).metadata()
if (
  metadata.format !== 'png' ||
  !metadata.hasAlpha ||
  !metadata.width ||
  !metadata.height ||
  Math.min(metadata.width, metadata.height) < 512
) {
  throw new Error(
    'The app icon source must be a transparent PNG at least 512 pixels on each side.',
  )
}

const pngBySize = new Map(
  await Promise.all(
    requiredSizes.map(async (size) => [
      size,
      await sharp(source)
        .resize(size, size, { background: transparent, fit: 'contain' })
        .png({ adaptiveFiltering: true, compressionLevel: 9 })
        .toBuffer(),
    ]),
  ),
)
const ico = await pngToIco(
  [16, 32, 48, 256].map((size) => pngBySize.get(size)),
)
const icns = createIcns(pngBySize)

await Promise.all([
  mkdir(publicDirectory, { recursive: true }),
  mkdir(desktopDirectory, { recursive: true }),
])
await Promise.all([
  writeFile(new URL('favicon-16x16.png', publicDirectory), pngBySize.get(16)),
  writeFile(new URL('favicon-32x32.png', publicDirectory), pngBySize.get(32)),
  writeFile(new URL('apple-touch-icon.png', publicDirectory), pngBySize.get(180)),
  writeFile(new URL('android-chrome-192x192.png', publicDirectory), pngBySize.get(192)),
  writeFile(new URL('android-chrome-512x512.png', publicDirectory), pngBySize.get(512)),
  writeFile(new URL('favicon.ico', publicDirectory), ico),
  writeFile(new URL('icon.png', desktopDirectory), pngBySize.get(512)),
  writeFile(new URL('icon.ico', desktopDirectory), ico),
  writeFile(new URL('icon.icns', desktopDirectory), icns),
])

console.log('Website and desktop icons generated from src/web/assets/app-icon.png.')
