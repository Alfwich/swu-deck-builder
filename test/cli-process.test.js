import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createCliProcessRunner } from '../server/cli-process.mjs'

async function runner(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swu-cli-process-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return createCliProcessRunner({
    cliExecutable: process.execPath,
    cliWorkPath: directory,
    cliMaxConcurrency: 1,
    cliMaxOutputBytes: 1024,
    cliTimeoutMs: 1000,
    ...overrides,
  })
}

test('CLI runner sends prompts through stdin', async (t) => {
  const run = await runner(t)
  const result = await run({
    args: ['-e', 'process.stdin.pipe(process.stdout)'],
    input: 'private prompt',
  })

  assert.equal(result.stdout, 'private prompt')
})

test('CLI runner bounds output and execution time', async (t) => {
  const outputRun = await runner(t, { cliMaxOutputBytes: 10 })
  await assert.rejects(
    outputRun({
      args: ['-e', "process.stdout.write('x'.repeat(100))"],
      input: '',
    }),
    /output exceeded/,
  )

  const timeoutRun = await runner(t, { cliTimeoutMs: 25 })
  await assert.rejects(
    timeoutRun({ args: ['-e', 'setInterval(() => {}, 1000)'], input: '' }),
    /timed out/,
  )
})
