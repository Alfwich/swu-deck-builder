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

export function sortDeckCardGroups(
  groups,
  { costDirection = 'none', priorityAspect = null } = {},
) {
  const direction = costDirection === 'desc' ? -1 : 1

  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      if (priorityAspect) {
        const leftMatches = normalizedAspects(left.group.card).includes(
          priorityAspect,
        )
        const rightMatches = normalizedAspects(right.group.card).includes(
          priorityAspect,
        )

        if (leftMatches !== rightMatches) {
          return leftMatches ? -1 : 1
        }
      }

      if (costDirection === 'asc' || costDirection === 'desc') {
        const leftCost = left.group.card?.cost
        const rightCost = right.group.card?.cost
        const leftHasCost = Number.isFinite(leftCost)
        const rightHasCost = Number.isFinite(rightCost)

        if (leftHasCost !== rightHasCost) {
          return leftHasCost ? -1 : 1
        }
        if (leftHasCost && leftCost !== rightCost) {
          return (leftCost - rightCost) * direction
        }
      }

      return left.index - right.index
    })
    .map(({ group }) => group)
}
