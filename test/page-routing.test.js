import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveApplicationPage } from '../src/page-routing.js'

test('resolves public legal pages with optional trailing slashes', () => {
  assert.equal(resolveApplicationPage('/privacy'), 'privacy')
  assert.equal(resolveApplicationPage('/privacy/'), 'privacy')
  assert.equal(resolveApplicationPage('/terms'), 'terms')
  assert.equal(resolveApplicationPage('/terms/'), 'terms')
})

test('preserves the access page and defaults unknown paths to the app', () => {
  assert.equal(resolveApplicationPage('/enable'), 'access')
  assert.equal(resolveApplicationPage('/enable/'), 'access')
  assert.equal(resolveApplicationPage('/'), 'app')
  assert.equal(resolveApplicationPage('/not-a-page'), 'app')
})
