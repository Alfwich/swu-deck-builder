import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { readStyles } from './support/read-styles.js'

test('background cards remain visible without continuous motion', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/web/app/app-chrome.tsx', import.meta.url), 'utf8'),
    readStyles(),
  ])
  const cascadeGridRule = css.match(/\.card-cascade__grid\s*\{([^}]+)\}/)?.[1]

  assert.match(app, /className="card-cascade"/)
  assert.match(app, /className="card-cascade__tile"/)
  assert.match(cascadeGridRule, /display:\s*grid/)
  assert.doesNotMatch(cascadeGridRule, /animation\s*:/)
  assert.doesNotMatch(cascadeGridRule, /will-change\s*:/)
  assert.doesNotMatch(css, /@keyframes\s+cascade-drift/)
})
