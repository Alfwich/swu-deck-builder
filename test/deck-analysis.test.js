import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeDeck, getCardTypeDistribution } from '../src/deck-analysis.js'

test('getCardTypeDistribution groups upgrades as equipment and preserves other types', () => {
  const distribution = getCardTypeDistribution([
    { type: 'Unit' },
    { type: 'unit' },
    { type: 'Event' },
    { type: 'Upgrade' },
    { type: 'Equipment' },
    { type: 'Token' },
    {},
  ])

  assert.deepEqual(distribution, [
    { id: 'units', label: 'Units', count: 2 },
    { id: 'events', label: 'Events', count: 1 },
    { id: 'equipment', label: 'Equipment', count: 2 },
    { id: 'other', label: 'Other', count: 2 },
  ])
})

test('analyzeDeck uses only main-deck cards for type and cost distributions', () => {
  const deck = {
    leader: { type: 'Leader', nominalPrice: 4 },
    secondLeader: null,
    base: { type: 'Base', nominalPrice: 2 },
    drawDeck: [
      { type: 'Unit', cost: 2, nominalPrice: 1 },
      { type: 'Event', cost: 2, nominalPrice: 1.5 },
      { type: 'Upgrade', cost: 11, nominalPrice: 0.5 },
    ],
    sideboard: [{ type: 'Unit', cost: 4, nominalPrice: 3 }],
  }

  const analysis = analyzeDeck(deck)

  assert.deepEqual(
    analysis.cardTypeDistribution.map((category) => category.count),
    [1, 1, 1, 0],
  )
  assert.equal(analysis.costBuckets[2].count, 2)
  assert.equal(analysis.costBuckets[4].count, 0)
  assert.equal(analysis.costBuckets[9].count, 1)
  assert.equal(analysis.averageCost, 5)
  assert.equal(analysis.nominalValue, 12)
})
