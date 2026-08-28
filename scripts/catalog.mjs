import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { constants, gunzip, gzip } from 'node:zlib'

export const DEFAULT_PUBLIC_CATALOG_URL =
  'https://swu.wuteri.ch/catalog.json.gz'

const gunzipAsync = promisify(gunzip)
const gzipAsync = promisify(gzip)
const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export function createCatalogPaths(root = projectRoot) {
  return {
    catalogPath: join(root, 'data', 'catalog.json'),
    packedCatalogPath: join(root, 'public', 'catalog.json.gz'),
    cacheArchivePath: join(root, 'data', 'cache', 'public-catalog.json.gz'),
    cacheMetadataPath: join(
      root,
      'data',
      'cache',
      'public-catalog-metadata.json',
    ),
  }
}

function publicCatalogUrl(value = process.env.SWU_PUBLIC_CATALOG_URL) {
  const url = new URL(value?.trim() || DEFAULT_PUBLIC_CATALOG_URL)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('SWU_PUBLIC_CATALOG_URL must use HTTP or HTTPS.')
  }

  return url.href
}

function validateCatalog(rawCatalog) {
  if (rawCatalog.length > MAX_UNCOMPRESSED_BYTES) {
    throw new Error('The uncompressed public catalog exceeds the size limit.')
  }

  let catalog
  try {
    catalog = JSON.parse(rawCatalog.toString('utf8'))
  } catch (error) {
    throw new Error(`The public catalog is not valid JSON: ${error.message}`)
  }

  if (
    catalog?.schemaVersion !== 1 ||
    !catalog.setIndex ||
    typeof catalog.setIndex !== 'object' ||
    !catalog.sets ||
    typeof catalog.sets !== 'object'
  ) {
    throw new Error('The public catalog has an unsupported schema.')
  }

  return catalog
}

