import type {
  CardFace,
  CardReferenceMap,
  Catalog,
  DeckCard,
  DeckCardGroup,
  NormalizedCatalogCard,
  PackedCatalogDatabase,
  PlayableRawCatalogCard,
  RawCatalogCard,
} from '../types/catalog.js'
import type { Deck } from '../types/deck.js'

const CATALOG_URL =
  '/api/swu-db/cards/sor?format=json&order=setnumber&dir=asc'
const PACKED_CATALOG_URL = '/catalog.json.gz'

interface CatalogCardIdentity {
  Set?: unknown
  Number?: unknown
  Type?: unknown
  Name?: unknown
  Subtitle?: unknown
  setCode?: unknown
  cardNumber?: unknown
  type?: unknown
  name?: unknown
  subtitle?: unknown
}

interface CatalogPayload {
  data: RawCatalogCard[]
  total_cards?: unknown
}

type CatalogArtCard = PlayableRawCatalogCard & { FrontArt: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPlayableRawCatalogCard(
  card: RawCatalogCard,
): card is CatalogArtCard {
  return Boolean(card.Set && card.Number && card.Type && card.FrontArt)
}

function isCatalogPayload(value: unknown): value is CatalogPayload {
  return isObject(value) && Array.isArray(value.data)
}

function isPackedCatalogDatabase(value: unknown): value is PackedCatalogDatabase {
  return isObject(value) &&
    value.schemaVersion === 1 &&
    Boolean(value.setIndex) &&
    isObject(value.sets)
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function toNullableNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function cardCopyLimit(card: RawCatalogCard) {
  const text = `${card.FrontText ?? ''}\n${card.BackText ?? ''}`
  const match = text.match(/up to\s+(\d+)\s+copies of this card/i)
  return match ? Number(match[1]) : 3
}

export function getCatalogCardId(card: CatalogCardIdentity | null | undefined) {
  const setCode = String(card?.Set ?? card?.setCode ?? '').trim().toUpperCase()
  const cardNumber = String(card?.Number ?? card?.cardNumber ?? '').trim()
  return setCode && cardNumber ? `${setCode}_${cardNumber}` : null
}

export function getGameplayCardKey(
  card: CatalogCardIdentity | null | undefined,
) {
  return [card?.type ?? card?.Type, card?.name ?? card?.Name, card?.subtitle ?? card?.Subtitle ?? '']
    .map((value) => String(value ?? '').trim().toLocaleLowerCase())
    .join('\u0000')
}

function normalizeCard(card: RawCatalogCard): NormalizedCatalogCard {
  return {
    setCode: card.Set ?? null,
    cardNumber: card.Number ?? null,
    maxCopies: cardCopyLimit(card),
    name: card.Name ?? null,
    subtitle: card.Subtitle ?? null,
    type: card.Type ?? null,
    aspects: stringList(card.Aspects),
    traits: stringList(card.Traits),
    arenas: stringList(card.Arenas),
    keywords: stringList(card.Keywords),
    cost: toNullableNumber(card.Cost),
    power: toNullableNumber(card.Power),
    hp: toNullableNumber(card.HP),
    marketPrice: toNullableNumber(card.MarketPrice),
    lowPrice: toNullableNumber(card.LowPrice),
    foilPrice: toNullableNumber(card.FoilPrice),
    raw: card,
  }
}

export function getCatalogCards(catalog: Catalog): RawCatalogCard[] {
  return catalog.database
    ? Object.values(catalog.database.sets).flatMap((set) =>
        Array.isArray(set.cards) ? set.cards : [],
      )
    : (catalog.cards ?? []).map((card) => card.raw ?? card)
}

export function createCatalogCardReferenceIndex(catalog: Catalog): CardReferenceMap {
  const playableCards = getCatalogCards(catalog).filter(
    isPlayableRawCatalogCard,
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

export function createCatalogPrintingIndex(catalog: Catalog): CardReferenceMap {
  return new Map<string, DeckCard>(
    getCatalogCards(catalog)
      .filter(isPlayableRawCatalogCard)
      .map((card) => [
        `${String(card.Set).trim().toUpperCase()}_${String(card.Number).trim()}`,
        toDeckCard(card),
      ]),
  )
}

function shuffle<T>(cards: T[]) {
  const shuffled = [...cards]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    const replacement = shuffled[randomIndex]
    if (current !== undefined && replacement !== undefined) {
      shuffled[index] = replacement
      shuffled[randomIndex] = current
    }
  }

  return shuffled
}

export function toDeckCard(card: PlayableRawCatalogCard): DeckCard {
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
    variantType: card.VariantType ?? null,
    maxCopies: cardCopyLimit(card),
    aspects: stringList(card.Aspects),
    cost: toNullableNumber(card.Cost),
    nominalPrice: marketPrice ?? lowPrice,
    priceSource: marketPrice !== null ? 'market' : lowPrice !== null ? 'low' : null,
  }
}

export function createDeckAspectHydrator(catalog: Catalog) {
  const aspectsById = new Map<string, string[]>(
    getCatalogCards(catalog).filter(isPlayableRawCatalogCard).flatMap((card) => {
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

  function hydrateCard(card: DeckCard): DeckCard
  function hydrateCard(card: null): null
  function hydrateCard(card: DeckCard | null): DeckCard | null
  function hydrateCard(card: DeckCard | null): DeckCard | null {
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

  return (deck: Deck): Deck => ({
    ...deck,
    leader: hydrateCard(deck.leader),
    secondLeader: hydrateCard(deck.secondLeader),
    base: hydrateCard(deck.base),
    drawDeck: (deck.drawDeck ?? []).map((card) => hydrateCard(card)),
    sideboard: (deck.sideboard ?? []).map((card) => hydrateCard(card)),
  })
}

function getCardGroupKey(card: DeckCard) {
  return getGameplayCardKey(card)
}

export function groupDeckCards(cards: DeckCard[]): DeckCardGroup[] {
  const groups = new Map<string, DeckCardGroup>()

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

export function selectRandomCardFaces(catalog: Catalog, count = 35): CardFace[] {
  const sourceCards = getCatalogCards(catalog)
  const uniqueFaces = [
    ...new Map(
      sourceCards
        .filter(
          (card) =>
            isPlayableRawCatalogCard(card) &&
            !['leader', 'base'].includes(card.Type.toLowerCase()),
        )
        .filter(isPlayableRawCatalogCard)
        .map((card): [string, CardFace] => [
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

export async function loadSorCatalog(
  { signal }: { signal?: AbortSignal } = {},
): Promise<Catalog> {
  const response = await fetch(CATALOG_URL, { signal })

  if (!response.ok) {
    throw new Error(`Catalog request failed with HTTP ${response.status}.`)
  }

  const payload: unknown = await response.json()

  if (!isCatalogPayload(payload)) {
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

export async function unpackCatalog(
  packedData: ArrayBuffer | Uint8Array,
): Promise<PackedCatalogDatabase> {
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

    const decompressedStream = new Blob([new Uint8Array(bytes)])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
    json = await new Response(decompressedStream).text()
  } else {
    json = new TextDecoder().decode(bytes)
  }

  const catalog: unknown = JSON.parse(json)

  if (!isPackedCatalogDatabase(catalog)) {
    throw new Error('The packed catalog has an unsupported schema.')
  }

  return catalog
}

export async function loadPackedCatalog(
  { signal }: { signal?: AbortSignal } = {},
): Promise<Catalog> {
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
