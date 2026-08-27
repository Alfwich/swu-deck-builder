import assert from 'node:assert/strict'
import test from 'node:test'

import { getDeckAspectIcons } from '../src/deck-aspects.js'

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
