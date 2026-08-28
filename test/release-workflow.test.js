import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowPath = new URL(
  '../.github/workflows/electron-release.yml',
  import.meta.url,
)

test('published GitHub releases build and upload Windows Electron assets', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /release:\s*\n\s+types: \[published\]/)
  assert.match(workflow, /runs-on: windows-latest/)
  assert.match(workflow, /npm test/)
  assert.match(workflow, /npm run lint/)
  assert.match(workflow, /npm version[^\n]+--allow-same-version/)
  assert.match(workflow, /npm run desktop:make/)
  assert.match(workflow, /gh release upload[^\n]+--clobber/)
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/)
})
