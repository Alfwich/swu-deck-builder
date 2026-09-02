import assert from 'node:assert/strict'
import test from 'node:test'

import { createCatalogPrintingIndex } from '../src/catalog.js'
import { analyzeCardCollection } from '../src/collection-analysis.js'

function card(setCode, number, name, variantType = 'Normal') {
  return {
    Set: setCode,
    Number: String(number).padStart(3, '0'),
    Name: name,
    Subtitle: null,
    Type: 'Unit',
    VariantType: variantType,
    FrontArt: `/cards/${setCode}/${number}.png`,
  }
}

const normalOne = card('TST', 1, 'Shared Unit')
const normalTwo = card('TST', 2, 'Second Unit')
const normalThree = card('TST', 3, 'Third Unit')
const hyperspaceOne = card('TST', 101, 'Shared Unit', 'Hyperspace')
const promoOne = card('PRO', 1, 'Promo Unit', 'Convention Promo')
const promoTwo = card('PRO', 2, 'Other Promo', 'Convention Promo')
const catalog = {
  database: {
    sets: {
      TST: {
        cards: [normalOne, normalTwo, normalThree, hyperspaceOne],
      },
      PRO: { cards: [promoOne, promoTwo] },
    },
  },
}

test('collection analysis distinguishes copies, printings, gameplay cards, and sets', () => {
  const collection = {
    cards: [
      { cardId: 'TST_001', count: 2 },
      { cardId: 'TST_101', count: 1 },
      { cardId: 'PRO_001', count: 4 },
    ],
  }
  const cardsById = createCatalogPrintingIndex(catalog)
  const analysis = analyzeCardCollection({
    cardsById,
    catalog,
    collection,
  })

  assert.equal(analysis.totalCopies, 7)
  assert.equal(analysis.distinctPrintings, 3)
  assert.equal(analysis.distinctCards, 2)
  assert.equal(analysis.setsRepresented, 2)
})

test('set completion uses normal checklists and falls back to promo printings', () => {
  const analysis = analyzeCardCollection({
    cardsById: createCatalogPrintingIndex(catalog),
    catalog,
    collection: {
      cards: [
        { cardId: 'TST_001', count: 1 },
        { cardId: 'TST_101', count: 2 },
        { cardId: 'PRO_001', count: 1 },
      ],
    },
  })

  assert.deepEqual(
    analysis.setProgress.map(
      ({ checklistKind, owned, percentage, setCode, total }) => ({
        checklistKind,
        owned,
        percentage,
        setCode,
        total,
      }),
    ),
    [
      {
        checklistKind: 'set',
        owned: 1,
        percentage: 50,
        setCode: 'PRO',
        total: 2,
      },
      {
        checklistKind: 'standard',
        owned: 1,
        percentage: 33,
        setCode: 'TST',
        total: 3,
      },
    ],
  )
})
