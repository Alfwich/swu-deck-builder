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

function cardCopyLimit(card) {
  const text = `${card.FrontText ?? ''}\n${card.BackText ?? ''}`
  const match = text.match(/up to\s+(\d+)\s+copies of this card/i)
  return match ? Number(match[1]) : 3
}

function normalizeCard(card) {
  return {
    setCode: card.Set ?? null,
    cardNumber: card.Number ?? null,
    maxCopies: cardCopyLimit(card),
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

export function getCatalogCards(catalog) {
  return catalog.database
    ? Object.values(catalog.database.sets).flatMap((set) =>
        Array.isArray(set.cards) ? set.cards : [],
      )
    : (catalog.cards ?? []).map((card) => card.raw ?? card)
}

export function createCatalogCardReferenceIndex(catalog) {
  const playableCards = getCatalogCards(catalog).filter(
    (card) => card?.Set && card?.Number && card?.FrontArt,
  )
  const normalCards = playableCards.filter(
    (card) => !card.VariantType || card.VariantType === 'Normal',
  )
  const candidates = normalCards.length > 0 ? normalCards : playableCards

  return new Map(
    candidates.map((card) => [
      `${String(card.Set).trim().toUpperCase()}_${String(card.Number).trim()}`,
      toDeckCard(card),
    ]),
  )
}

function shuffle(cards) {
  const shuffled = [...cards]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ]
  }

  return shuffled
}

export function toDeckCard(card) {
  const marketPrice = toNullableNumber(card.MarketPrice)
  const lowPrice = toNullableNumber(card.LowPrice)

  return {
    id: [card.Set, card.Number, card.VariantType].filter(Boolean).join('-'),
    name: card.Name ?? 'Unknown card',
    subtitle: card.Subtitle ?? null,
    type: card.Type,
    url: card.FrontArt,
    backUrl: card.BackArt ?? null,
    setCode: card.Set ?? null,
    cardNumber: card.Number ?? null,
    maxCopies: cardCopyLimit(card),
    aspects: Array.isArray(card.Aspects) ? card.Aspects : [],
    cost: toNullableNumber(card.Cost),
    nominalPrice: marketPrice ?? lowPrice,
    priceSource: marketPrice !== null ? 'market' : lowPrice !== null ? 'low' : null,
  }
}

export function createDeckAspectHydrator(catalog) {
  const aspectsById = new Map(
    getCatalogCards(catalog).flatMap((card) => {
      const deckCard = toDeckCard(card)
      const catalogAlias = `${String(card.Set).trim().toUpperCase()}_${String(
        card.Number,
      ).trim()}`
      return [
        [deckCard.id, deckCard.aspects],
        [catalogAlias, deckCard.aspects],
      ]
    }),
  )

  function hydrateCard(card) {
    if (!card || (Array.isArray(card.aspects) && card.aspects.length > 0)) {
      return card
    }

    const catalogAlias =
      card.setCode && card.cardNumber
        ? `${String(card.setCode).trim().toUpperCase()}_${String(
            card.cardNumber,
          ).trim()}`
        : null
    const aspects =
      aspectsById.get(card.id) ??
      (catalogAlias ? aspectsById.get(catalogAlias) : null)
    return aspects ? { ...card, aspects } : card
  }

  return (deck) => ({
    ...deck,
    leader: hydrateCard(deck.leader),
    secondLeader: hydrateCard(deck.secondLeader),
    base: hydrateCard(deck.base),
    drawDeck: (deck.drawDeck ?? []).map(hydrateCard),
    sideboard: (deck.sideboard ?? []).map(hydrateCard),
  })
}

function getCardGroupKey(card) {
  return [card.type, card.name, card.subtitle ?? '']
    .map((value) => String(value).trim().toLocaleLowerCase())
    .join('\u0000')
}

export function groupDeckCards(cards) {
  const groups = new Map()

  cards.forEach((card) => {
    const key = getCardGroupKey(card)
    const existingGroup = groups.get(key)

    if (existingGroup) {
      existingGroup.cards.push(card)
      existingGroup.count += 1
      return
    }

    groups.set(key, {
      key,
      card,
      cards: [card],
      count: 1,
    })
  })

  return [...groups.values()]
}

export function selectRandomCardFaces(catalog, count = 35) {
  const sourceCards = getCatalogCards(catalog)
  const uniqueFaces = [
    ...new Map(
      sourceCards
        .filter(
          (card) =>
            card?.FrontArt &&
            !['leader', 'base'].includes(card.Type?.toLowerCase()),
        )
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

  return shuffle(candidates).slice(0, count)
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
      'The packed catalog is unavailable. Run npm run catalog first.',
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
