import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fetchSwuDbSet } from './swu-db-set.mjs'

const SOURCE_BASE_URL = readEnvironmentUrl('SWU_DB_API_BASE_URL', true)
const SETS_PAGE_URL = readEnvironmentUrl('SWU_DB_SETS_PAGE_URL')
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDirectory = join(projectRoot, 'data')
const catalogPath = join(dataDirectory, 'catalog.json')

function readEnvironmentUrl(name, removeTrailingSlash = false) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  const url = new URL(value)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`)
  }

  return removeTrailingSlash ? value.replace(/\/+$/, '') : value
}

function createEmptyCatalog() {
  return {
    schemaVersion: 1,
    source: {
      name: 'SWU-DB',
      baseUrl: SOURCE_BASE_URL,
    },
    updatedAt: null,
    setIndex: {},
    sets: {},
  }
}

async function readCatalog() {
  try {
    const contents = await readFile(catalogPath, 'utf8')
    const catalog = JSON.parse(contents)

    if (
      catalog?.schemaVersion !== 1 ||
      !catalog.setIndex ||
      !catalog.sets
    ) {
      throw new Error('Unsupported catalog schema.')
    }

    return catalog
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return createEmptyCatalog()
    }

    throw new Error(`Could not read ${catalogPath}: ${error.message}`)
  }
}

function parseArguments(argumentsList) {
  const options = {
    available: false,
    list: false,
    refresh: false,
    refreshAll: false,
    syncAll: false,
    setCodes: [],
  }

  for (const argument of argumentsList) {
    if (argument === '--available') {
      options.available = true
    } else if (argument === '--list') {
      options.list = true
    } else if (argument === '--refresh') {
      options.refresh = true
    } else if (argument === '--refresh-all') {
      options.refreshAll = true
    } else if (argument === '--sync-all') {
      options.syncAll = true
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`)
    } else {
      const setCode = argument.toUpperCase()

      if (!/^[A-Z0-9-]{2,16}$/.test(setCode)) {
        throw new Error(`Invalid set code: ${argument}`)
      }

      options.setCodes.push(setCode)
    }
  }

  options.setCodes = [...new Set(options.setCodes)]
  return options
}

function decodeHtml(value) {
  return value.replace(
    /&(#x?[0-9a-f]+|amp|quot|apos|lt|gt|nbsp);/gi,
    (entity, name) => {
      const normalizedName = name.toLowerCase()

      if (normalizedName.startsWith('#x')) {
        return String.fromCodePoint(Number.parseInt(normalizedName.slice(2), 16))
      }

      if (normalizedName.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(normalizedName.slice(1), 10))
      }

      return {
        amp: '&',
        quot: '"',
        apos: "'",
        lt: '<',
        gt: '>',
        nbsp: ' ',
      }[normalizedName]
    },
  )
}

function textFromCell(cellHtml) {
  return decodeHtml(cellHtml.replace(/<[^>]+>/g, ' '))
    .replace(/^\s*↳\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAvailableSets(html) {
  const setsByCode = new Map()
  const rows = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]

    if (cells.length !== 4) {
      continue
    }

    const [nameCell, codeCell, cardsCell, releaseCell] = cells.map(
      (cell) => cell[1],
    )
    const code = textFromCell(codeCell).toUpperCase()

    if (!/^[A-Z0-9-]{2,16}$/.test(code)) {
      continue
    }

    const href = nameCell.match(/href=["']([^"']+)["']/i)?.[1]
    const query = href
      ? new URL(decodeHtml(href), SETS_PAGE_URL).searchParams.get('q')
      : null
    const entry = {
      code,
      name: textFromCell(nameCell),
      cardCount: Number.parseInt(textFromCell(cardsCell), 10) || null,
      releaseDate: textFromCell(releaseCell) || null,
      canonical: query?.trim().toUpperCase() === `SET:${code}`,
    }
    const existingEntry = setsByCode.get(code)

    if (!existingEntry || (entry.canonical && !existingEntry.canonical)) {
      setsByCode.set(code, entry)
    }
  }

  return [...setsByCode.values()].sort((left, right) =>
    left.code.localeCompare(right.code),
  )
}

async function fetchAvailableSets() {
  const response = await fetch(SETS_PAGE_URL, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'swu-deck-builder set index',
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`Set index returned HTTP ${response.status}.`)
  }

  const sets = parseAvailableSets(await response.text())

  if (sets.length === 0) {
    throw new Error('The remote set index had an unexpected format.')
  }

  return sets
}

function printAvailableSets(sets) {
  console.table(
    sets.map(({ code, name, cardCount, releaseDate }) => ({
      code,
      name,
      cards: cardCount,
      release: releaseDate ?? '',
    })),
  )
  console.log(`${sets.length} remote set codes available.`)
}

function printCatalogIndex(catalog) {
  const entries = Object.entries(catalog.setIndex).sort(([left], [right]) =>
    left.localeCompare(right),
  )

  if (entries.length === 0) {
    console.log('No sets have been downloaded.')
    return
  }

  console.table(
    entries.map(([setCode, entry]) => ({
      set: setCode,
      printings: entry.printingCount,
      syncedAt: entry.syncedAt,
      hash: entry.contentHash.slice(0, 19),
    })),
  )
}

