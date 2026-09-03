import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { readStyles } from '../test-support/read-styles.js'

test('deck history stays above the central deck workspace', async () => {
  const app = await readFile(new URL('../src/decks/DeckWorkspace.jsx', import.meta.url), 'utf8')

  assert.match(
    app,
    /<div className="app__content">[^]*<DeckHistoryBar[^]*<section className="deck-workspace"/,
  )
})

test('deck history sticks below web navigation and inside desktop scrolling', async () => {
  const css = await readStyles()

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
  assert.match(component, /onPointerLeave: onHidePreview/)
  assert.doesNotMatch(component, /onPointerMove:/)
  assert.match(
    component,
    /data-agent-card-preview=\{showsCard && !showsStack \? 'true' : undefined\}/,
  )
  assert.match(component, /title=\{showsCard \? undefined : label\}/)
  assert.doesNotMatch(component, /document\.activeElement/)
  assert.match(component, /const previewHandlers = showsCard && !showsStack/)
  assert.match(component, /window\.addEventListener\('keydown'/)
  assert.match(component, /isEditableTarget\(event\.target\)/)
})

test('stacked deck history entries use the card-change review dialog', async () => {
  const [app, workspace, css] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/decks/DeckWorkspace.jsx', import.meta.url), 'utf8'),
    readStyles(),
  ])
  const source = `${app}\n${workspace}`

  assert.match(source, /onShowDetails=\{handleShowDeckHistoryDetails\}/)
  assert.match(source, /eyebrow="Deck history"/)
  assert.match(source, /proposal=\{deckHistoryDetails\.proposal\}/)
  assert.match(source, /subtitle=\{deckHistoryDetails\.proposal\.targetDeckName\}/)
  assert.doesNotMatch(source, /Position \$\{deckHistoryDetails\.position\}/)
  assert.match(
    css,
    /\.card-changes-dialog__header > div\s*\{[^}]*justify-items:\s*start;[^}]*text-align:\s*left;/,
  )
  assert.match(source, /appendPersistentDeckHistory\(targetRecord\.history/)
  assert.match(source, /movePersistentDeckHistory\(/)
  assert.match(
    app,
    /agentCardPreview && !deckHistoryDetails &&/,
  )
})

test('branching history requires explicit destructive confirmation', async () => {
  const [app, dialog, historyDiscard, css] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/decks/DeckLibrary.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/decks/useHistoryDiscard.js', import.meta.url), 'utf8'),
    readStyles(),
  ])
  const source = `${app}\n${dialog}\n${historyDiscard}`

  assert.match(source, /role="alertdialog"/)
  assert.match(source, /Discard newer history and apply/)
  assert.match(source, /persistentDeckHistoryFutureCount\(targetRecord\?\.history\)/)
  assert.match(source, /if \(count === 0\) return Promise\.resolve\(true\)/)
  assert.match(source, /!await confirmHistoryDiscard\(targetRecord\)/)
  assert.match(source, /if \(deckCommit\.cancelled\) return/)
  assert.match(css, /\.history-discard-dialog__confirm/)
})
