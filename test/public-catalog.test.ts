import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'

import {
  createCatalogPaths,
  ensureCatalog,
  syncPublicCatalog,
} from '../scripts/catalog.js'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

function sampleCatalog(name = 'Public card') {
  return {
    schemaVersion: 1,
    source: { name: 'test' },
    updatedAt: '2026-08-28T00:00:00.000Z',
    setIndex: { TST: {} },
    sets: {
      TST: {
        cards: [{ Set: 'TST', Number: '001', Name: name, Type: 'Unit' }],
      },
    },
  }
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'swu-public-catalog-'))
  return { paths: createCatalogPaths(root), root }
}

async function write(path, contents) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
}

const silentLogger = {
  log() {},
  warn() {},
}

test('public catalog sync downloads, validates, installs, and caches the archive', async () => {
  const fixture = await createFixture()
  const archive = await gzipAsync(JSON.stringify(sampleCatalog()))

  try {
    const result = await syncPublicCatalog({
      fetchImpl: async () =>
        new Response(archive, {
          headers: {
            etag: '"catalog-v1"',
            'last-modified': 'Fri, 28 Aug 2026 00:00:00 GMT',
          },
        }),
      logger: silentLogger,
      paths: fixture.paths,
      url: 'https://example.test/catalog.json.gz',
    })

    assert.equal(result.cacheState, 'downloaded')
    assert.equal(result.cardCount, 1)
    assert.deepEqual(
      JSON.parse(await readFile(fixture.paths.catalogPath, 'utf8')),
      sampleCatalog(),
    )
    assert.deepEqual(
      await readFile(fixture.paths.packedCatalogPath),
      await readFile(fixture.paths.cacheArchivePath),
    )

    const metadata = JSON.parse(
      await readFile(fixture.paths.cacheMetadataPath, 'utf8'),
    )
    assert.equal(metadata.etag, '"catalog-v1"')
    assert.equal(metadata.url, 'https://example.test/catalog.json.gz')
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('public catalog sync uses conditional headers and reinstalls a cached 304 response', async () => {
  const fixture = await createFixture()
  const archive = await gzipAsync(JSON.stringify(sampleCatalog()))

  try {
    await syncPublicCatalog({
      fetchImpl: async () =>
        new Response(archive, {
          headers: {
            etag: '"catalog-v1"',
            'last-modified': 'Fri, 28 Aug 2026 00:00:00 GMT',
          },
        }),
      logger: silentLogger,
      paths: fixture.paths,
      url: 'https://example.test/catalog.json.gz',
    })
    await write(
      fixture.paths.catalogPath,
      JSON.stringify(sampleCatalog('Private card')),
    )

    let requestHeaders
    const result = await syncPublicCatalog({
      fetchImpl: async (_url, options) => {
        requestHeaders = options.headers
        return new Response(null, { status: 304 })
      },
      logger: silentLogger,
      paths: fixture.paths,
      url: 'https://example.test/catalog.json.gz',
    })

    assert.equal(result.cacheState, 'not-modified')
    assert.equal(requestHeaders['If-None-Match'], '"catalog-v1"')
    assert.equal(
      requestHeaders['If-Modified-Since'],
      'Fri, 28 Aug 2026 00:00:00 GMT',
    )
    assert.equal(
      JSON.parse(await readFile(fixture.paths.catalogPath, 'utf8')).sets.TST
        .cards[0].Name,
      'Public card',
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('catalog ensure keeps a valid local catalog and packs it without fetching', async () => {
  const fixture = await createFixture()
  const localCatalog = sampleCatalog('Local card')
  await write(fixture.paths.catalogPath, JSON.stringify(localCatalog))
  await write(
    fixture.paths.packedCatalogPath,
    await gzipAsync(JSON.stringify(sampleCatalog('Stale packed card'))),
  )

  try {
    const result = await ensureCatalog({
      fetchImpl: async () => {
        throw new Error('fetch should not be called')
      },
      logger: silentLogger,
      paths: fixture.paths,
    })

    assert.equal(result.cacheState, 'local')
    const packedCatalog = JSON.parse(
      (await gunzipAsync(await readFile(fixture.paths.packedCatalogPath))).toString(
        'utf8',
      ),
    )
    assert.deepEqual(packedCatalog, localCatalog)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('catalog ensure restores a missing local catalog from cache when offline', async () => {
  const fixture = await createFixture()
  const archive = await gzipAsync(JSON.stringify(sampleCatalog()))

  try {
    await syncPublicCatalog({
      fetchImpl: async () =>
        new Response(archive, { headers: { etag: '"catalog-v1"' } }),
      logger: silentLogger,
      paths: fixture.paths,
      url: 'https://example.test/catalog.json.gz',
    })
    await rm(fixture.paths.catalogPath)
    await rm(fixture.paths.packedCatalogPath)

    const result = await ensureCatalog({
      fetchImpl: async () => {
        throw new Error('offline')
      },
      logger: silentLogger,
      paths: fixture.paths,
      url: 'https://example.test/catalog.json.gz',
    })

    assert.equal(result.cacheState, 'stale-cache')
    assert.deepEqual(
      JSON.parse(await readFile(fixture.paths.catalogPath, 'utf8')),
      sampleCatalog(),
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('public catalog sync does not replace local data with an invalid download', async () => {
  const fixture = await createFixture()
  const localCatalog = sampleCatalog('Keep me')
  await write(fixture.paths.catalogPath, JSON.stringify(localCatalog))
  const invalidArchive = await gzipAsync(JSON.stringify({ schemaVersion: 2 }))

  try {
    await assert.rejects(
      syncPublicCatalog({
        fetchImpl: async () => new Response(invalidArchive),
        logger: silentLogger,
        paths: fixture.paths,
        url: 'https://example.test/catalog.json.gz',
      }),
      /unsupported schema/,
    )
    assert.deepEqual(
      JSON.parse(await readFile(fixture.paths.catalogPath, 'utf8')),
      localCatalog,
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})
