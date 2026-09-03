import assert from 'node:assert/strict'
import test from 'node:test'

import { readStyles } from './support/read-styles.js'

test('footer gains a second row before desktop content reaches the window edge', async () => {
  const css = await readStyles()
  const mediumLayout = css.match(
    /@media \(max-width: 1280px\) \{([\s\S]+?)@media \(max-width: 640px\)/,
  )?.[1]

  assert.match(mediumLayout, /--app-footer-height:\s*2\.85rem/)
  assert.match(mediumLayout, /'version links'\s*'notice notice'/)
  assert.match(mediumLayout, /padding:\s*0\.25rem 1rem 0\.45rem/)
  assert.match(
    css,
    /\.agent-chat\s*\{[^}]*bottom:\s*calc\(var\(--app-footer-height\) \+ 1rem\)/,
  )
})
