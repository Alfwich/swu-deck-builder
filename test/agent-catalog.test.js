import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_CATALOG_FIELDS,
  cardCopyLimit,
  createAgentCatalog,
  decodeAgentCatalogContent,
} from '../server/catalog.mjs'

test('agent catalog preserves source IDs and prefers normal printings', () => {
  const database = {
    schemaVersion: 1,
    updatedAt: '2026-08-27T00:00:00.000Z',
    sets: {
      TS26: {
        cards: [
          {
            Set: 'TS26',
            Number: '58',
            Name: 'Test Card',
            Type: 'Unit',
            VariantType: 'Normal',
          },
          {
            Set: 'TS26',
            Number: '58',
            Name: 'Test Card',
            Type: 'Unit',
            VariantType: 'Foil',
          },
        ],
      },
    },
  }

  const catalog = createAgentCatalog(database)
  const decodedCards = decodeAgentCatalogContent(catalog.content)

  assert.deepEqual([...catalog.cardsById.keys()], ['TS26_58', 'TS26_058'])
  assert.equal(catalog.cardsById.get('TS26_058'), catalog.cardsById.get('TS26_58'))
  assert.equal(catalog.metadata.cardCount, 1)
  assert.equal(catalog.metadata.schemaVersion, 3)
  assert.equal(catalog.metadata.format, 'csv')
  assert.equal(catalog.content.split('\r\n')[0], AGENT_CATALOG_FIELDS.join(','))
  assert.equal(decodedCards[0].id, 'TS26_58')
  assert.equal(decodedCards[0].name, 'Test Card')
  assert.doesNotMatch(catalog.content, /TS26_058/)
})

test('compact agent catalog rows preserve every model-facing field', () => {
  const source = {
    Set: 'TST',
    Number: '007',
    Name: 'Compact Card',
    Subtitle: 'No Metadata Lost',
    Type: 'Unit',
    VariantType: 'Normal',
    Aspects: ['Command'],
    Traits: ['DROID'],
    Arenas: ['Ground'],
    Keywords: ['Sentinel'],
    Cost: 2,
    Power: 3,
    HP: 4,
    MarketPrice: '1.25',
    LowPrice: '0.75',
    FrontText: 'When Played: Say "hello", then\ndraw a card.',
    BackText: null,
  }
  const catalog = createAgentCatalog({
    schemaVersion: 1,
    sets: { TST: { cards: [source] } },
  })

  assert.deepEqual(decodeAgentCatalogContent(catalog.content), [
    {
      id: 'TST_007',
      name: 'Compact Card',
      subtitle: 'No Metadata Lost',
      type: 'Unit',
      aspects: ['Command'],
      traits: ['DROID'],
      arenas: ['Ground'],
      keywords: ['Sentinel'],
      cost: 2,
      power: 3,
      hp: 4,
      usdValue: 1.25,
      text: 'When Played: Say "hello", then\ndraw a card.',
      backText: null,
      maxCopies: 3,
    },
  ])
})

test('agent catalog USD value falls back to low price', () => {
  const catalog = createAgentCatalog({
    schemaVersion: 1,
    sets: {
      TST: {
        cards: [
          {
            Set: 'TST',
            Number: '008',
            Name: 'Low Price Card',
            Type: 'Event',
            VariantType: 'Normal',
            MarketPrice: null,
            LowPrice: '0.42',
          },
        ],
      },
    },
  })

  assert.equal(decodeAgentCatalogContent(catalog.content)[0].usdValue, 0.42)
})

test('reads card-specific copy limits from card text', () => {
  assert.equal(
    cardCopyLimit({
      FrontText: 'A deck can have up to 15 copies of this card.',
    }),
    15,
  )
  assert.equal(cardCopyLimit({ FrontText: 'No special deck limit.' }), 3)
})
