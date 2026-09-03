import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getCardAspectPenalty,
  getDeckAspectGradient,
  getDeckAspectIcons,
} from '../src/web/decks/deck-aspects.js'

test('calculates aspect penalties from missing icon multiplicity', () => {
  const deck = {
    leader: { aspects: ['Command', 'Villainy'] },
    base: { aspects: ['Command'] },
  }

  assert.equal(getCardAspectPenalty({ aspects: [] }, deck), 0)
  assert.equal(getCardAspectPenalty({ aspects: ['Command'] }, deck), 0)
  assert.equal(
    getCardAspectPenalty({ aspects: ['Command', 'Command'] }, deck),
    0,
  )
  assert.equal(
    getCardAspectPenalty(
      { aspects: ['Command', 'Command', 'Command'] },
      deck,
    ),
    2,
  )
  assert.equal(
    getCardAspectPenalty({ aspects: ['Aggression', 'Heroism'] }, deck),
    4,
  )
})

test('a second leader contributes aspect icons to the available pool', () => {
  const deck = {
    leader: { aspects: ['Heroism'] },
    secondLeader: { aspects: ['Aggression'] },
    base: { aspects: ['Vigilance'] },
  }

  assert.equal(
    getCardAspectPenalty({ aspects: ['Aggression', 'Vigilance'] }, deck),
    0,
  )
})

test('combines leader and base aspects in card order', () => {
  const icons = getDeckAspectIcons({
    leader: { aspects: ['Cunning', 'Villainy'] },
    base: { aspects: ['Command'] },
  })

  assert.deepEqual(icons, [
    { name: 'Cunning', src: '/aspects/cunning.png' },
    { name: 'Villainy', src: '/aspects/villainy.png' },
    { name: 'Command', src: '/aspects/command.png' },
  ])
})

test('preserves duplicate aspects supplied by multiple deck identities', () => {
  const icons = getDeckAspectIcons({
    leader: { aspects: ['Command', 'Villainy'] },
    base: { aspects: ['Command'] },
  })

  assert.deepEqual(
    icons.map((icon) => icon.name),
    ['Command', 'Villainy', 'Command'],
  )
})

test('supports second leaders and ignores unknown or missing aspects', () => {
  const icons = getDeckAspectIcons({
    leader: { aspects: ['Heroism', 'Unknown'] },
    secondLeader: { aspects: ['Aggression'] },
    base: {},
  })

  assert.deepEqual(
    icons.map((icon) => icon.name),
    ['Heroism', 'Aggression'],
  )
})

test('creates an evenly blended gradient from unique deck aspect colors', () => {
  const gradient = getDeckAspectGradient({
    leader: { aspects: ['Cunning', 'Villainy'] },
    base: { aspects: ['Command', 'Cunning'] },
  })

  assert.equal(
    gradient,
    'linear-gradient(105deg, #f59e0b 0%, #475569 50%, #16a34a 100%)',
  )
  assert.equal(getDeckAspectGradient({}), 'none')
})
