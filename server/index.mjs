import os from 'node:os'
import path from 'node:path'

import { createApp } from './app.mjs'
import { loadServerConfig } from './config.mjs'
import { createAgentImageStore } from './desktop-image-store.mjs'

const config = loadServerConfig()
const supportsAgentImages = config.agenticDeckGeneration.available &&
  ['codex-cli', 'openai-api'].includes(
    config.agenticDeckGeneration.provider,
  )
const agentImageStore = supportsAgentImages
  ? createAgentImageStore(
      path.join(
        os.tmpdir(),
        `swu-deck-builder-agent-images-${process.pid}`,
      ),
    )
  : null
const app = createApp(config, { agentImageStore })

const server = app.listen(config.port, config.host, () => {
  const feature = config.agenticDeckGeneration
  const state = !feature.enabled
    ? 'disabled'
    : feature.accessAllowedIps.length === 0
      ? 'enabled but no client IPs are allowed'
    : feature.available
      ? `available via ${feature.provider}`
      : `enabled but unavailable: ${feature.unavailableReason}`

  console.log(`SWU Deck Builder server: http://${config.host}:${config.port}`)
  console.log(`Agentic deck generation: ${state}`)
})

function shutdown() {
  server.close(async (error) => {
    try {
      await agentImageStore?.close()
    } catch (cleanupError) {
      console.error('Agent image cleanup failed:', cleanupError)
      process.exitCode = 1
    }
    if (error) {
      console.error('Server shutdown failed:', error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
