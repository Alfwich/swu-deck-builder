import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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

test('uploads the catalog as plain text and accepts a validated structured response', async (t) => {
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
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'swu-agent-catalog-'),
  )
  const catalogPath = path.join(temporaryDirectory, 'catalog.txt')
  const cachePath = path.join(temporaryDirectory, 'file-cache.json')
  await writeFile(catalogPath, catalog.content, 'utf8')
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  let request
  let uploadedFileName
  const client = {
    files: {
      async create(parameters) {
        uploadedFileName = parameters.file.name
        return { id: 'file_catalog' }
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
      fileCachePath: cachePath,
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
        outputPath: catalogPath,
      }),
    },
  )

  const result = await generator.generate('Build a coherent deck.')

  assert.equal(request.model, 'gpt-5.6-terra')
  assert.equal(uploadedFileName, 'swu-card-catalog.txt')
  assert.equal(request.reasoning.effort, 'medium')
  assert.equal(request.input[0].content[0].file_id, 'file_catalog')
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.strict, true)
  assert.equal(request.text.format.schema.properties.drawDeck.minItems, undefined)
  assert.equal(request.text.format.schema.properties.sideboard.minItems, undefined)
  assert.equal(result.responseId, 'resp_test')
  assert.equal(result.deck.drawDeck.length, 50)
  assert.equal(result.deck.sideboard.length, 10)
  const cache = JSON.parse(await readFile(cachePath, 'utf8'))
  assert.equal(cache.fileId, 'file_catalog')
  assert.equal(cache.inputFormat, 'plain-text-csv-v1')
})

test('transforms a validated current deck from explicit delta operations', async () => {
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
    changes: [
      {
        type: 'replace',
        zone: 'drawDeck',
        removeCardId: 'TST_019',
        addCardId: 'TST_020',
        count: 2,
      },
      {
        type: 'replace',
        zone: 'sideboard',
        removeCardId: 'TST_021',
        addCardId: 'TST_031',
        count: 1,
      },
    ],
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
          output_text: JSON.stringify(
            responseCalls === 1
              ? responsePayload
              : { changes: [], summary: 'No changes were needed.' },
          ),
          usage: null,
        }
      },
    },
  }
  const generator = createOpenAiDeckGenerator(
    {
      apiKey: 'test-key',
      catalogFileId: 'file_catalog',
      catalogFileFormat: 'plain-text-csv-v1',
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
  assert.match(requestText, /"cardCounts":\{"drawDeck":50,"sideboard":10\}/)
  assert.deepEqual(result.changes, [
    {
      id: 'change-1',
      type: 'replace',
      count: 2,
      zone: 'drawDeck',
      from: { id: 'TST_019', name: 'Unit 17', subtitle: null },
      to: { id: 'TST_020', name: 'Unit 18', subtitle: null },
    },
    {
      id: 'change-2',
      type: 'replace',
      count: 1,
      zone: 'sideboard',
      from: { id: 'TST_021', name: 'Unit 19', subtitle: null },
      to: { id: 'TST_031', name: 'Unit 29', subtitle: null },
    },
  ])
  assert.equal(request.text.format.schema.properties.drawDeck, undefined)
  assert.ok(request.text.format.schema.properties.changes)

  const workInProgressDeck = {
    ...currentDeck,
    deck: [],
    sideboard: [],
  }
  const emptied = await generator.transform(
    'Empty both editable zones.',
    workInProgressDeck,
  )
  assert.equal(emptied.deck.drawDeck.length, 0)
  assert.equal(emptied.deck.sideboard.length, 0)
  assert.equal(responseCalls, 2)
})

