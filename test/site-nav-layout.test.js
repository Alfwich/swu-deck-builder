import assert from 'node:assert/strict'
import test from 'node:test'

import { readStyles } from '../test-support/read-styles.js'

test('navigation group separators have balanced spacing on web and desktop', async () => {
  const css = await readStyles()
  const separatorRule = css.match(
    /\.site-nav__group \+ \.site-nav__group,[^{]+\{([^}]+)\}/,
  )?.[1]

  assert.match(separatorRule, /margin-left:\s*1rem/)
  assert.match(separatorRule, /padding-left:\s*1rem/)
  assert.doesNotMatch(
    css,
    /\.app\.is-electron \.site-nav__primary-actions \.site-nav__group \+ \.site-nav__group\s*\{[^}]*margin-left/,
  )
})