async function writeCatalog(catalog) {
  await mkdir(dataDirectory, { recursive: true })
  const temporaryPath = `${catalogPath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, catalogPath)
}

function sortCatalog(catalog) {
  catalog.setIndex = Object.fromEntries(
    Object.entries(catalog.setIndex).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
  catalog.sets = Object.fromEntries(
    Object.entries(catalog.sets).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

function printUsage() {
  console.log(`Usage:
  npm run catalog:sync -- SOR SHD
  npm run catalog:sync-all
  npm run catalog:refresh -- SOR
  npm run catalog:refresh-all
  npm run catalog:available
  npm run catalog:list`)
}

async function includeAllRemoteSets(options, catalog) {
  if (!options.syncAll && !options.refreshAll) {
    return
  }
  if (
    (options.syncAll && options.refreshAll) ||
    options.refresh ||
    options.setCodes.length > 0
  ) {
    throw new Error('Sync-all and refresh-all cannot be combined with set codes or refresh.')
  }

  const availableSets = await fetchAvailableSets()
  options.setCodes = availableSets.map((set) => set.code)
  if (options.refreshAll) {
    console.log(`Found ${availableSets.length} remote set codes to refresh.`)
    return
  }
  const missingCount = options.setCodes.filter(
    (setCode) => !catalog.sets[setCode],
  ).length
  console.log(
    `Found ${availableSets.length} remote set codes; ${missingCount} are missing locally.`,
  )
}

async function applySetDownload(catalog, setCode, download) {
  if (download.status === 'not-modified') {
    if (!download.metadataChanged || !download.indexEntry) return 'unchanged'

    catalog.setIndex[setCode] = download.indexEntry
    sortCatalog(catalog)
    await writeCatalog(catalog)
    return 'metadata-updated'
  }

  catalog.setIndex[setCode] = download.indexEntry
  catalog.sets[setCode] = download.set
  catalog.updatedAt = new Date().toISOString()
  sortCatalog(catalog)
  await writeCatalog(catalog)
  return 'changed'
}

async function fetchSetOrSkip(setCode, previous, syncAll, skippedDownloads) {
  try {
    return await fetchSwuDbSet({
      baseUrl: SOURCE_BASE_URL,
      previous,
      setCode,
    })
  } catch (error) {
    if (!syncAll) throw error

    skippedDownloads.push({ set: setCode, reason: error.message })
    console.warn(`Skipping ${setCode}: ${error.message}`)
    return null
  }
}

async function downloadRequiredSets(requiredSetCodes, options, catalog) {
  const skippedDownloads = []
  let changedCount = 0
  let metadataUpdatedCount = 0

  for (const [index, setCode] of requiredSetCodes.entries()) {
    const previous = catalog.setIndex[setCode] ?? null
    console.log(`${previous ? 'Checking' : 'Downloading'} ${setCode}…`)
    const download = await fetchSetOrSkip(
      setCode,
      previous,
      options.syncAll || options.refreshAll,
      skippedDownloads,
    )
    if (!download) continue

    const change = await applySetDownload(catalog, setCode, download)
    if (change !== 'changed') {
      if (change === 'metadata-updated') metadataUpdatedCount += 1
      console.log(`${setCode} is unchanged (${index + 1}/${requiredSetCodes.length}).`)
      continue
    }

    changedCount += 1
    console.log(`Saved ${setCode} (${index + 1}/${requiredSetCodes.length}).`)
  }

  return { changedCount, metadataUpdatedCount, skippedDownloads }
}

function printSkippedDownloads(skippedDownloads) {
  if (skippedDownloads.length === 0) {
    return
  }
  console.warn(
    `Catalog operation completed with ${skippedDownloads.length} skipped set${skippedDownloads.length === 1 ? '' : 's'}.`,
  )
  console.table(skippedDownloads)
}

async function main() {
  const options = parseArguments(process.argv.slice(2))

  if (options.available) {
    printAvailableSets(await fetchAvailableSets())
    return
  }

  const catalog = await readCatalog()

  if (options.list) {
    printCatalogIndex(catalog)
    return
  }

  await includeAllRemoteSets(options, catalog)

  if (options.setCodes.length === 0) {
    printUsage()
    process.exitCode = 1
    return
  }

  const requiredSetCodes = options.setCodes.filter(
    (setCode) => options.refresh || options.refreshAll || !catalog.sets[setCode],
  )
  const skippedSetCodes = options.setCodes.filter(
    (setCode) => !requiredSetCodes.includes(setCode),
  )

  for (const setCode of skippedSetCodes) {
    console.log(`Skipping ${setCode}; it is already in the local catalog.`)
  }

  if (requiredSetCodes.length === 0) {
    printCatalogIndex(catalog)
    return
  }

  const result = await downloadRequiredSets(
    requiredSetCodes,
    options,
    catalog,
  )

  if (result.changedCount > 0 || result.metadataUpdatedCount > 0) {
    console.log(`Saved ${catalogPath}`)
  } else {
    console.log('Catalog content is current; no local sets were rewritten.')
  }
  printSkippedDownloads(result.skippedDownloads)
  printCatalogIndex(catalog)
}

main().catch((error) => {
  console.error(`Catalog sync failed: ${error.message}`)
  process.exitCode = 1
})
