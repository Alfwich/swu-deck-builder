import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COPY_STATUS_DISMISS_DELAY,
  clearStaleTcgplayerCopyStatus,
  getCopyStatusDismissDelay,
} from '../src/copy-status.js'

test('TCGplayer warnings dismiss automatically and become stale after inputs change', () => {
  const warning = {
    type: 'error',
    message: 'The library covers every required card.',
    autoDismiss: true,
    source: 'tcgplayer',
  }

  assert.equal(getCopyStatusDismissDelay(warning), COPY_STATUS_DISMISS_DELAY)
  assert.equal(clearStaleTcgplayerCopyStatus(warning), null)
})

test('persistent application errors and undo notices are preserved', () => {
  const error = { type: 'error', message: 'Decks could not be saved.' }
  const undo = { type: 'success', message: 'Deck updated.', canUndo: true }

  assert.equal(getCopyStatusDismissDelay(error), null)
  assert.equal(clearStaleTcgplayerCopyStatus(error), error)
  assert.equal(getCopyStatusDismissDelay(undo), null)
})
