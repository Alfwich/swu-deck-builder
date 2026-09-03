import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { readStyles } from './support/read-styles.js'

test('assistant messages use safe Markdown with styled strong text', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/web/assistant/agent-messages.tsx', import.meta.url), 'utf8'),
    readStyles(),
  ])

  assert.match(app, /import Markdown(?:, \{ type Components \})? from 'react-markdown'/)
  assert.match(app, /<Markdown[^]*skipHtml/)
  assert.match(app, /createAgentCardReferenceMarkdownPlugin\(cardsById\)/)
  assert.match(css, /\.agent-chat-markdown strong\s*{[^}]*font-weight:\s*850;/)
})

test('Markdown card previews keep stable renderers and clear defensively', async () => {
  const [panel, app] = await Promise.all([
    readFile(new URL('../src/web/assistant/agent-messages.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/assistant/use-agent-card-preview.ts', import.meta.url), 'utf8'),
  ])
  const source = `${panel}\n${app}`

  assert.match(source, /const AGENT_MARKDOWN_COMPONENTS =/)
  assert.match(source, /const AgentMessageText = memo\(/)
  assert.match(source, /components=\{AGENT_MARKDOWN_COMPONENTS\}/)
  assert.match(source, /createAgentCardReferenceMarkdownPlugin\(cardsById\)/)
  assert.match(source, /useEffect\(\(\) => \(\) => onHidePreview\(\)/)
  assert.match(source, /data-agent-card-preview="true"/)
  assert.doesNotMatch(source, /data-agent-card-preview="true"[^>]*\btitle=/)
  assert.match(source, /window\.addEventListener\('pointermove', hidePreviewOutsideTrigger/)
  assert.doesNotMatch(source, /<Markdown[^]*components=\{\{/)
})
