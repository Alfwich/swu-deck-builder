import assert from 'node:assert/strict'
import test from 'node:test'

import { getCardPreviewLayout } from '../src/card-preview.js'

test('card preview opens to the right of the cursor when space permits', () => {
  const layout = getCardPreviewLayout({
    anchorX: 100,
    anchorY: 200,
    viewportHeight: 900,
    viewportWidth: 1200,
  })

  assert.equal(layout.left, 118)
  assert.equal(layout.top, 182)
  assert.equal(layout.width, 320)
  assert.equal(layout.height, 448)
})

test('card preview flips left and stays inside the viewport near an edge', () => {
  const layout = getCardPreviewLayout({
    anchorX: 1100,
    anchorY: 880,
    horizontal: true,
    viewportHeight: 900,
    viewportWidth: 1200,
  })

  assert.equal(layout.left, 662)
  assert.equal(layout.top, 588)
  assert.equal(layout.width, 420)
  assert.equal(layout.height, 300)
})

test('card preview scales down to fit a compact viewport', () => {
  const layout = getCardPreviewLayout({
    anchorX: 150,
    anchorY: 300,
    viewportHeight: 500,
    viewportWidth: 300,
  })

  assert.equal(layout.width, 276)
  assert.equal(layout.height, 386.4)
  assert.equal(layout.left, 12)
  assert.ok(Math.abs(layout.top - 101.6) < 0.000001)
})
