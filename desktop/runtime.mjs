import path from 'node:path'

export function createDesktopEnvironment({
  appPath,
  baseEnvironment = process.env,
  settings = null,
  userDataPath,
}) {
  const environment = {
    ...baseEnvironment,
    NODE_ENV: 'production',
    SWU_APP_RUNTIME: 'electron',
    APP_SERVER_HOST: '127.0.0.1',
    APP_DIST_PATH: path.join(appPath, 'dist'),
    LOCAL_DECK_DATABASE_PATH: path.join(userDataPath, 'decks.sqlite'),
    SWU_CATALOG_PATH: path.join(appPath, 'data', 'catalog.json'),
    SWU_AGENT_CATALOG_PATH: path.join(
      appPath,
      'data',
      'agent',
      'catalog.txt',
    ),
    SWU_OPENAI_FILE_CACHE_PATH: path.join(
      userDataPath,
      'openai-file-cache.json',
    ),
    AGENT_CLI_WORK_PATH: path.join(userDataPath, 'agent-cli'),
  }

  if (!settings) {
    return environment
  }

  return {
    ...environment,
    AGENTIC_DECK_GENERATION_ENABLED:
      settings.provider === 'disabled' ? 'false' : 'true',
    AGENTIC_DECK_PROVIDER: ['codex-cli', 'claude-cli'].includes(
      settings.provider,
    ) ? settings.provider : '',
    AGENT_CLI_PATH: settings.executablePath,
    AGENT_CLI_MODEL: settings.model,
    AGENT_CLI_REASONING_EFFORT: settings.reasoningEffort,
    AGENT_CLI_WEB_SEARCH_ENABLED: String(settings.webSearchEnabled),
  }
}

export function canOpenExternalUrl(value) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
