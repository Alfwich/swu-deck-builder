import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowPath = new URL(
  '../.github/workflows/electron-release.yml',
  import.meta.url,
)

test('version tags publish a release only after metadata, tests, lint, and builds pass', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /push:\s*\n\s+tags:\s*\n\s+- 'v\*'/)
  assert.match(workflow, /validate-release:/)
  assert.match(workflow, /needs: validate-release/)
  assert.match(workflow, /package-lock\.json root package/)
  assert.match(workflow, /does not match release tag/)
  assert.match(workflow, /Release notes are missing/)
  assert.doesNotMatch(workflow, /npm version/)
  assert.match(workflow, /os: windows-latest/)
  assert.match(workflow, /os: macos-latest/)
  assert.match(workflow, /os: ubuntu-latest/)
  assert.match(workflow, /arch: universal/)
  assert.match(workflow, /fakeroot rpm/)
  assert.match(workflow, /npm test/)
  assert.match(workflow, /npm run lint/)
  assert.match(workflow, /npm run desktop:make -- --arch=/)
  assert.match(workflow, /'macos' \{ '\.dmg'; '\.zip' \}/)
  assert.match(workflow, /'linux' \{ '\.deb'; '\.rpm' \}/)
  assert.match(workflow, /actions\/upload-artifact@v7/)
  assert.match(workflow, /actions\/download-artifact@v8/)
  assert.match(workflow, /needs: \[validate-release, desktop\]/)
  assert.match(workflow, /gh release create[^]*--draft/)
  assert.match(workflow, /gh release edit[^]*--draft=false/)
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/)
})
