import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getUniqueDeckAspects,
  sortDeckCardGroups,
} from '../src/deck-sorting.js'

function group(
  name,
  cost,
  aspects = [],
  subtitle = '',
  setCode = null,
  cardNumber = null,
) {
  return {
    key: `${name}|${subtitle}`,
    card: { name, subtitle, cost, aspects, setCode, cardNumber },
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
    sortDeckCardGroups(groups, { sortDirection: 'asc' }).map(
      ({ card }) => card.name,
    ),
    ['One', 'Another three', 'Three', 'Unknown'],
  )
  assert.deepEqual(
    sortDeckCardGroups(groups, { sortDirection: 'desc' }).map(
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
      priorityAspect: 'Command',
      sortDirection: 'asc',
    }).map(({ card }) => card.name),
    ['Command one', 'Command four', 'Neutral one', 'Neutral two'],
  )
})

test('sorts by set and collector number with missing set metadata last', () => {
  const groups = [
    group('Set two, card ten', 1, [], '', 'SET2', '10'),
    group('Unknown set', 1),
    group('Set ten', 1, [], '', 'SET10', '1'),
    group('Set two, card two', 1, [], '', 'SET2', '2'),
    group('Set one', 1, [], '', 'SET1', '20'),
  ]

  assert.deepEqual(
    sortDeckCardGroups(groups, {
      sortDirection: 'asc',
      sortKey: 'set',
    }).map(({ card }) => card.name),
    [
      'Set one',
      'Set two, card two',
      'Set two, card ten',
      'Set ten',
      'Unknown set',
    ],
  )
  assert.deepEqual(
    sortDeckCardGroups(groups, {
      sortDirection: 'desc',
      sortKey: 'set',
    }).map(({ card }) => card.name),
    [
      'Set ten',
      'Set two, card ten',
      'Set two, card two',
      'Set one',
      'Unknown set',
    ],
  )
})
