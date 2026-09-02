import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('collection leaders expose the same reversible face control as deck leaders', async () => {
  const [component, css] = await Promise.all([
    readFile(new URL('../src/CardCollectionDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])

  assert.match(component, /cardType === 'leader' && Boolean\(card\?\.backUrl\)/)
  assert.match(component, /Restore leader face.*Show deployed face/)
  assert.match(component, /aria-pressed=\{isFlipped\}/)
  assert.match(component, /collection-card__flip-face--front/)
  assert.match(component, /collection-card__flip-face--back/)
  assert.match(css, /\.collection-card__flip\.is-flipped\s*\{[^}]*aspect-ratio:\s*5 \/ 7/s)
  assert.match(css, /\.collection-card__flip\.is-flipped \.collection-card__flip-inner\s*\{[^}]*rotateY\(180deg\)/s)
})

test('collection cards use larger cells and bases remain upright', async () => {
  const css = await readFile(
    new URL('../src/index.css', import.meta.url),
    'utf8',
  )

  assert.match(
    css,
    /\.collection-card-grid\s*\{[^}]*minmax\(min\(100%, 14\.3rem\), 1fr\)/s,
  )
  assert.match(
    css,
    /\.collection-card__image-frame img\.is-base\s*\{[^}]*object-fit:\s*contain/s,
  )
  assert.doesNotMatch(
    css,
    /\.collection-card__image-frame img\.is-base\s*\{[^}]*transform:/s,
  )
})
