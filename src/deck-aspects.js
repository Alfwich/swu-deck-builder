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

function cardAspectIcons(card) {
  if (!Array.isArray(card?.aspects)) {
    return []
  }

  return card.aspects
    .map((aspect) => ASPECTS.get(String(aspect).trim().toLocaleLowerCase()))
    .filter(Boolean)
}

export function getDeckAspectIcons(deck) {
  return [deck?.leader, deck?.secondLeader, deck?.base].flatMap(cardAspectIcons)
}
