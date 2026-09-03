import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveGoogleDriveClientId } from '../src/web/player-database/backup/google-drive-feature.js'

test('runtime Google Drive client IDs override the build-time fallback', () => {
  assert.equal(
    resolveGoogleDriveClientId(
      { clientId: ' runtime-client-id ' },
      'build-client-id',
    ),
    'runtime-client-id',
  )
  assert.equal(resolveGoogleDriveClientId({}, ' build-client-id '), 'build-client-id')
  assert.equal(resolveGoogleDriveClientId(null), '')
})
