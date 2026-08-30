import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createAgentCatalog } from '../server/catalog.mjs'
import { createCliDeckGenerator } from '../server/cli-deck-generator.mjs'

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

async function fixture(t) {
  const cards = [
    sourceCard('Leader', 1, 'Leader'),
    sourceCard('Base', 2, 'Base'),
    ...Array.from({ length: 30 }, (_, index) =>
      sourceCard('Unit', index + 3, `Unit ${index + 1}`),
    ),
  ]
  const catalog = createAgentCatalog({ schemaVersion: 1, sets: { TST: { cards } } })
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swu-cli-generator-'))
  const catalogPath = path.join(directory, 'catalog.txt')
  await writeFile(catalogPath, catalog.content, 'utf8')
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { catalog, catalogPath, directory }
}

function deckPayload() {
  return {
    name: 'CLI deck',
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
    summary: 'Built through a CLI.',
  }
}

function currentDeck() {
  const payload = deckPayload()
  return {
    metadata: { name: payload.name },
    leader: { id: payload.leaderId, count: 1 },
    secondleader: null,
    base: { id: payload.baseId, count: 1 },
    deck: payload.drawDeck.map(({ cardId, count }) => ({ id: cardId, count })),
    sideboard: payload.sideboard.map(({ cardId, count }) => ({ id: cardId, count })),
  }
}

function config(provider, directory, overrides = {}) {
  return {
    provider,
    cliExecutable: provider === 'codex-cli' ? 'codex' : 'claude',
    cliModel: provider === 'codex-cli' ? 'gpt-5.6-sol' : 'claude-sonnet-4-6',
    cliReasoningEffort: 'high',
    cliWorkPath: directory,
    cliStatePath: '',
    cliMaxConcurrency: 1,
    cliMaxOutputBytes: 1048576,
    cliTimeoutMs: 600000,
    ...overrides,
  }
}

test('Codex CLI generation uses stdin, structured output, model, and reasoning settings', async (t) => {
  const { catalog, catalogPath, directory } = await fixture(t)
  let request
  const generator = createCliDeckGenerator(
    config('codex-cli', directory, { cliWebSearchEnabled: true }),
    {
    ensureCatalogArtifact: async () => ({ ...catalog, outputPath: catalogPath }),
    async runCli(value) {
      request = value
      return {
        stdout: [
          JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
          JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(deckPayload()) } }),
          JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }),
        ].join('\n'),
        stderr: '',
      }
    },
    },
  )

  const result = await generator.generate('Build a test deck.')

  assert.ok(request.input.includes('<catalog>'))
  assert.ok(request.input.includes('Build a test deck.'))
  assert.ok(request.input.includes('Web search is available'))
  assert.deepEqual(request.args.slice(0, 2), ['--search', 'exec'])
  assert.ok(request.args.includes('--output-schema'))
  assert.deepEqual(request.args.slice(request.args.indexOf('--model'), request.args.indexOf('--model') + 2), ['--model', 'gpt-5.6-sol'])
  assert.ok(request.args.includes('model_reasoning_effort=high'))
  assert.equal(result.deck.drawDeck.length, 50)
  assert.equal(result.usage.totalTokens, 15)
})

test('Codex CLI chat attaches images to new and resumed turns', async (t) => {
  const { catalog, catalogPath, directory } = await fixture(t)
  const requests = []
  const imagePath = path.join(directory, 'deck-screenshot.png')
  await writeFile(imagePath, 'test image')
  const generator = createCliDeckGenerator(
    config('codex-cli', directory),
    {
      ensureCatalogArtifact: async () => ({
        ...catalog,
        outputPath: catalogPath,
      }),
      async runCli(value) {
        requests.push(value)
        return {
          stdout: [
            JSON.stringify({
              type: 'thread.started',
              thread_id: 'codex-image-thread',
            }),
            JSON.stringify({
              type: 'item.completed',
              item: {
                type: 'agent_message',
                text: JSON.stringify({
                  operation: 'answer',
                  message: 'I inspected the image.',
                  deck: null,
                  changes: [],
                }),
              },
            }),
          ].join('\n'),
          stderr: '',
        }
      },
    },
  )
  const collection = {
    revision: 6,
    cards: [{ cardId: 'TST_003', count: 2 }],
  }
  const imageAttachment = {
    contentType: 'image/png',
    path: imagePath,
    size: 10,
  }

  const first = await generator.chat(
    'Inspect this image.',
    currentDeck(),
    null,
    [],
    { collection, imageAttachment },
  )
  await generator.chat(
    'Inspect it again.',
    currentDeck(),
    first.responseId,
    [],
    { collection, includeCollection: false, imageAttachment },
  )

  for (const request of requests) {
    const imageArgument = request.args.indexOf('--image')
    assert.notEqual(imageArgument, -1)
    assert.equal(request.args[imageArgument + 1], imagePath)
  }
  assert.deepEqual(requests[1].args.slice(0, 2), ['exec', 'resume'])
  assert.ok(requests[1].args.includes('codex-image-thread'))
  assert.ok(requests[0].input.includes('"TST":[[3,2]]'))
  assert.ok(!requests[0].input.includes('"revision":6'))
  assert.ok(requests[1].input.includes('Player card collection: unchanged'))
  assert.ok(requests[1].input.includes('Card group notation'))
  assert.ok(!requests[1].input.includes('"revision":6'))
})

