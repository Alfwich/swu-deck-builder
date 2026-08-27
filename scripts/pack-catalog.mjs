import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { constants, createGzip } from 'node:zlib'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDirectory = join(projectRoot, 'data')
const publicDirectory = join(projectRoot, 'public')
const catalogPath = join(dataDirectory, 'catalog.json')
const packedCatalogPath = join(publicDirectory, 'catalog.json.gz')
const temporaryPath = `${packedCatalogPath}.tmp`

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = units[0]

  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024
    unit = units[index]
  }

  return `${value.toFixed(2)} ${unit}`
}

async function main() {
  let sourceStats

  try {
    sourceStats = await stat(catalogPath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        'No local catalog exists. Run a catalog sync before packing it.',
      )
    }

    throw error
  }

  await mkdir(publicDirectory, { recursive: true })

  try {
    await pipeline(
      createReadStream(catalogPath),
      createGzip({ level: constants.Z_BEST_COMPRESSION }),
      createWriteStream(temporaryPath, { flags: 'w' }),
    )
    await rename(temporaryPath, packedCatalogPath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }

  const packedStats = await stat(packedCatalogPath)
  const reduction = (1 - packedStats.size / sourceStats.size) * 100

  console.log(`Packed ${catalogPath}`)
  console.log(`Created ${packedCatalogPath}`)
  console.log(
    `${formatBytes(sourceStats.size)} → ${formatBytes(packedStats.size)} (${reduction.toFixed(1)}% smaller)`,
  )
}

main().catch((error) => {
  console.error(`Catalog pack failed: ${error.message}`)
  process.exitCode = 1
})
