import assert from 'node:assert/strict'
import test from 'node:test'

import { createCardSearchIndex, fuzzySearchCards } from '../src/card-search.js'

function sourceCard(number, name, subtitle = null, type = 'Unit') {
  return {
    Set: 'TST',
    Number: String(number).padStart(3, '0'),
    Name: name,
    Subtitle: subtitle,
    Type: type,
    FrontArt: `/cards/${number}.png`,
    VariantType: 'Normal',
  }
}

const catalog = {
  cards: [
    sourceCard(1, 'Luke Skywalker', 'Jedi Knight'),
    sourceCard(2, 'Darth Vader', 'Dark Lord of the Sith'),
    sourceCard(3, 'Waylay', null, 'Event'),
    sourceCard(4, 'Luke Skywalker', 'Faithful Friend', 'Leader'),
  ],
}

test('fuzzy card search tolerates missing characters and ranks the intended card first', () => {
  const results = fuzzySearchCards(createCardSearchIndex(catalog), 'luk skywaker')

  assert.equal(results[0].name, 'Luke Skywalker')
})

test('fuzzy card search supports metadata and includes editable identity cards', () => {
  const index = createCardSearchIndex(catalog)

  assert.equal(fuzzySearchCards(index, 'TST 003')[0].name, 'Waylay')
  assert.equal(index.some(({ card }) => card.type === 'Leader'), true)
})

test('blank searches do not return an arbitrary catalog slice', () => {
  assert.deepEqual(fuzzySearchCards(createCardSearchIndex(catalog), '   '), [])
})
