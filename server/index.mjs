import { createApp } from './app.mjs'
import { loadServerConfig } from './config.mjs'

const config = loadServerConfig()
const app = createApp(config)

app.listen(config.port, config.host, () => {
  const feature = config.agenticDeckGeneration
  const state = !feature.enabled
    ? 'disabled'
    : feature.available
      ? 'available'
      : 'enabled but missing SWU_OPENAI_API_KEY'

  console.log(`SWU Deck Builder server: http://${config.host}:${config.port}`)
  console.log(`Agentic deck generation: ${state}`)
})
