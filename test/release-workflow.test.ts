import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowPath = new URL(
  '../.github/workflows/electron-release.yml',
  import.meta.url,
)
const nightlyWorkflowPath = new URL(
  '../.github/workflows/nightly-release.yml',
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
  assert.match(workflow, /npm run typecheck/)
  assert.match(workflow, /npm run desktop:make -- --arch=/)
  assert.match(workflow, /'macos' \{ '\.dmg'; '\.zip' \}/)
  assert.match(workflow, /'linux' \{ '\.deb'; '\.rpm' \}/)
  assert.match(workflow, /actions\/upload-artifact@v7/)
  assert.match(workflow, /actions\/download-artifact@v8/)
  assert.match(workflow, /needs: \[validate-release, desktop\]/)
  assert.match(workflow, /gh release create[^]*--draft/)
  assert.match(workflow, /gh release edit[^]*--draft=false/)
  assert.match(workflow, /gh release upload[^]*--clobber/)
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /inputs\.release_tag \|\| github\.ref/)
  assert.doesNotMatch(workflow, /gh api --paginate --slurp/)
  assert.match(workflow, /gh api --paginate[^]*\| jq -s 'add/)
  assert.match(workflow, /sort_by\(\.published_at\)[^]*\.\[3:\]/)
  assert.match(workflow, /releases\/assets\/\$asset_id/)
})

test('nightly workflow releases only commits after the current stable tag', async () => {
  const workflow = await readFile(nightlyWorkflowPath, 'utf8')

  assert.match(workflow, /cron: '17 2 \* \* \*'/)
  assert.match(workflow, /timezone: America\/Los_Angeles/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /git rev-list --count "\$previousTag\.\.HEAD"/)
  assert.match(workflow, /if: steps\.changes\.outputs\.changed == 'true'/)
  assert.match(workflow, /release_needed=\$releaseNeeded/)
  assert.match(workflow, /npm test/)
  assert.match(workflow, /npm run lint/)
  assert.match(workflow, /npm run typecheck/)
  assert.match(workflow, /npm run build/)
  assert.match(workflow, /prepare-nightly-release\.ts/)
  assert.match(workflow, /git push --atomic origin/)
  assert.match(workflow, /gh workflow run electron-release\.yml/)
})
