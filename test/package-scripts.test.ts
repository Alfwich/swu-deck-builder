import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { formatScriptHelp } from '../scripts/help.js'

test('every npm script has a short description', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )
  const scriptNames = Object.keys(packageJson.scripts).sort()
  const describedNames = Object.keys(packageJson.scriptsInfo).sort()

  assert.deepEqual(describedNames, scriptNames)
  for (const description of Object.values(packageJson.scriptsInfo)) {
    assert.equal(typeof description, 'string')
    assert.match(description, /^\S(?:.*\S)?\.$/)
  }
})

test('npm script help formats commands with their descriptions', () => {
  assert.equal(
    formatScriptHelp(
      { build: 'vite build', test: 'node --test' },
      { build: 'Build the application.', test: 'Run the tests.' },
    ),
    [
      'Available npm commands:',
      '',
      '  npm run build  Build the application.',
      '  npm run test   Run the tests.',
    ].join('\n'),
  )
})
