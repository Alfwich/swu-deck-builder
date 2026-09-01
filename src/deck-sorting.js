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

function normalizedAspects(card) {
  return Array.isArray(card?.aspects)
    ? card.aspects.map((aspect) => String(aspect).trim()).filter(Boolean)
    : []
}

export function getUniqueDeckAspects(cards) {
  const aspects = new Set(cards.flatMap(normalizedAspects))
  const known = ASPECT_ORDER.filter((aspect) => aspects.delete(aspect))
  return [...known, ...[...aspects].sort((left, right) => left.localeCompare(right))]
}

function comparePriorityAspect(left, right, priorityAspect) {
  if (!priorityAspect) {
    return 0
  }
  const leftMatches = normalizedAspects(left.group.card).includes(priorityAspect)
  const rightMatches = normalizedAspects(right.group.card).includes(priorityAspect)
  return leftMatches === rightMatches ? 0 : leftMatches ? -1 : 1
}

function compareCost(left, right, costDirection) {
  if (!['asc', 'desc'].includes(costDirection)) {
    return 0
  }

  const leftCost = left.group.card?.cost
  const rightCost = right.group.card?.cost
  const leftHasCost = Number.isFinite(leftCost)
  const rightHasCost = Number.isFinite(rightCost)
  if (leftHasCost !== rightHasCost) {
    return leftHasCost ? -1 : 1
  }
  if (!leftHasCost || leftCost === rightCost) {
    return 0
  }
  return (leftCost - rightCost) * (costDirection === 'desc' ? -1 : 1)
}

function normalizedSetPart(value) {
  return String(value ?? '').trim()
}

function compareSet(left, right, setDirection) {
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
  if (setComparison !== 0) {
    return setComparison * direction
  }

  const leftCardNumber = normalizedSetPart(
    leftCard?.cardNumber ?? leftCard?.Number,
  )
  const rightCardNumber = normalizedSetPart(
    rightCard?.cardNumber ?? rightCard?.Number,
  )

  return CARD_NAME_COLLATOR.compare(leftCardNumber, rightCardNumber) * direction
}

function compareCardIdentity(left, right) {
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
  groups,
  {
    priorityAspect = null,
    sortDirection = 'none',
    sortKey = 'cost',
  } = {},
) {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      return (
        comparePriorityAspect(left, right, priorityAspect) ||
        (sortKey === 'set'
          ? compareSet(left, right, sortDirection)
          : compareCost(left, right, sortDirection)) ||
        compareCardIdentity(left, right) ||
        left.index - right.index
      )
    })
    .map(({ group }) => group)
}
