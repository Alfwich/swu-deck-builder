import { createHash } from 'node:crypto'

function contentHash(cards) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(cards))
    .digest('hex')}`
}

function conditionalHeaders(previous, sourceUrl) {
  if (!previous || previous.sourceUrl !== sourceUrl) return {}

  return {
    ...(previous.etag ? { 'If-None-Match': previous.etag } : {}),
    ...(previous.lastModified
      ? { 'If-Modified-Since': previous.lastModified }
      : {}),
  }
}

function validatorMetadata(response) {
  return {
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  }
}

function metadataChanged(previous, next) {
  return (previous?.etag ?? null) !== (next.etag ?? null) ||
    (previous?.lastModified ?? null) !== (next.lastModified ?? null)
}

export async function fetchSwuDbSet({
  baseUrl,
  fetchImpl = fetch,
  now = () => new Date(),
  previous = null,
  setCode,
} = {}) {
  const sourceUrl = `${baseUrl}/cards/${setCode.toLowerCase()}?format=json&order=setnumber&dir=asc`
  const response = await fetchImpl(sourceUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'swu-deck-builder catalog sync',
      ...conditionalHeaders(previous, sourceUrl),
    },
    signal: AbortSignal.timeout(60_000),
  })

  if (response.status === 304) {
    const responseValidators = validatorMetadata(response)
    const validators = {
      etag: responseValidators.etag ?? previous?.etag ?? null,
      lastModified:
        responseValidators.lastModified ?? previous?.lastModified ?? null,
    }
    return {
      indexEntry: previous ? { ...previous, ...validators } : null,
      metadataChanged: metadataChanged(previous, validators),
      status: 'not-modified',
    }
  }
  if (!response.ok) {
    throw new Error(`${setCode} returned HTTP ${response.status}.`)
  }

  const payload = await response.json()
  if (!payload || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error(`${setCode} returned an unexpected or empty payload.`)
  }

  const hash = contentHash(payload.data)
  const validators = validatorMetadata(response)
  if (previous?.contentHash === hash) {
    return {
      indexEntry: {
        ...previous,
        sourceUrl,
        ...validators,
      },
      metadataChanged: metadataChanged(previous, validators),
      status: 'not-modified',
    }
  }

  const syncedAt = now().toISOString()
  const reportedTotal = Number(payload.total_cards) || payload.data.length
  return {
    indexEntry: {
      sourceUrl,
      reportedTotal,
      printingCount: payload.data.length,
      syncedAt,
      contentHash: hash,
      ...validators,
    },
    metadataChanged: false,
    set: {
      code: setCode,
      sourceUrl,
      reportedTotal,
      syncedAt,
      cards: payload.data,
    },
    status: 'updated',
  }
}
