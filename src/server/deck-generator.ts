import { createCliDeckGenerator } from './cli-deck-generator.js'
import { createOpenAiDeckGenerator } from './openai-deck-generator.js'

export function createDeckGenerator(config, dependencies = {}) {
  return config.provider === 'openai-api'
    ? createOpenAiDeckGenerator(config, dependencies.openAi)
    : createCliDeckGenerator(config, dependencies.cli)
}
