import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FAN_TOOL_NOTICE,
  formatApplicationVersion,
} from '../src/web/app/app-metadata.js'

test('application metadata identifies the version and independent fan status', () => {
  assert.equal(formatApplicationVersion(' 0.7.0 '), 'SWU Deck Builder v0.7.0')
  assert.equal(formatApplicationVersion(), 'SWU Deck Builder')
  assert.match(FAN_TOOL_NOTICE, /Unofficial fan-made tool/)
  assert.match(FAN_TOOL_NOTICE, /not affiliated with Lucasfilm Ltd\./i)
  assert.match(FAN_TOOL_NOTICE, /The Walt Disney Company/)
})
