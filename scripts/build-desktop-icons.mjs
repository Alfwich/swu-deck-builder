import { mkdir, readFile, writeFile } from 'node:fs/promises'

const pngSource = new URL('../public/android-chrome-512x512.png', import.meta.url)
const icoSource = new URL('../public/favicon.ico', import.meta.url)
const outputDirectory = new URL('../desktop/assets/', import.meta.url)

function assertPngDimensions(png, expectedSize) {
  const signature = '89504e470d0a1a0a'
  if (png.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Desktop icon source is not a PNG image.')
  }
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(
      `Desktop icon source must be ${expectedSize}x${expectedSize}; received ${width}x${height}.`,
    )
  }
}

function createIcns(png) {
  const entry = Buffer.alloc(8 + png.length)
  entry.write('ic09', 0, 'ascii')
  entry.writeUInt32BE(entry.length, 4)
  png.copy(entry, 8)

  const icns = Buffer.alloc(8 + entry.length)
  icns.write('icns', 0, 'ascii')
  icns.writeUInt32BE(icns.length, 4)
  entry.copy(icns, 8)
  return icns
}

const [png, ico] = await Promise.all([
  readFile(pngSource),
  readFile(icoSource),
])
assertPngDimensions(png, 512)

await mkdir(outputDirectory, { recursive: true })
await Promise.all([
  writeFile(new URL('icon.png', outputDirectory), png),
  writeFile(new URL('icon.ico', outputDirectory), ico),
  writeFile(new URL('icon.icns', outputDirectory), createIcns(png)),
])

console.log('Desktop icons generated from the site favicon artwork.')