async function decodeArchive(archive) {
  if (archive.length > MAX_COMPRESSED_BYTES) {
    throw new Error('The compressed public catalog exceeds the size limit.')
  }

  if (archive[0] !== 0x1f || archive[1] !== 0x8b) {
    throw new Error('The public catalog response is not gzip-compressed.')
  }

  let rawCatalog
  try {
    rawCatalog = await gunzipAsync(archive, {
      maxOutputLength: MAX_UNCOMPRESSED_BYTES,
    })
  } catch (error) {
    throw new Error(`The public catalog could not be decompressed: ${error.message}`)
  }

  return { catalog: validateCatalog(rawCatalog), rawCatalog }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function readBuffer(path) {
  try {
    return await readFile(path)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`

  try {
    await writeFile(temporaryPath, contents)
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
}

function conditionalHeaders(metadata, url, hasCachedArchive) {
  if (!hasCachedArchive || metadata?.url !== url) {
    return {}
  }

  return {
    ...(metadata.etag ? { 'If-None-Match': metadata.etag } : {}),
    ...(metadata.lastModified
      ? { 'If-Modified-Since': metadata.lastModified }
      : {}),
  }
}

async function requestCatalog({ fetchImpl, headers, timeoutMs, url }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(url, {
      cache: 'no-cache',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadArchive({
  fetchImpl,
  paths,
  timeoutMs,
  url,
}) {
  const storedArchive = await readBuffer(paths.cacheArchivePath)
  const metadata = await readJson(paths.cacheMetadataPath)
  const storedHash = storedArchive
    ? createHash('sha256').update(storedArchive).digest('hex')
    : null
  const cachedArchive =
    metadata?.schemaVersion === 1 &&
    metadata.url === url &&
    metadata.sha256 === storedHash
      ? storedArchive
      : null
  const headers = conditionalHeaders(metadata, url, Boolean(cachedArchive))

  try {
    const response = await requestCatalog({ fetchImpl, headers, timeoutMs, url })

    if (response.status === 304) {
      if (!cachedArchive) {
        throw new Error('The server returned 304 without a cached catalog.')
      }

      return { archive: cachedArchive, cacheState: 'not-modified', metadata }
    }

    if (!response.ok) {
      throw new Error(`The public catalog request failed with HTTP ${response.status}.`)
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_COMPRESSED_BYTES) {
      throw new Error('The compressed public catalog exceeds the size limit.')
    }

    const archive = Buffer.from(await response.arrayBuffer())
    await decodeArchive(archive)

    const nextMetadata = {
      schemaVersion: 1,
      url,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      fetchedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(archive).digest('hex'),
    }

    await writeAtomic(paths.cacheArchivePath, archive)
    await writeAtomic(
      paths.cacheMetadataPath,
      `${JSON.stringify(nextMetadata, null, 2)}\n`,
    )

    return { archive, cacheState: 'downloaded', metadata: nextMetadata }
  } catch (error) {
    if (!cachedArchive) {
      throw error
    }

    await decodeArchive(cachedArchive)
    return {
      archive: cachedArchive,
      cacheState: 'stale-cache',
      metadata,
      warning: error.message,
    }
  }
}

function catalogCounts(catalog) {
  const sets = Object.values(catalog.sets)
  return {
    cardCount: sets.reduce(
      (total, set) => total + (Array.isArray(set.cards) ? set.cards.length : 0),
      0,
    ),
    setCount: sets.length,
  }
}

async function installArchive(archive, paths) {
  const { catalog, rawCatalog } = await decodeArchive(archive)
  await writeAtomic(paths.catalogPath, rawCatalog)
  await writeAtomic(paths.packedCatalogPath, archive)
  return catalogCounts(catalog)
}

export async function syncPublicCatalog({
  fetchImpl = fetch,
  logger = console,
  paths = createCatalogPaths(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  url = publicCatalogUrl(),
} = {}) {
  const result = await downloadArchive({ fetchImpl, paths, timeoutMs, url })
  const counts = await installArchive(result.archive, paths)

  if (result.warning) {
    logger.warn(`Public catalog refresh failed; using cached copy: ${result.warning}`)
  }

  logger.log(
    `Public catalog ready: ${counts.cardCount.toLocaleString()} cards across ${counts.setCount.toLocaleString()} sets (${result.cacheState}).`,
  )

  return { ...result, ...counts, paths, url }
}

async function readValidLocalCatalog(catalogPath) {
  const rawCatalog = await readBuffer(catalogPath)
  if (!rawCatalog) {
    return null
  }

  try {
    return { catalog: validateCatalog(rawCatalog), rawCatalog }
  } catch {
    return null
  }
}

async function packedCatalogIsCurrent(paths, rawCatalog) {
  const archive = await readBuffer(paths.packedCatalogPath)
  if (!archive) {
    return false
  }

  try {
    const packed = await decodeArchive(archive)
    return packed.rawCatalog.equals(rawCatalog)
  } catch {
    return false
  }
}

async function packLocalCatalog(rawCatalog, packedCatalogPath) {
  const archive = await gzipAsync(rawCatalog, {
    level: constants.Z_BEST_COMPRESSION,
  })
  await writeAtomic(packedCatalogPath, archive)
}

export async function ensureCatalog(options = {}) {
  const paths = options.paths ?? createCatalogPaths()
  const local = await readValidLocalCatalog(paths.catalogPath)

  if (!local) {
    options.logger?.log?.('No usable local catalog found; syncing the public catalog.')
    return syncPublicCatalog({ ...options, paths })
  }

  if (!(await packedCatalogIsCurrent(paths, local.rawCatalog))) {
    await packLocalCatalog(local.rawCatalog, paths.packedCatalogPath)
    options.logger?.log?.('Packed the existing local catalog for the browser.')
  } else {
    options.logger?.log?.('Using the existing local catalog.')
  }

  return {
    cacheState: 'local',
    ...catalogCounts(local.catalog),
    paths,
  }
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
      pathToFileURL(resolve(process.argv[1])).href === import.meta.url,
  )
}

if (isMainModule()) {
  const ensureOnly = process.argv.slice(2).includes('--ensure')
  const operation = ensureOnly ? ensureCatalog : syncPublicCatalog

  operation({ logger: console }).catch((error) => {
    console.error(`Catalog sync failed: ${error.message}`)
    process.exitCode = 1
  })
}