test('chat classifies answers and modifications while continuing response context', async () => {
  const cards = [
    sourceCard('Leader', 1, 'Leader'),
    sourceCard('Base', 2, 'Base'),
    sourceCard('Leader', 32, 'Second Leader'),
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
  const requests = []
  const responses = [
    {
      id: 'resp-answer',
      status: 'completed',
      output_text: JSON.stringify({
        operation: 'answer',
        message: 'The deck has a balanced cost curve.',
        deck: null,
        changes: [],
      }),
      usage: null,
    },
    {
      id: 'resp-modify',
      status: 'completed',
      output_text: JSON.stringify({
        operation: 'modify',
        message: 'I updated the sideboard and added a second leader.',
        deck: null,
        changes: [
          {
            type: 'replace',
            zone: 'sideboard',
            removeCardId: 'TST_021',
            addCardId: 'TST_031',
            count: 1,
          },
          {
            type: 'add',
            zone: 'secondLeader',
            cardId: 'TST_032',
            count: 1,
          },
        ],
      }),
      usage: null,
    },
    {
      id: 'resp-blank-answer',
      status: 'completed',
      output_text: JSON.stringify({
        operation: 'answer',
        message: 'Start by choosing a leader or strategy.',
        deck: null,
        changes: [],
      }),
      usage: null,
    },
  ]
  const generator = createOpenAiDeckGenerator(
    {
      apiKey: 'test-key',
      catalogFileId: 'file_catalog',
      catalogFileFormat: 'plain-text-csv-v1',
      maxOutputTokens: 4000,
      model: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
      requestTimeoutMs: 120000,
    },
    {
      client: {
        files: { create: () => assert.fail('Unexpected upload.') },
        responses: {
          async create(parameters) {
            requests.push(parameters)
            return responses.shift()
          },
        },
      },
      ensureCatalogArtifact: async () => ({
        ...catalog,
        outputPath: 'unused.csv',
      }),
    },
  )

  const answer = await generator.chat(
    'How does this curve look?',
    currentDeck,
    null,
    [
      { deckId: 'deck-one', deck: currentDeck },
      {
        deckId: 'deck-two',
        deck: {
          ...currentDeck,
          metadata: { name: 'Second saved deck' },
        },
      },
    ],
  )
  const modified = await generator.chat(
    'Improve the sideboard.',
    currentDeck,
    answer.responseId,
  )
  const blankAnswer = await generator.chat(
    'How should I begin?',
    {
      metadata: { name: 'New deck' },
      leader: null,
      secondleader: null,
      base: null,
      deck: [],
      sideboard: [],
    },
    modified.responseId,
  )

  assert.equal(answer.operation, 'answer')
  assert.equal(answer.deck, null)
  assert.equal(modified.operation, 'modify')
  assert.equal(blankAnswer.operation, 'answer')
  assert.equal(modified.deck.sideboard.length, 10)
  assert.equal(modified.deck.secondLeader.name, 'Second Leader')
  assert.equal(modified.changes[0].type, 'replace')
  assert.equal(modified.changes[0].from.id, 'TST_021')
  assert.equal(modified.changes[0].to.id, 'TST_031')
  assert.equal(modified.changes[1].zone, 'secondLeader')
  assert.equal(modified.changes[1].card.id, 'TST_032')
  assert.equal(requests[0].store, true)
  assert.equal(requests[0].input[0].content[0].file_id, 'file_catalog')
  assert.equal(requests[0].previous_response_id, undefined)
  assert.match(
    requests[0].input[0].content[1].text,
    /Deck library snapshots loaded at the start of this session/,
  )
  assert.match(requests[0].input[0].content[1].text, /Second saved deck/)
  assert.equal(requests[1].previous_response_id, 'resp-answer')
  assert.equal(requests[1].input[0].content.length, 1)
  assert.equal(requests[1].input[0].content[0].type, 'input_text')
  assert.equal(requests[1].instructions, requests[0].instructions)
  assert.match(requests[0].instructions, /stay strictly within Star Wars: Unlimited deck building/i)
  assert.match(requests[0].instructions, /briefly decline without answering the unrelated request/i)
  assert.match(requests[0].instructions, /click or select that deck/i)
  assert.match(requests[0].instructions, /do not have access to it yet/i)
  assert.match(requests[0].instructions, /Never return modify operations for a deck that is not currently visible/i)
  assert.match(requests[0].instructions, /for build, return one leader/i)
  assert.match(requests[0].instructions, /exactly 50 draw-deck cards/i)
  assert.match(requests[0].instructions, /may deliberately empty either card zone/i)
  assert.match(requests[0].instructions, /there is no general maximum draw-deck size/i)
  assert.match(requests[0].instructions, /Twin Suns requires exactly two different leaders/i)
  assert.match(requests[0].instructions, /return changes to leader, secondLeader, base, drawDeck, or sideboard/i)
  assert.match(requests[0].instructions, /never removed/i)
  assert.match(requests[0].instructions, /Use replace for an intentional one-for-one swap/i)
  assert.match(requests[0].instructions, /Do not refuse this edit/i)
  assert.deepEqual(
    requests[0].text.format.schema.properties.changes.items.anyOf[0].properties.zone.enum,
    ['leader', 'secondLeader', 'base', 'drawDeck', 'sideboard'],
  )
  assert.equal(requests[0].text.format.schema.properties.deck.anyOf[0].properties.drawDeck.maxItems, undefined)
  assert.deepEqual(requests[0].text.format.schema.properties.operation.enum, [
    'build',
    'modify',
    'answer',
  ])
})
