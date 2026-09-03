import assert from 'node:assert/strict'
import test from 'node:test'

import { cloudBackupButtonLabel } from '../src/web/player-database/backup/cloud-backup-presentation.js'

test('cloud backup navigation distinguishes first connection from reconnection', () => {
  assert.equal(cloudBackupButtonLabel('disconnected', false), 'Connect Drive')
  assert.equal(cloudBackupButtonLabel('disconnected', true), 'Reconnect Drive')
})
