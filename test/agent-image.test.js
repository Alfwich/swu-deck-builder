import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_IMAGE_MAX_BYTES,
  agentImageDisplayName,
  clipboardImageFile,
  formatAgentImageSize,
  validateAgentImageFile,
} from '../src/agent-image.js'

test('agent image validation accepts supported files within the size limit', () => {
  assert.equal(
    validateAgentImageFile({ type: 'image/png', size: 4096 }),
    '',
  )
  assert.match(
    validateAgentImageFile({ type: 'image/gif', size: 4096 }),
    /PNG, JPEG, and WebP/,
  )
  assert.match(
    validateAgentImageFile({ type: 'image/jpeg', size: 0 }),
    /empty/,
  )
  assert.match(
    validateAgentImageFile({
      type: 'image/webp',
      size: AGENT_IMAGE_MAX_BYTES + 1,
    }),
    /10 MB/,
  )
})

test('clipboard image selection leaves text-only clipboard data alone', () => {
  const image = { name: '', type: 'image/png', size: 2048 }
  assert.equal(
    clipboardImageFile({
      items: [
        { kind: 'string', type: 'text/plain' },
        { kind: 'file', type: 'image/png', getAsFile: () => image },
      ],
    }),
    image,
  )
  assert.equal(
    clipboardImageFile({
      items: [{ kind: 'string', type: 'text/plain' }],
    }),
    null,
  )
})

test('agent image labels describe pasted images and sizes', () => {
  assert.equal(agentImageDisplayName({ name: '  screenshot.png  ' }), 'screenshot.png')
  assert.equal(agentImageDisplayName({ name: '' }), 'Pasted image')
  assert.equal(formatAgentImageSize(2048), '2 KB')
  assert.equal(formatAgentImageSize(1.5 * 1024 * 1024), '1.5 MB')
})
