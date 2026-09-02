const DEFAULT_COLLECTION_SET_COLOR = '#2dd4bf'

const COLLECTION_SET_COLORS = Object.freeze({
  SOR: '#E83E3F',
  SHD: '#4958C8',
  TWI: '#A9343B',
  JTL: '#F5C518',
  LOF: '#21AEDD',
  SEC: '#7042B5',
  LAW: '#F05A28',
  ASH: '#596F89',
  HMW: '#159447',
})

export function getCollectionSetColor(setCode) {
  const normalizedSetCode = String(setCode ?? '').trim().toUpperCase()
  return COLLECTION_SET_COLORS[normalizedSetCode] ?? DEFAULT_COLLECTION_SET_COLOR
}
