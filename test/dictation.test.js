import assert from 'node:assert/strict'
import test from 'node:test'

import { getDictationPresentation } from '../src/dictation.js'

function presentation(overrides = {}) {
  return getDictationPresentation({
    disabled: false,
    error: '',
    isListening: false,
    isProcessing: false,
    isSupported: true,
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

test('dictation keeps unsupported and error feedback actionable', () => {
  assert.match(
    presentation({ isSupported: false }).title,
    /not supported by this browser/i,
  )
  assert.equal(
    presentation({ error: 'Microphone permission was denied.' }).state,
    'error',
  )
})

test('dictation is disabled with an explanation in Electron', () => {
  const electron = presentation({ isElectron: true })

  assert.equal(electron.buttonDisabled, true)
  assert.equal(electron.state, 'idle')
  assert.match(electron.message, /unavailable in the desktop app/i)
  assert.equal(electron.title, electron.message)
})
