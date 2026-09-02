import assert from 'node:assert/strict'
import test from 'node:test'
import { getCollectionSetColor } from '../src/collection-set-colors.js'

test('collection completion rings use the representative main-set colors', () => {
  assert.deepEqual(
    Object.fromEntries(
      ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH', 'HMW'].map(
        (setCode) => [setCode, getCollectionSetColor(setCode)],
      ),
    ),
    {
      SOR: '#E83E3F',
      SHD: '#4958C8',
      TWI: '#A9343B',
      JTL: '#F5C518',
      LOF: '#21AEDD',
      SEC: '#7042B5',
      LAW: '#F05A28',
      ASH: '#596F89',
      HMW: '#159447',
    },
  )
})

test('collection completion rings use teal for unlisted set codes', () => {
  assert.equal(getCollectionSetColor('SOROP'), '#2dd4bf')
  assert.equal(getCollectionSetColor(' unknown '), '#2dd4bf')
  assert.equal(getCollectionSetColor(null), '#2dd4bf')
})
