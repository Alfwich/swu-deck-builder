import assert from 'node:assert/strict'
import test from 'node:test'

import { formatAccessLeaseDuration } from '../src/agent-access-duration.js'

test('access lease durations use the largest exact display unit', () => {
  assert.equal(formatAccessLeaseDuration(1800000, 'en'), '30 minutes')
  assert.equal(formatAccessLeaseDuration(7200000, 'en'), '2 hours')
  assert.equal(formatAccessLeaseDuration(90000, 'en'), '90 seconds')
})

test('invalid access lease durations do not produce misleading copy', () => {
  assert.equal(formatAccessLeaseDuration(null, 'en'), '')
  assert.equal(formatAccessLeaseDuration(-1, 'en'), '')
})
