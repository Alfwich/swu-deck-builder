import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('assistant messages use safe Markdown with styled strong text', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])

  assert.match(app, /import Markdown from 'react-markdown'/)
  assert.match(app, /<Markdown[^]*skipHtml/)
  assert.match(app, /createAgentCardReferenceMarkdownPlugin\(cardsById\)/)
  assert.match(css, /\.agent-chat-markdown strong\s*{[^}]*font-weight:\s*850;/)
})

test('Markdown card previews keep stable renderers and clear defensively', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

  assert.match(app, /const AGENT_MARKDOWN_COMPONENTS =/)
  assert.match(app, /const AgentMessageText = memo\(/)
  assert.match(app, /components=\{AGENT_MARKDOWN_COMPONENTS\}/)
  assert.match(app, /createAgentCardReferenceMarkdownPlugin\(cardsById\)/)
  assert.match(app, /useEffect\(\(\) => \(\) => onHidePreview\(\)/)
  assert.match(app, /data-agent-card-preview="true"/)
  assert.match(app, /window\.addEventListener\('pointermove', hidePreviewOutsideTrigger/)
  assert.doesNotMatch(app, /<Markdown[^]*components=\{\{/)
})
