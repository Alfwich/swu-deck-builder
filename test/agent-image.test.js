import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_IMAGE_ACCEPT,
  AGENT_IMAGE_CAMERA_CAPTURE,
  AGENT_IMAGE_MAX_BYTES,
  MAX_AGENT_IMAGE_ATTACHMENTS,
  agentImageDisplayName,
  agentImageQueuePrompt,
  agentImageSelectionTitle,
  clipboardImageFiles,
  droppedImageFiles,
  formatAgentImageSize,
  shouldPresentAgentImageProposal,
  validateAgentImageFile,
} from '../src/agent-image.js'

test('agent camera input requests the rear-facing camera with supported images', () => {
  assert.equal(AGENT_IMAGE_CAMERA_CAPTURE, 'environment')
  assert.equal(AGENT_IMAGE_ACCEPT, 'image/png,image/jpeg,image/webp')
  assert.equal(agentImageSelectionTitle(0, 'Take a photo'), 'Take a photo')
  assert.match(
    agentImageSelectionTitle(MAX_AGENT_IMAGE_ATTACHMENTS, 'Take a photo'),
    /Up to 5 images/,
  )
})

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

test('clipboard image selection returns up to five images and ignores text', () => {
  const images = Array.from(
    { length: MAX_AGENT_IMAGE_ATTACHMENTS + 1 },
    (_, index) => ({ name: `${index}.png`, type: 'image/png', size: 2048 }),
  )
  assert.deepEqual(
    clipboardImageFiles({
      items: [
        { kind: 'string', type: 'text/plain' },
        ...images.map((image) => ({
          kind: 'file',
          type: 'image/png',
          getAsFile: () => image,
        })),
      ],
    }),
    images.slice(0, MAX_AGENT_IMAGE_ATTACHMENTS),
  )
  assert.deepEqual(
    clipboardImageFiles({
      items: [{ kind: 'string', type: 'text/plain' }],
    }),
    [],
  )
})

test('agent image labels describe pasted images and sizes', () => {
  assert.equal(agentImageDisplayName({ name: '  screenshot.png  ' }), 'screenshot.png')
  assert.equal(agentImageDisplayName({ name: '' }), 'Pasted image')
  assert.equal(formatAgentImageSize(2048), '2 KB')
  assert.equal(formatAgentImageSize(1.5 * 1024 * 1024), '1.5 MB')
})

test('queued images defer changes until one combined final proposal', () => {
  assert.equal(agentImageQueuePrompt('Read this card.', 0, 1), 'Read this card.')
  assert.equal(
    agentImageQueuePrompt('Read this card.', 0, 3),
    'Read this card.\n\nAnalyze only attached image 1 of 3 in this turn. Retain its findings for the remaining image turns. Return an informational answer only and do not propose or repeat any changes yet.',
  )
  assert.equal(
    agentImageQueuePrompt('Read this card.', 2, 3),
    'Read this card.\n\nAnalyze attached image 3 of 3. This is the final image. Combine the findings from all 3 images into one complete response. If the request changes the deck or card library, return a single proposal containing the complete combined set exactly once.',
  )
  assert.equal(shouldPresentAgentImageProposal(0, 1), true)
  assert.equal(shouldPresentAgentImageProposal(0, 3), false)
  assert.equal(shouldPresentAgentImageProposal(1, 3), false)
  assert.equal(shouldPresentAgentImageProposal(2, 3), true)
})

test('image drops accept files and fall back to file transfer items', () => {
  const png = { name: 'one.png', type: 'image/png', size: 2048 }
  const jpeg = { name: 'two.jpg', type: 'image/jpeg', size: 2048 }
  assert.deepEqual(
    droppedImageFiles({ files: [png, { name: 'notes.txt', type: 'text/plain' }] }),
    [png],
  )
  assert.deepEqual(
    droppedImageFiles({
      files: [],
      items: [
        { kind: 'string', type: 'text/plain' },
        { kind: 'file', type: 'image/jpeg', getAsFile: () => jpeg },
      ],
    }),
    [jpeg],
  )
})
