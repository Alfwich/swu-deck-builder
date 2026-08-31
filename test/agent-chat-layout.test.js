import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('open assistant uses its header close control and reclaims launcher space', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])
  const launcher = app.match(
    /\{!isOpen && \(\s*(<button[\s\S]+?className="agent-chat__launcher"[\s\S]+?<\/button>)\s*\)\}/,
  )?.[1]
  const mobileStyles = css.match(
    /@media \(max-width: 640px\) \{([\s\S]+?)@media \(prefers-reduced-motion: reduce\)/,
  )?.[1]

  assert.ok(launcher)
  assert.match(launcher, /aria-label="Open AI deck assistant"/)
  assert.match(app, /aria-label="Close AI deck assistant"/)
  assert.match(css, /\.agent-chat__panel\s*\{[^}]*bottom:\s*0/)
  assert.match(
    mobileStyles,
    /\.agent-chat__panel\s*\{[^}]*bottom:\s*0[^}]*height:\s*min\(calc\(76vh \+ 4\.2rem\), 48\.2rem\)/,
  )
})

test('mobile composer hides submitted images and uses a single-line prompt', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])
  const mobileStyles = css.match(
    /@media \(max-width: 640px\) \{([\s\S]+?)@media \(prefers-reduced-motion: reduce\)/,
  )?.[1]

  assert.match(
    app,
    /\{status !== 'loading' && imageAttachments\.length > 0 && \(/,
  )
  assert.match(
    mobileStyles,
    /\.agent-chat__composer textarea\s*\{[^}]*height:\s*2\.65rem[^}]*min-height:\s*2\.65rem/,
  )
})

test('collection proposal rows offer independent apply and dismiss actions', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

  assert.match(app, /className="agent-chat-change__actions"/)
  assert.match(
    app,
    /change\.zone === 'collection'[\s\S]+?onDismiss\(change\.id\)[\s\S]+?Dismiss/,
  )
})
