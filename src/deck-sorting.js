const ASPECT_ORDER = [
  'Vigilance',
  'Command',
  'Aggression',
  'Cunning',
  'Heroism',
  'Villainy',
]

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

export function sortDeckCardGroups(
  groups,
  { costDirection = 'none', priorityAspect = null } = {},
) {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      return (
        comparePriorityAspect(left, right, priorityAspect) ||
        compareCost(left, right, costDirection) ||
        left.index - right.index
      )
    })
    .map(({ group }) => group)
}
