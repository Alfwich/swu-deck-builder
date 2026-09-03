import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { readStyles } from './support/read-styles.js'

test('out-of-aspect cards use only the additional-cost badge', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/web/decks/deck-cards.tsx', import.meta.url), 'utf8'),
    readStyles(),
  ])

  assert.match(app, /aspectPenalty > 0[^]*deck-card__aspect-penalty/)
  assert.match(app, /\+\{aspectPenalty\} cost/)
  assert.doesNotMatch(app, /is-out-of-aspect/)
  assert.doesNotMatch(css, /is-out-of-aspect/)
})
