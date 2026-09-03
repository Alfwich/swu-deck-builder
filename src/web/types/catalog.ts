export type CardPriceSource = 'market' | 'low' | null

export interface DeckCard {
  id: string
  name: string
  subtitle: string | null
  type: string
  url: string | null | undefined
  backUrl: string | null
  setCode: string | null
  cardNumber: string | number | null
  variantType: string | null
  maxCopies: number
  aspects: string[]
  cost: number | null
  nominalPrice: number | null
  priceSource: CardPriceSource
}

export interface RawCatalogCard {
  Set?: string | null
  Number?: string | number | null
  VariantType?: string | null
  Name?: string | null
  Subtitle?: string | null
  Type?: string | null
  FrontArt?: string | null
  BackArt?: string | null
  FrontText?: string | null
  BackText?: string | null
  Aspects?: unknown
  Traits?: unknown
  Arenas?: unknown
  Keywords?: unknown
  Cost?: unknown
  Power?: unknown
  HP?: unknown
  MarketPrice?: unknown
  LowPrice?: unknown
  FoilPrice?: unknown
  [field: string]: unknown
}

export type PlayableRawCatalogCard = RawCatalogCard & {
  Set: string
  Number: string | number
  Type: string
}

export interface NormalizedCatalogCard {
  setCode: string | null
  cardNumber: string | number | null
  maxCopies: number
  name: string | null
  subtitle: string | null
  type: string | null
  aspects: string[]
  traits: string[]
  arenas: string[]
  keywords: string[]
  cost: number | null
  power: number | null
  hp: number | null
  marketPrice: number | null
  lowPrice: number | null
  foilPrice: number | null
  raw: RawCatalogCard
}

export interface CatalogSet {
  cards?: RawCatalogCard[]
  [field: string]: unknown
}

export interface PackedCatalogDatabase {
  schemaVersion: number
  setIndex: unknown
  sets: Record<string, CatalogSet>
}

export interface Catalog {
  sourceUrl: string
  printingCount: number
  setCount: number
  loadedAt: Date
  reportedTotal?: number | null
  cards?: NormalizedCatalogCard[]
  database?: PackedCatalogDatabase
}

export interface CardFace {
  url: string
  name: string
  variantType?: string | null
}

export interface DeckCardGroup {
  key: string
  card: DeckCard
  cards: DeckCard[]
  count: number
}

export type CardReferenceMap = Map<string, DeckCard>
export type ReadonlyCardReferenceMap = ReadonlyMap<string, DeckCard>
