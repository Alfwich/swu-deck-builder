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
    cliTimeoutMs: 120000,
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
  )
  await generator.chat('What about its curve?', currentDeck(), first.responseId)

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
  assert.equal(first.usage.totalTokens, 24)
})
