import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyDeckHistoryDelta,
  createDeckHistoryDelta,
} from '../src/shared/deck-history-format.js'

const first = {
  metadata: { name: 'First', author: 'Leia' },
  leader: 'SOR_005',
  secondLeader: null,
  base: 'SOR_029',
  drawDeck: [
    { id: 'SOR_051', count: 2 },
    { id: 'SOR_058', count: 1 },
  ],
  sideboard: [{ id: 'SOR_058', count: 1 }],
}

test('deck history deltas round-trip every compact deck field', () => {
  const next = {
    leader: 'SHD_001',
    secondLeader: 'SOR_005',
    base: 'SOR_029',
    drawDeck: [
      { id: 'SOR_051', count: 1 },
      { id: 'TWI_100', count: 2 },
    ],
    sideboard: [],
  }

  const delta = createDeckHistoryDelta(first, next)

  assert.deepEqual(delta, {
    metadata: null,
    leader: 'SHD_001',
    secondLeader: 'SOR_005',
    drawDeck: [
      ['SOR_051', -1],
      ['SOR_058', -1],
      ['TWI_100', 2],
    ],
    sideboard: [['SOR_058', -1]],
  })
  assert.deepEqual(applyDeckHistoryDelta(first, delta), next)
})

test('deck history deltas reject malformed and impossible changes', () => {
  assert.throws(
    () => applyDeckHistoryDelta(first, { drawDeck: [['SOR_051', -3]] }),
    /removes too many copies/,
  )
  assert.throws(
    () => applyDeckHistoryDelta(first, { unknown: 'value' }),
    /delta is invalid/,
  )
  assert.throws(
    () => applyDeckHistoryDelta(first, {}),
    /delta is invalid/,
  )
})

test('a simple delta is materially smaller than another full snapshot', () => {
  const next = {
    ...first,
    drawDeck: [{ id: 'SOR_051', count: 3 }, { id: 'SOR_058', count: 1 }],
  }
  const delta = createDeckHistoryDelta(first, next)

  assert.ok(JSON.stringify(delta).length < JSON.stringify(next).length / 2)
})
