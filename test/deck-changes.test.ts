import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCardChange,
  applyCardChanges,
  createCardChangePresentation,
  summarizeCardChanges,
} from '../src/web/decks/changes/deck-changes.js'

function card(id, name = id, type = 'Unit') {
  return { id, name, subtitle: null, type, url: `https://cdn.example/${id}.png` }
}

function deck({ leader = 'LEADER_001', base = 'BASE_001', drawDeck = [] } = {}) {
  return {
    leader: card(leader),
    secondLeader: null,
    base: card(base),
    drawDeck: drawDeck.map((id) => card(id)),
    sideboard: [],
  }
}

test('presents leader and base swaps as visual replacements', () => {
  const before = deck()
  const after = deck({ leader: 'LEADER_002', base: 'BASE_002' })
  const result = createCardChangePresentation(before, after, {
    leader: {
      from: { id: 'LEADER_001', name: 'Old leader' },
      to: { id: 'LEADER_002', name: 'New leader' },
    },
    secondLeader: null,
    base: {
      from: { id: 'BASE_001', name: 'Old base' },
      to: { id: 'BASE_002', name: 'New base' },
    },
    added: [],
    removed: [],
  })

  assert.equal(result.replacements.length, 2)
  assert.equal(result.replacements[0].from.card.url, 'https://cdn.example/LEADER_001.png')
  assert.equal(result.replacements[1].to.card.url, 'https://cdn.example/BASE_002.png')
})

test('resolves SWUDB change IDs to internal card printing artwork', () => {
  const before = deck({ drawDeck: [] })
  const after = deck({ drawDeck: [] })
  before.base = {
    ...card('ASH-014-Normal', 'Old base'),
    setCode: 'ASH',
    cardNumber: '14',
  }
  after.base = {
    ...card('TS26-058-Normal', 'New base'),
    setCode: 'TS26',
    cardNumber: '058',
  }

  const result = createCardChangePresentation(before, after, {
    leader: null,
    secondLeader: null,
    base: {
      from: { id: 'ASH_014', name: 'Old base' },
      to: { id: 'TS26_58', name: 'New base' },
    },
    added: [],
    removed: [],
  })

  assert.equal(result.replacements[0].from.card.id, 'ASH-014-Normal')
  assert.equal(result.replacements[0].to.card.id, 'TS26-058-Normal')
})

test('pairs equal-zone card deltas and leaves unmatched additions and removals', () => {
  const before = deck({ drawDeck: ['OLD', 'OLD', 'EXTRA'] })
  const after = deck({ drawDeck: ['NEW', 'NEW', 'ADDED'] })
  const result = createCardChangePresentation(before, after, {
    leader: null,
    secondLeader: null,
    base: null,
    added: [
      { id: 'NEW', name: 'New card', count: 2, zone: 'drawDeck' },
      { id: 'ADDED', name: 'Added card', count: 1, zone: 'sideboard' },
    ],
    removed: [
      { id: 'OLD', name: 'Old card', count: 2, zone: 'drawDeck' },
      { id: 'EXTRA', name: 'Removed card', count: 1, zone: 'drawDeck' },
    ],
  })

  assert.deepEqual(summarizeCardChanges(result), {
    replacements: 2,
    additions: 1,
    removals: 1,
  })
  assert.equal(result.replacements[0].from.id, 'OLD')
  assert.equal(result.replacements[0].to.id, 'NEW')
  assert.equal(result.additions[0].id, 'ADDED')
  assert.equal(result.removals[0].id, 'EXTRA')
})

test('does not pair cards across draw-deck and sideboard zones', () => {
  const before = deck({ drawDeck: ['OLD'] })
  const after = deck({ drawDeck: ['NEW'] })
  const result = createCardChangePresentation(before, after, {
    leader: null,
    secondLeader: null,
    base: null,
    added: [{ id: 'NEW', name: 'New', count: 1, zone: 'sideboard' }],
    removed: [{ id: 'OLD', name: 'Old', count: 1, zone: 'drawDeck' }],
  })

  assert.equal(result.replacements.length, 0)
  assert.equal(result.additions.length, 1)
  assert.equal(result.removals.length, 1)
})

test('preserves explicit operation types and hydrates their CDN artwork', () => {
  const before = deck({ drawDeck: ['OLD', 'REMOVE'] })
  const after = deck({ drawDeck: ['NEW', 'ADD'] })
  const changes = [
    {
      id: 'change-1',
      type: 'add',
      zone: 'drawDeck',
      count: 1,
      card: { id: 'ADD', name: 'Added card' },
    },
    {
      id: 'change-2',
      type: 'replace',
      zone: 'drawDeck',
      count: 1,
      from: { id: 'OLD', name: 'Old card' },
      to: { id: 'NEW', name: 'New card' },
    },
    {
      id: 'change-3',
      type: 'remove',
      zone: 'drawDeck',
      count: 1,
      card: { id: 'REMOVE', name: 'Removed card' },
    },
  ]

  const result = createCardChangePresentation(before, after, changes)

  assert.equal(result.additions[0].changeId, 'change-1')
  assert.equal(result.additions[0].card.url, 'https://cdn.example/ADD.png')
  assert.equal(result.replacements[0].changeId, 'change-2')
  assert.equal(result.replacements[0].from.card.url, 'https://cdn.example/OLD.png')
  assert.equal(result.replacements[0].to.card.url, 'https://cdn.example/NEW.png')
  assert.equal(result.removals[0].changeId, 'change-3')
})

