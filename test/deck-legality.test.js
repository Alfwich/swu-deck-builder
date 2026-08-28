import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateDeckFormats } from '../src/deck-legality.js'

function card(name, type = 'Unit', aspects = []) {
  return { name, subtitle: null, type, aspects }
}

function deck(drawDeckSize = 50) {
  return {
    leader: card('Leader', 'Leader', ['Command']),
    secondLeader: null,
    base: card('Base', 'Base', ['Command']),
    drawDeck: Array.from({ length: drawDeckSize }, (_, index) =>
      card(`Card ${index + 1}`),
    ),
    sideboard: [],
  }
}

test('reports structural format results without claiming policy legality', () => {
  const reports = evaluateDeckFormats(deck())
  const premier = reports.find((report) => report.id === 'premier')
  const sealed = reports.find((report) => report.id === 'sealed')
  const twinSuns = reports.find((report) => report.id === 'twin-suns')

  assert.equal(premier.status, 'indeterminate')
  assert.deepEqual(premier.issues, [])
  assert.equal(sealed.status, 'indeterminate')
  assert.ok(twinSuns.issues.some((issue) => issue.includes('2 leaders')))
  assert.ok(twinSuns.issues.some((issue) => issue.includes('30 more cards')))
})

test('an empty work-in-progress deck is editable but structurally illegal', () => {
  const workInProgress = deck(0)
  const reports = evaluateDeckFormats(workInProgress)

  assert.ok(reports.every((report) => report.status === 'illegal'))
  assert.ok(
    reports
      .find((report) => report.id === 'premier')
      .issues.some((issue) => issue.includes('50 more cards')),
  )
})

test('Twin Suns requires two different compatible leaders and one base', () => {
  const twinSunsDeck = deck(80)
  twinSunsDeck.secondLeader = card('Second Leader', 'Leader', ['Cunning'])
  const passing = evaluateDeckFormats(twinSunsDeck).find(
    (report) => report.id === 'twin-suns',
  )
  assert.equal(passing.status, 'indeterminate')
  assert.deepEqual(passing.issues, [])

  twinSunsDeck.secondLeader = card('Second Leader', 'Leader', ['Villainy'])
  twinSunsDeck.leader.aspects = ['Heroism']
  const conflicting = evaluateDeckFormats(twinSunsDeck).find(
    (report) => report.id === 'twin-suns',
  )
  assert.ok(conflicting.issues.some((issue) => issue.includes('Heroism and Villainy')))
})
