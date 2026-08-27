const CATALOG_URL =
  '/api/swu-db/cards/sor?format=json&order=setnumber&dir=asc'
const PACKED_CATALOG_URL = '/catalog.json.gz'

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeCard(card) {
  return {
    setCode: card.Set ?? null,
    cardNumber: card.Number ?? null,
    name: card.Name ?? null,
    subtitle: card.Subtitle ?? null,
    type: card.Type ?? null,
    aspects: Array.isArray(card.Aspects) ? card.Aspects : [],
    traits: Array.isArray(card.Traits) ? card.Traits : [],
    arenas: Array.isArray(card.Arenas) ? card.Arenas : [],
    keywords: Array.isArray(card.Keywords) ? card.Keywords : [],
    cost: toNullableNumber(card.Cost),
    power: toNullableNumber(card.Power),
    hp: toNullableNumber(card.HP),
    marketPrice: toNullableNumber(card.MarketPrice),
    lowPrice: toNullableNumber(card.LowPrice),
    foilPrice: toNullableNumber(card.FoilPrice),
    raw: card,
  }
}

export function selectRandomCardFaces(catalog, count = 35) {
  const sourceCards = catalog.database
    ? Object.values(catalog.database.sets).flatMap((set) =>
        Array.isArray(set.cards) ? set.cards : [],
      )
    : (catalog.cards ?? []).map((card) => card.raw ?? card)
  const uniqueFaces = [
    ...new Map(
      sourceCards
        .filter((card) => card?.FrontArt)
        .map((card) => [
          card.FrontArt,
          {
            url: card.FrontArt,
            name: [card.Name, card.Subtitle].filter(Boolean).join(' — '),
            variantType: card.VariantType,
          },
        ]),
    ).values(),
  ]
  const normalFaces = uniqueFaces.filter(
    (face) => !face.variantType || face.variantType === 'Normal',
  )
  const candidates = normalFaces.length >= count ? normalFaces : uniqueFaces

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[candidates[index], candidates[randomIndex]] = [
      candidates[randomIndex],
      candidates[index],
    ]
  }

  return candidates.slice(0, count)
}

export async function loadSorCatalog({ signal } = {}) {
  const response = await fetch(CATALOG_URL, { signal })

  if (!response.ok) {
    throw new Error(`Catalog request failed with HTTP ${response.status}.`)
  }

  const payload = await response.json()

  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('The catalog source returned an unexpected response.')
  }

  return {
    sourceUrl: CATALOG_URL,
    reportedTotal: toNullableNumber(payload.total_cards),
    printingCount: payload.data.length,
    setCount: 1,
    cards: payload.data.map(normalizeCard),
    loadedAt: new Date(),
  }
}

export async function unpackCatalog(packedData) {
  const bytes =
    packedData instanceof Uint8Array
      ? packedData
      : new Uint8Array(packedData)
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  let json

  if (isGzip) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser does not support gzip decompression.')
    }

    const decompressedStream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
    json = await new Response(decompressedStream).text()
  } else {
    json = new TextDecoder().decode(bytes)
  }

  const catalog = JSON.parse(json)

  if (
    catalog?.schemaVersion !== 1 ||
    !catalog.setIndex ||
    !catalog.sets
  ) {
    throw new Error('The packed catalog has an unsupported schema.')
  }

  return catalog
}

export async function loadPackedCatalog({ signal } = {}) {
  const response = await fetch(PACKED_CATALOG_URL, { signal })

  if (!response.ok) {
    throw new Error(
      'The packed catalog is unavailable. Run npm run catalog:pack first.',
    )
  }

  const database = await unpackCatalog(await response.arrayBuffer())
  const sets = Object.values(database.sets)

  return {
    sourceUrl: PACKED_CATALOG_URL,
    printingCount: sets.reduce(
      (total, set) => total + (Array.isArray(set.cards) ? set.cards.length : 0),
      0,
    ),
    setCount: sets.length,
    database,
    loadedAt: new Date(),
  }
}
