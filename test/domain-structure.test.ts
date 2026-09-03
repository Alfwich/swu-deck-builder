import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

test('source root contains explicit runtime boundaries', async () => {
  const entries = await readdir(new URL('../src/', import.meta.url), {
    withFileTypes: true,
  })
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  assert.deepEqual(files, [])
  assert.deepEqual(directories, ['desktop', 'server', 'shared', 'web'])
})

test('browser implementation lives in functional domain folders', async () => {
  const entries = await readdir(new URL('../src/web/', import.meta.url), {
    withFileTypes: true,
  })
  const rootTypeScriptFiles = entries
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  const directories = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  )

  assert.deepEqual(rootTypeScriptFiles, ['main.tsx'])
  assert.equal(directories.has('deck-changes'), false)
})

test('cross-runtime history formatting does not depend on browser source', async () => {
  const source = await readFile(
    new URL('../src/shared/deck-history-format.ts', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(source, /from ['"].*\/web\//)
})
