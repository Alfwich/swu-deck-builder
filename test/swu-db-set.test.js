import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchSwuDbSet } from '../scripts/swu-db-set.mjs'

const baseUrl = 'https://api.example.test'
const sourceUrl = `${baseUrl}/cards/sor?format=json&order=setnumber&dir=asc`
const cards = [{ Set: 'SOR', Number: '001', Name: 'Leader' }]

test('SWUDB set refresh sends validators and honors 304 responses', async () => {
  let request
  const result = await fetchSwuDbSet({
    baseUrl,
    previous: {
      sourceUrl,
      etag: '"set-v1"',
      lastModified: 'Fri, 28 Aug 2026 00:00:00 GMT',
    },
    setCode: 'SOR',
    async fetchImpl(url, options) {
      request = { url, options }
      return new Response(null, { status: 304 })
    },
  })

  assert.equal(request.url, sourceUrl)
  assert.equal(request.options.headers['If-None-Match'], '"set-v1"')
  assert.equal(
    request.options.headers['If-Modified-Since'],
    'Fri, 28 Aug 2026 00:00:00 GMT',
  )
  assert.equal(result.status, 'not-modified')
})

test('SWUDB set refresh falls back to its content hash', async () => {
  const initial = await fetchSwuDbSet({
    baseUrl,
    setCode: 'SOR',
    now: () => new Date('2026-08-28T01:00:00.000Z'),
    async fetchImpl() {
      return Response.json(
        { data: cards, total_cards: 1 },
        { headers: { etag: '"set-v1"' } },
      )
    },
  })
  const unchanged = await fetchSwuDbSet({
    baseUrl,
    previous: initial.indexEntry,
    setCode: 'SOR',
    async fetchImpl() {
      return Response.json(
        { data: cards, total_cards: 1 },
        { headers: { etag: '"set-v2"' } },
      )
    },
  })

  assert.equal(initial.status, 'updated')
  assert.equal(unchanged.status, 'not-modified')
  assert.equal(unchanged.metadataChanged, true)
  assert.equal(unchanged.indexEntry.syncedAt, initial.indexEntry.syncedAt)
  assert.equal(unchanged.indexEntry.etag, '"set-v2"')
})

test('SWUDB set refresh returns new content and validator metadata', async () => {
  const result = await fetchSwuDbSet({
    baseUrl,
    previous: {
      sourceUrl,
      contentHash: 'sha256:old',
      syncedAt: '2026-08-27T00:00:00.000Z',
    },
    setCode: 'SOR',
    now: () => new Date('2026-08-28T02:00:00.000Z'),
    async fetchImpl() {
      return Response.json(
        { data: cards, total_cards: 1 },
        {
          headers: {
            etag: '"set-v2"',
            'last-modified': 'Fri, 28 Aug 2026 02:00:00 GMT',
          },
        },
      )
    },
  })

  assert.equal(result.status, 'updated')
  assert.equal(result.indexEntry.etag, '"set-v2"')
  assert.equal(result.indexEntry.lastModified, 'Fri, 28 Aug 2026 02:00:00 GMT')
  assert.equal(result.indexEntry.syncedAt, '2026-08-28T02:00:00.000Z')
  assert.deepEqual(result.set.cards, cards)
})
