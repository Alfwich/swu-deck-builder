import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getDictationPresentation,
  isDictationAvailable,
} from '../src/dictation.js'

function presentation(overrides = {}) {
  return getDictationPresentation({
    disabled: false,
    error: '',
    isListening: false,
    isProcessing: false,
    ...overrides,
  })
}

test('dictation presents distinct listening and interpreting states', () => {
  assert.deepEqual(
    {
      state: presentation({ isListening: true }).state,
      label: presentation({ isListening: true }).label,
      message: presentation({ isListening: true }).message,
    },
    { state: 'listening', label: 'Stop', message: 'Listening…' },
  )

  const processing = presentation({ isProcessing: true })
  assert.equal(processing.state, 'processing')
  assert.equal(processing.label, 'Interpreting…')
  assert.equal(processing.message, 'Interpreting your dictation…')
  assert.equal(processing.buttonDisabled, true)
})

test('dictation keeps runtime error feedback actionable', () => {
  assert.equal(
    presentation({ error: 'Microphone permission was denied.' }).state,
    'error',
  )
})

test('dictation is hidden in Electron and unsupported browsers', () => {
  assert.equal(
    isDictationAvailable({ isElectron: true, isSupported: true }),
    false,
  )
  assert.equal(
    isDictationAvailable({ isElectron: false, isSupported: false }),
    false,
  )
  assert.equal(
    isDictationAvailable({ isElectron: false, isSupported: true }),
    true,
  )
})