test('CLI chat validates card collection modifications', async (t) => {
  const { catalog, catalogPath, directory } = await fixture(t)
  let request
  const generator = createCliDeckGenerator(
    config('claude-cli', directory),
    {
      ensureCatalogArtifact: async () => ({
        ...catalog,
        outputPath: catalogPath,
      }),
      async runCli(value) {
        request = value
        return {
          stdout: JSON.stringify({
            session_id: 'collection-session',
            structured_output: {
              operation: 'modify',
              message: 'I added two owned copies.',
              deck: null,
              changes: [
                {
                  type: 'add',
                  zone: 'collection',
                  cardId: 'TST_003',
                  count: 2,
                },
              ],
            },
            usage: { input_tokens: 10, output_tokens: 4 },
          }),
          stderr: '',
        }
      },
    },
  )

  const result = await generator.chat(
    'Add two copies to my collection.',
    currentDeck(),
    null,
    [],
    { collection: { revision: 3, cards: [] } },
  )

  assert.match(request.input, /Player card collection[^]*\n\{\}/)
  assert.doesNotMatch(request.input, /"revision":3/)
  assert.equal(result.changes[0].zone, 'collection')
  assert.deepEqual(result.collection, {
    revision: 3,
    cards: [{ cardId: 'TST_003', count: 2 }],
  })
})

test('Claude CLI chat resumes its native session without resending the catalog', async (t) => {
  const { catalog, catalogPath, directory } = await fixture(t)
  const requests = []
  const generator = createCliDeckGenerator(
    config('claude-cli', directory, { cliWebSearchEnabled: true }),
    {
    ensureCatalogArtifact: async () => ({ ...catalog, outputPath: catalogPath }),
    async runCli(value) {
      requests.push(value)
      return {
        stdout: JSON.stringify({
          session_id: 'claude-session',
          structured_output: {
            operation: 'answer',
            message: 'A test answer.',
            deck: null,
            changes: [],
          },
          usage: { input_tokens: 20, output_tokens: 4 },
        }),
        stderr: '',
      }
    },
    },
  )

  const firstDeck = currentDeck()
  const collection = {
    revision: 8,
    cards: [{ cardId: 'TST_004', count: 1 }],
  }
  const first = await generator.chat(
    'Explain this deck.',
    firstDeck,
    null,
    [
      { deckId: 'deck-one', deck: firstDeck },
      {
        deckId: 'deck-two',
        deck: {
          ...firstDeck,
          metadata: { name: 'Other CLI deck' },
        },
      },
    ],
    { collection },
  )
  await generator.chat(
    'What about its curve?',
    currentDeck(),
    first.responseId,
    [],
    { collection, includeCollection: false },
  )

  assert.ok(requests[0].input.includes('<catalog>'))
  assert.ok(requests[0].input.includes('Deck library snapshots loaded'))
  assert.ok(requests[0].input.includes('Other CLI deck'))
  assert.ok(!requests[1].input.includes('<catalog>'))
  assert.ok(!requests[1].input.includes('Deck library snapshots loaded'))
  assert.deepEqual(
    requests[1].args.slice(requests[1].args.indexOf('--resume')),
    ['--resume', 'claude-session'],
  )
  assert.ok(requests[0].args.includes('--json-schema'))
  assert.deepEqual(
    requests[0].args.slice(requests[0].args.indexOf('--tools'), requests[0].args.indexOf('--tools') + 2),
    ['--tools', 'WebSearch,WebFetch'],
  )
  assert.deepEqual(
    requests[0].args.slice(requests[0].args.indexOf('--allowedTools'), requests[0].args.indexOf('--allowedTools') + 2),
    ['--allowedTools', 'WebSearch,WebFetch'],
  )
  assert.ok(requests[0].input.includes('Web search is available'))
  assert.ok(requests[0].input.includes('"cardCounts":{"drawDeck":50,"sideboard":10}'))
  assert.ok(requests[1].input.includes('"cardCounts":{"drawDeck":50,"sideboard":10}'))
  assert.ok(requests[0].input.includes('"TST":[[4,1]]'))
  assert.ok(!requests[0].input.includes('"revision":8'))
  assert.ok(requests[1].input.includes('Player card collection: unchanged'))
  assert.ok(!requests[1].input.includes('"revision":8'))
  assert.ok(requests[0].input.includes('Compact card groups are JSON objects'))
  assert.equal(first.usage.totalTokens, 24)
})
