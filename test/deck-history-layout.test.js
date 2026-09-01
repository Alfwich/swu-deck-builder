import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('deck history stays above the central deck workspace', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

  assert.match(
    app,
    /<div className="app__content">[^]*<DeckHistoryBar[^]*<section className="deck-workspace"/,
  )
})

test('deck history sticks below web navigation and inside desktop scrolling', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')

  assert.match(
    css,
    /\.deck-history\s*{[^}]*position:\s*sticky;[^}]*top:\s*var\(--desktop-control-top\);/,
  )
  assert.match(
    css,
    /\.app\.is-electron \.deck-history\s*{[^}]*top:\s*0;/,
  )
  assert.match(css, /\.deck-history__timeline\s*{[^}]*overflow-x:\s*auto;/)
})

test('deck history renders only its timeline controls', async () => {
  const component = await readFile(
    new URL('../src/DeckHistoryBar.jsx', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(component, /deck-history__status/)
  assert.doesNotMatch(component, /deck-history__step/)
  assert.match(component, /STARTING_ENTRIES/)
  assert.match(component, /index === 0 \? ' is-start'/)
  assert.match(component, /entry\.visual\?\.card/)
  assert.match(component, /entry\.visual\?\.cards/)
  assert.match(component, /deck-history-card-stack__card/)
  assert.match(
    component,
    /function handleClick\(\) \{\s*onHidePreview\(\)\s*onNavigate\(index\)/,
  )
  assert.match(
    component,
    /if \(isCurrent && showsStack && entry\.visual\?\.details\) \{\s*onShowDetails\(entry, index\)/,
  )
  assert.match(component, /onPreviewCard\(card, event\)/)
  assert.match(component, /window\.addEventListener\('keydown'/)
  assert.match(component, /isEditableTarget\(event\.target\)/)
})

test('stacked deck history entries use the card-change review dialog', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])

  assert.match(app, /onShowDetails=\{handleShowDeckHistoryDetails\}/)
  assert.match(app, /eyebrow="Deck history"/)
  assert.match(app, /proposal=\{deckHistoryDetails\.proposal\}/)
  assert.match(app, /subtitle=\{deckHistoryDetails\.proposal\.targetDeckName\}/)
  assert.doesNotMatch(app, /Position \$\{deckHistoryDetails\.position\}/)
  assert.match(
    css,
    /\.card-changes-dialog__header > div\s*\{[^}]*justify-items:\s*start;[^}]*text-align:\s*left;/,
  )
  assert.match(app, /appendPersistentDeckHistory\(targetRecord\.history/)
  assert.match(app, /movePersistentDeckHistory\(/)
  assert.match(
    app,
    /agentCardPreview && !deckHistoryDetails &&/,
  )
})
