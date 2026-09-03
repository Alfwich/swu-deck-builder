import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  analyzeDeck,
  getCardTypeDistribution,
  getSetDistribution,
} from '../src/web/decks/deck-analysis.js'

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

test('getSetDistribution normalizes and counts main-deck printing sets', () => {
  assert.deepEqual(
    getSetDistribution([
      { setCode: 'sor' },
      { setCode: 'SHD' },
      { setCode: ' SOR ' },
      { setCode: null },
    ]),
    [
      { id: 'shd', label: 'SHD', count: 1 },
      { id: 'sor', label: 'SOR', count: 2 },
      { id: 'unknown', label: 'Unknown', count: 1 },
    ],
  )
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
  assert.deepEqual(analysis.setDistribution, [
    { id: 'unknown', label: 'Unknown', count: 3 },
  ])
  assert.equal(analysis.costBuckets[2].count, 2)
  assert.equal(analysis.costBuckets[4].count, 0)
  assert.equal(analysis.costBuckets[9].count, 1)
  assert.equal(analysis.averageCost, 5)
  assert.equal(analysis.nominalValue, 12)
})

test('deck value is identified as estimated with explanatory hover text', async () => {
  const component = await readFile(
    new URL('../src/web/decks/deck-analysis-view.tsx', import.meta.url),
    'utf8',
  )

  assert.match(component, /aria-label={`Estimated value \${nominalValue}`}/)
  assert.match(component, />\s*\* estimated\s*<\/small>/)
  assert.match(component, /title="This is an estimated value\."/)
})

test('set distribution pie appears before card types and responds above the cost curve', async () => {
  const [component, styles] = await Promise.all([
    readFile(
      new URL('../src/web/decks/deck-analysis-view.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/web/styles/deck-workspace.css', import.meta.url),
      'utf8',
    ),
  ])
  const layout = component.match(
    /<div className="deck-analysis__layout">([\s\S]+?)<\/div>/,
  )?.[1]

  assert.ok(layout)
  assert.ok(
    layout.indexOf('<SetDistributionChart') <
      layout.indexOf('<CardTypeChart'),
  )
  assert.match(component, /ariaLabel="Main deck set distribution"/)
  assert.match(component, /title="Sets"/)
  assert.match(
    styles,
    /\.deck-analysis__layout\s*{[^}]*grid-template-columns:\s*minmax\(9rem, 10rem\) minmax\(10\.5rem, 12rem\) minmax\(16rem, 1fr\)/,
  )
  assert.match(
    styles,
    /@container \(max-width: 38rem\)[\s\S]+?\.cost-curve\s*{[^}]*grid-column:\s*1 \/ -1/,
  )
})
