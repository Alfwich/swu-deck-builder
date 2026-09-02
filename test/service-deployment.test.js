import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const installerPath = new URL(
  '../ops/deploy/install-swu-deck-builder.sh',
  import.meta.url,
)

test('service bootstrap preserves long AI requests and their JSON errors', async () => {
  const installer = await readFile(installerPath, 'utf8')

  assert.match(installer, /OPENAI_MAX_OUTPUT_TOKENS=12000/)
  assert.match(installer, /OPENAI_REQUEST_TIMEOUT_MS=120000/)
  assert.match(installer, /proxy_read_timeout 180s;/)
  assert.match(installer, /proxy_send_timeout 180s;/)
  assert.match(installer, /proxy_intercept_errors off;/)
  assert.doesNotMatch(installer, /error_page 502 503 504/)
})
