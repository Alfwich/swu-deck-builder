const ASPECTS = new Map(
  [
    ['Aggression', '/aspects/aggression.png'],
    ['Command', '/aspects/command.png'],
    ['Cunning', '/aspects/cunning.png'],
    ['Heroism', '/aspects/heroism.png'],
    ['Vigilance', '/aspects/vigilance.png'],
    ['Villainy', '/aspects/villainy.png'],
  ].map(([name, src]) => [name.toLocaleLowerCase(), { name, src }]),
)

const ASPECT_COLORS = new Map([
  ['aggression', '#dc2626'],
  ['command', '#16a34a'],
  ['cunning', '#f59e0b'],
  ['heroism', '#cbd5e1'],
  ['vigilance', '#2563eb'],
  ['villainy', '#475569'],
])

function cardAspectIcons(card) {
  if (!Array.isArray(card?.aspects)) {
    return []
  }

  return card.aspects
    .map((aspect) => ASPECTS.get(String(aspect).trim().toLocaleLowerCase()))
    .filter(Boolean)
}

export function getAspectIcon(aspect) {
  return ASPECTS.get(String(aspect).trim().toLocaleLowerCase()) ?? null
}

export function getDeckAspectIcons(deck) {
  return [deck?.leader, deck?.secondLeader, deck?.base].flatMap(cardAspectIcons)
}

export function getCardAspectPenalty(card, deck) {
  const provided = new Map()
  const required = new Map()

  getDeckAspectIcons(deck).forEach((icon) => {
    provided.set(icon.name, (provided.get(icon.name) ?? 0) + 1)
  })
  cardAspectIcons(card).forEach((icon) => {
    required.set(icon.name, (required.get(icon.name) ?? 0) + 1)
  })

  const missingIconCount = [...required].reduce(
    (total, [aspect, count]) =>
      total + Math.max(0, count - (provided.get(aspect) ?? 0)),
    0,
  )

  return missingIconCount * 2
}

export function getDeckAspectGradient(deck) {
  const colors = [
    ...new Set(
      getDeckAspectIcons(deck)
        .map((icon) => ASPECT_COLORS.get(icon.name.toLocaleLowerCase()))
        .filter(Boolean),
    ),
  ]

  if (colors.length === 0) {
    return 'none'
  }

  if (colors.length === 1) {
    return `linear-gradient(105deg, ${colors[0]} 0%, ${colors[0]} 100%)`
  }

  return `linear-gradient(105deg, ${colors
    .map(
      (color, index) =>
        `${color} ${Math.round((index / (colors.length - 1)) * 100)}%`,
    )
    .join(', ')})`
}
