import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('out-of-aspect cards use only the additional-cost badge', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])

  assert.match(app, /aspectPenalty > 0[^]*deck-card__aspect-penalty/)
  assert.match(app, /\+\{aspectPenalty\} cost/)
  assert.doesNotMatch(app, /is-out-of-aspect/)
  assert.doesNotMatch(css, /is-out-of-aspect/)
})
