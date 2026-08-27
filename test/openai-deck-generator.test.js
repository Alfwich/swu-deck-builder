import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentCatalog } from '../server/catalog.mjs'
import { createOpenAiDeckGenerator } from '../server/openai-deck-generator.mjs'

function sourceCard(type, number, name) {
  return {
    Set: 'TST',
    Number: String(number).padStart(3, '0'),
    Name: name,
    Type: type,
    VariantType: 'Normal',
    FrontArt: `https://example.invalid/${number}.jpg`,
  }
}

test('sends the catalog attachment and accepts a validated structured response', async () => {
  const cards = [
    sourceCard('Leader', 1, 'Leader'),
    sourceCard('Base', 2, 'Base'),
    ...Array.from({ length: 27 }, (_, index) =>
      sourceCard('Unit', index + 3, `Unit ${index + 1}`),
    ),
  ]
  const catalog = createAgentCatalog({
    schemaVersion: 1,
    sets: { TST: { cards } },
  })
  const responsePayload = {
    name: 'Model deck',
    leaderId: 'TST_001',
    secondLeaderId: null,
    baseId: 'TST_002',
    drawDeck: Array.from({ length: 17 }, (_, index) => ({
      cardId: `TST_${String(index + 3).padStart(3, '0')}`,
      count: index === 16 ? 2 : 3,
    })),
    sideboard: Array.from({ length: 10 }, (_, index) => ({
      cardId: `TST_${String(index + 20).padStart(3, '0')}`,
      count: 1,
    })),
    summary: 'Generated for a test.',
  }
  let request
  const client = {
    files: {
      create() {
        throw new Error('A configured catalog file should not be uploaded.')
      },
    },
    responses: {
      async create(parameters) {
        request = parameters
        return {
          id: 'resp_test',
          status: 'completed',
          output_text: JSON.stringify(responsePayload),
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        }
      },
    },
  }
  const generator = createOpenAiDeckGenerator(
    {
      apiKey: 'test-key',
      catalogFileId: 'file_catalog',
      maxOutputTokens: 4000,
      model: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
      requestTimeoutMs: 120000,
      storeResponses: false,
    },
    {
      client,
      ensureCatalogArtifact: async () => ({
        ...catalog,
        outputPath: 'unused.json',
      }),
    },
  )

  const result = await generator.generate('Build a coherent deck.')

  assert.equal(request.model, 'gpt-5.6-terra')
  assert.equal(request.reasoning.effort, 'medium')
  assert.equal(request.input[0].content[0].file_id, 'file_catalog')
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.strict, true)
  assert.equal(request.text.format.schema.properties.sideboard.minItems, 1)
  assert.equal(result.responseId, 'resp_test')
  assert.equal(result.deck.drawDeck.length, 50)
  assert.equal(result.deck.sideboard.length, 10)
})

test('transforms a validated current deck and returns an authoritative diff', async () => {
  const cards = [
    sourceCard('Leader', 1, 'Leader'),
    sourceCard('Base', 2, 'Base'),
    ...Array.from({ length: 29 }, (_, index) =>
      sourceCard('Unit', index + 3, `Unit ${index + 1}`),
    ),
  ]
  const catalog = createAgentCatalog({
    schemaVersion: 1,
    sets: { TST: { cards } },
  })
  const currentEntries = Array.from({ length: 17 }, (_, index) => ({
    id: `TST_${String(index + 3).padStart(3, '0')}`,
    count: index === 16 ? 2 : 3,
  }))
  const transformedEntries = [
    ...currentEntries.slice(0, 16).map((entry) => ({
      cardId: entry.id,
      count: entry.count,
    })),
    { cardId: 'TST_020', count: 2 },
  ]
  const currentDeck = {
    metadata: { name: 'Current deck' },
    leader: { id: 'TST_001', count: 1 },
    secondleader: null,
    base: { id: 'TST_002', count: 1 },
    deck: currentEntries,
    sideboard: Array.from({ length: 10 }, (_, index) => ({
      id: `TST_${String(index + 21).padStart(3, '0')}`,
      count: 1,
    })),
  }
  const responsePayload = {
    name: 'Lower-cost deck',
    leaderId: 'TST_001',
    secondLeaderId: null,
    baseId: 'TST_002',
    drawDeck: transformedEntries,
    sideboard: Array.from({ length: 10 }, (_, index) => ({
      cardId: `TST_${String(index + 22).padStart(3, '0')}`,
      count: 1,
    })),
    summary: 'Replaced one card package.',
  }
  let request
  let responseCalls = 0
  const client = {
    files: { create: () => assert.fail('Unexpected upload.') },
    responses: {
      async create(parameters) {
        responseCalls += 1
        request = parameters
        return {
          id: 'resp_transform',
          status: 'completed',
          output_text: JSON.stringify(responsePayload),
          usage: null,
        }
      },
    },
  }
  const generator = createOpenAiDeckGenerator(
    {
      apiKey: 'test-key',
      catalogFileId: 'file_catalog',
      maxOutputTokens: 4000,
      model: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
      requestTimeoutMs: 120000,
      storeResponses: false,
    },
    {
      client,
      ensureCatalogArtifact: async () => ({
        ...catalog,
        outputPath: 'unused.json',
      }),
    },
  )

  const result = await generator.transform(
    'Replace the final package.',
    currentDeck,
  )
  const requestText = request.input[0].content[1].text

  assert.equal(responseCalls, 1)
  assert.equal(request.metadata.feature, 'agentic-deck-transformation')
  assert.match(requestText, /User transformation request: Replace the final package\./)
  assert.match(requestText, /"leaderId":"TST_001"/)
  assert.match(requestText, /"cardId":"TST_019","count":2/)
  assert.match(requestText, /"sideboard":\[\{"cardId":"TST_021","count":1\}/)
  assert.deepEqual(result.changes.removed, [
    {
      id: 'TST_019',
      name: 'Unit 17',
      subtitle: null,
      count: 2,
      zone: 'drawDeck',
    },
    {
      id: 'TST_021',
      name: 'Unit 19',
      subtitle: null,
      count: 1,
      zone: 'sideboard',
    },
  ])
  assert.deepEqual(result.changes.added, [
    {
      id: 'TST_020',
      name: 'Unit 18',
      subtitle: null,
      count: 2,
      zone: 'drawDeck',
    },
    {
      id: 'TST_031',
      name: 'Unit 29',
      subtitle: null,
      count: 1,
      zone: 'sideboard',
    },
  ])

  const invalidDeck = {
    ...currentDeck,
    deck: [{ id: 'TST_003', count: 49 }],
  }
  await assert.rejects(
    () => generator.transform('Try to transform this.', invalidDeck),
    /current deck did not pass validation/i,
  )
  assert.equal(responseCalls, 1)
})
