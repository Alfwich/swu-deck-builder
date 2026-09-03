import type { DeckCard, DeckCardGroup } from '../types/catalog.js'

export type SortDirection = 'asc' | 'desc' | 'none'
type SortableCard = Partial<DeckCard> & {
  Name?: unknown
  Number?: unknown
  Set?: unknown
  Subtitle?: unknown
}
interface IndexedGroup {
  group: DeckCardGroup & { card: SortableCard }
  index: number
}

const ASPECT_ORDER = [
  'Vigilance',
  'Command',
  'Aggression',
  'Cunning',
  'Heroism',
  'Villainy',
]

const CARD_NAME_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

function normalizedAspects(card: SortableCard) {
  return Array.isArray(card?.aspects)
    ? card.aspects.map((aspect) => String(aspect).trim()).filter(Boolean)
    : []
}

export function getUniqueDeckAspects(cards: SortableCard[]) {
  const aspects = new Set(cards.flatMap(normalizedAspects))
  const known = ASPECT_ORDER.filter((aspect) => aspects.delete(aspect))
  return [...known, ...[...aspects].sort((left, right) => left.localeCompare(right))]
}

function comparePriorityAspect(
  left: IndexedGroup,
  right: IndexedGroup,
  priorityAspect: string | null,
) {
  if (!priorityAspect) {
    return 0
  }
  const leftMatches = normalizedAspects(left.group.card).includes(priorityAspect)
  const rightMatches = normalizedAspects(right.group.card).includes(priorityAspect)
  return leftMatches === rightMatches ? 0 : leftMatches ? -1 : 1
}

function compareCost(
  left: IndexedGroup,
  right: IndexedGroup,
  costDirection: SortDirection,
) {
  if (!['asc', 'desc'].includes(costDirection)) {
    return 0
  }

  const leftCost = left.group.card.cost
  const rightCost = right.group.card.cost
  const leftHasCost = Number.isFinite(leftCost)
  const rightHasCost = Number.isFinite(rightCost)
  if (leftHasCost !== rightHasCost) {
    return leftHasCost ? -1 : 1
  }
  if (!leftHasCost || leftCost === rightCost) {
    return 0
  }
  return ((leftCost ?? 0) - (rightCost ?? 0)) *
    (costDirection === 'desc' ? -1 : 1)
}

function normalizedSetPart(value: unknown) {
  return String(value ?? '').trim()
}

function compareSetCode(
  left: IndexedGroup,
  right: IndexedGroup,
  setDirection: SortDirection,
) {
  if (!['asc', 'desc'].includes(setDirection)) {
    return 0
  }

  const leftCard = left.group.card
  const rightCard = right.group.card
  const leftSetCode = normalizedSetPart(leftCard?.setCode ?? leftCard?.Set)
  const rightSetCode = normalizedSetPart(rightCard?.setCode ?? rightCard?.Set)
  const leftHasSet = Boolean(leftSetCode)
  const rightHasSet = Boolean(rightSetCode)

  if (leftHasSet !== rightHasSet) {
    return leftHasSet ? -1 : 1
  }
  if (!leftHasSet) {
    return 0
  }

  const direction = setDirection === 'desc' ? -1 : 1
  const setComparison = CARD_NAME_COLLATOR.compare(leftSetCode, rightSetCode)
  return setComparison * direction
}

function compareSetCardNumber(
  left: IndexedGroup,
  right: IndexedGroup,
  setDirection: SortDirection,
) {
  if (!['asc', 'desc'].includes(setDirection)) {
    return 0
  }

  const leftCard = left.group.card
  const rightCard = right.group.card
  const leftCardNumber = normalizedSetPart(
    leftCard?.cardNumber ?? leftCard?.Number,
  )
  const rightCardNumber = normalizedSetPart(
    rightCard?.cardNumber ?? rightCard?.Number,
  )
  const direction = setDirection === 'desc' ? -1 : 1

  return CARD_NAME_COLLATOR.compare(leftCardNumber, rightCardNumber) * direction
}

function compareCardIdentity(left: IndexedGroup, right: IndexedGroup) {
  const leftCard = left.group.card
  const rightCard = right.group.card
  const leftName = String(leftCard?.name ?? leftCard?.Name ?? '').trim()
  const rightName = String(rightCard?.name ?? rightCard?.Name ?? '').trim()
  const leftSubtitle = String(
    leftCard?.subtitle ?? leftCard?.Subtitle ?? '',
  ).trim()
  const rightSubtitle = String(
    rightCard?.subtitle ?? rightCard?.Subtitle ?? '',
  ).trim()
  const leftKey = String(left.group.key ?? '')
  const rightKey = String(right.group.key ?? '')

  return (
    CARD_NAME_COLLATOR.compare(leftName, rightName) ||
    CARD_NAME_COLLATOR.compare(leftSubtitle, rightSubtitle) ||
    CARD_NAME_COLLATOR.compare(leftKey, rightKey) ||
    (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0)
  )
}

export function sortDeckCardGroups(
  groups: DeckCardGroup[],
  {
    costDirection = 'none',
    priorityAspect = null,
    setDirection = 'none',
  }: {
    costDirection?: SortDirection
    priorityAspect?: string | null
    setDirection?: SortDirection
  } = {},
) {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      return (
        comparePriorityAspect(left, right, priorityAspect) ||
        compareSetCode(left, right, setDirection) ||
        compareCost(left, right, costDirection) ||
        compareSetCardNumber(left, right, setDirection) ||
        compareCardIdentity(left, right) ||
        left.index - right.index
      )
    })
    .map(({ group }) => group)
}
