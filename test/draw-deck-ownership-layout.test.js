import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('draw deck heading and full-width controls render on separate rows', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')

  assert.match(
    app,
    /deck-section__heading--draw-deck[^]*<\/div>\s*<DrawDeckSortControls/,
  )
  assert.match(css, /\.draw-deck-sort\s*{[^}]*width:\s*100%;/)
  assert.match(css, /\.draw-deck-sort\s*{[^}]*justify-content:\s*flex-start;/)
})

test('ownership toggle precedes sorting and drives card-face labels', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const toggleIndex = app.indexOf('draw-deck-ownership-toggle')
  const setSortIndex = app.indexOf('label="Set"', toggleIndex)

  assert.ok(toggleIndex > -1)
  assert.ok(setSortIndex > toggleIndex)
  assert.match(app, /showOwnership &&[^]*deck-card__ownership/)
  assert.match(app, /ownershipVisible={showDeckCardOwnership}/)
})

test('draw deck heading owns the summary pill instead of deck controls', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

  assert.match(app, /deck-section__ownership-summary/)
  assert.match(app, /drawDeckOwnership\.label/)
  assert.doesNotMatch(app, /deck-owned-badge|deck-library__owned/)
  assert.doesNotMatch(app, /All cards owned/)
})
