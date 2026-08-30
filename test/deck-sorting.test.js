import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getUniqueDeckAspects,
  sortDeckCardGroups,
} from '../src/deck-sorting.js'

function group(name, cost, aspects = [], subtitle = '') {
  return {
    key: `${name}|${subtitle}`,
    card: { name, subtitle, cost, aspects },
  }
}

test('lists unique draw-deck aspects in stable game order', () => {
  assert.deepEqual(
    getUniqueDeckAspects([
      { aspects: ['Cunning', 'Villainy'] },
      { aspects: ['Command', 'Cunning'] },
      { aspects: [] },
    ]),
    ['Command', 'Cunning', 'Villainy'],
  )
})

test('sorts grouped cards by ascending or descending cost with missing costs last', () => {
  const groups = [
    group('Three', 3),
    group('Unknown', null),
    group('One', 1),
    group('Another three', 3),
  ]

  assert.deepEqual(
    sortDeckCardGroups(groups, { costDirection: 'asc' }).map(
      ({ card }) => card.name,
    ),
    ['One', 'Another three', 'Three', 'Unknown'],
  )
  assert.deepEqual(
    sortDeckCardGroups(groups, { costDirection: 'desc' }).map(
      ({ card }) => card.name,
    ),
    ['Another three', 'Three', 'One', 'Unknown'],
  )
})

test('uses card identity to give equivalent shuffled decks the same layout', () => {
  const cards = [
    group('Zulu Squadron', 2),
    group('Echo', 2, [], 'Valiant ARC Trooper'),
    group('Alpha Strike', 2),
    group('Echo', 2, [], 'Restored'),
  ]
  const displayNames = (groups) =>
    sortDeckCardGroups(groups).map(
      ({ card }) => `${card.name} — ${card.subtitle}`,
    )

  assert.deepEqual(displayNames(cards), displayNames([...cards].reverse()))
  assert.deepEqual(displayNames(cards), [
    'Alpha Strike — ',
    'Echo — Restored',
    'Echo — Valiant ARC Trooper',
    'Zulu Squadron — ',
  ])
})

test('prioritizes a selected aspect and applies cost sorting within both groups', () => {
  const groups = [
    group('Neutral two', 2),
    group('Command four', 4, ['Command']),
    group('Neutral one', 1),
    group('Command one', 1, ['Command', 'Heroism']),
  ]

  assert.deepEqual(
    sortDeckCardGroups(groups, {
      costDirection: 'asc',
      priorityAspect: 'Command',
    }).map(({ card }) => card.name),
    ['Command one', 'Command four', 'Neutral one', 'Neutral two'],
  )
})