test('presents card collection operations with catalog references', () => {
  const collectionCard = {
    id: 'TST-COLLECTION',
    name: 'Owned card',
    subtitle: null,
    url: 'https://example.test/owned.jpg',
  }
  const presentation = createCardChangePresentation(
    null,
    null,
    [
      {
        id: 'change-1',
        type: 'add',
        zone: 'collection',
        count: 2,
        card: { id: 'TST_099', name: 'Owned card', subtitle: null },
      },
    ],
    new Map([['TST_099', collectionCard]]),
  )

  assert.equal(presentation.additions[0].zoneLabel, 'Card library')
  assert.equal(presentation.additions[0].card, collectionCard)
})

test('applies one proposed operation or all operations in their original order', () => {
  const before = deck({ drawDeck: ['OLD', 'OLD', 'REMOVE'] })
  const proposed = deck({ drawDeck: ['OLD', 'NEW', 'ADD', 'ADD'] })
  const changes = [
    {
      type: 'replace',
      zone: 'drawDeck',
      count: 1,
      from: { id: 'OLD' },
      to: { id: 'NEW' },
    },
    {
      type: 'remove',
      zone: 'drawDeck',
      count: 1,
      card: { id: 'REMOVE' },
    },
    {
      type: 'add',
      zone: 'drawDeck',
      count: 2,
      card: { id: 'ADD' },
    },
  ]

  const oneChange = applyCardChange(before, changes[0], proposed)
  assert.deepEqual(oneChange.drawDeck.map(({ id }) => id), [
    'OLD',
    'REMOVE',
    'NEW',
  ])

  const allChanges = applyCardChanges(before, changes, proposed)
  assert.deepEqual(allChanges.drawDeck.map(({ id }) => id), [
    'OLD',
    'NEW',
    'ADD',
    'ADD',
  ])
})

test('applies add, replace, and remove operations to the second-leader slot', () => {
  const before = deck()
  const withSecondLeader = {
    ...before,
    secondLeader: card('LEADER_002', 'Second leader', 'Leader'),
  }
  const withReplacement = {
    ...before,
    secondLeader: card('LEADER_003', 'Replacement leader', 'Leader'),
  }

  const added = applyCardChange(
    before,
    {
      type: 'add',
      zone: 'secondLeader',
      count: 1,
      card: { id: 'LEADER_002' },
    },
    withSecondLeader,
  )
  assert.equal(added.secondLeader.id, 'LEADER_002')

  const replaced = applyCardChange(
    added,
    {
      type: 'replace',
      zone: 'secondLeader',
      count: 1,
      from: { id: 'LEADER_002' },
      to: { id: 'LEADER_003' },
    },
    withReplacement,
  )
  assert.equal(replaced.secondLeader.id, 'LEADER_003')

  const removed = applyCardChange(
    replaced,
    {
      type: 'remove',
      zone: 'secondLeader',
      count: 1,
      card: { id: 'LEADER_003' },
    },
    before,
  )
  assert.equal(removed.secondLeader, null)
})

test('applies primary identity additions and replacements but rejects removal', () => {
  const blank = { ...deck(), leader: null, base: null }
  const leader = card('LEADER_001', 'Primary leader', 'Leader')
  const base = card('BASE_001', 'Primary base', 'Base')
  const filledReference = { ...blank, leader, base }

  const withLeader = applyCardChange(
    blank,
    {
      type: 'add',
      zone: 'leader',
      count: 1,
      card: { id: leader.id },
    },
    filledReference,
  )
  const withIdentities = applyCardChange(
    withLeader,
    {
      type: 'add',
      zone: 'base',
      count: 1,
      card: { id: base.id },
    },
    filledReference,
  )

  assert.equal(withIdentities.leader.id, leader.id)
  assert.equal(withIdentities.base.id, base.id)

  const replacement = card('LEADER_002', 'Replacement leader', 'Leader')
  const replaced = applyCardChange(
    withIdentities,
    {
      type: 'replace',
      zone: 'leader',
      count: 1,
      from: { id: leader.id },
      to: { id: replacement.id },
    },
    { ...withIdentities, leader: replacement },
  )
  assert.equal(replaced.leader.id, replacement.id)

  assert.throws(
    () =>
      applyCardChange(
        replaced,
        {
          type: 'remove',
          zone: 'leader',
          count: 1,
          card: { id: replacement.id },
        },
        blank,
      ),
    /only be replaced/,
  )
})
