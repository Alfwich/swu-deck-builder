import { createCliDeckGenerator } from './cli-deck-generator.mjs'
import { createOpenAiDeckGenerator } from './openai-deck-generator.mjs'

export function createDeckGenerator(config, dependencies = {}) {
  return config.provider === 'openai-api'
    ? createOpenAiDeckGenerator(config, dependencies.openAi)
    : createCliDeckGenerator(config, dependencies.cli)
}
