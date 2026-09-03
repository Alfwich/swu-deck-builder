import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { readStyles } from './support/read-styles.js'

test('open assistant uses its header close control and reclaims launcher space', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/web/assistant/agent-chat-panel.tsx', import.meta.url), 'utf8'),
    readStyles(),
  ])
  const launcher = app.match(
    /\{!isOpen && \(\s*(<button[\s\S]+?className="agent-chat__launcher"[\s\S]+?<\/button>)\s*\)\}/,
  )?.[1]
  const mobileStyles = css.match(
    /@media \(max-width: 640px\) \{([\s\S]+?)@media \(prefers-reduced-motion: reduce\)/,
  )?.[1]

  assert.ok(launcher)
  assert.match(launcher, /aria-label="Open AI deck assistant"/)
  assert.match(app, /aria-label="Close AI deck assistant"/)
  assert.match(css, /\.agent-chat__panel\s*\{[^}]*bottom:\s*0/)
  assert.match(
    mobileStyles,
    /\.agent-chat\.is-open\s*\{[^}]*bottom:\s*0/,
  )
  assert.match(
    mobileStyles,
    /\.agent-chat\.is-open\s*\{[^}]*height:\s*100dvh/,
  )
  assert.match(
    mobileStyles,
    /\.agent-chat__panel\s*\{[^}]*bottom:\s*0[^}]*height:\s*min\([\s\S]*?76vh \+ 4\.2rem \+ var\(--app-footer-height\)/,
  )
})

test('assistant width is resizable and its translucent panel keeps backdrop blur', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/web/assistant/agent-chat-panel.tsx', import.meta.url), 'utf8'),
    readStyles(),
  ])

  assert.match(app, /className="agent-chat__width-resize-handle"/)
  assert.match(app, /aria-orientation="vertical"/)
  assert.match(app, /handleWidthResizePointerMove/)
  assert.match(app, /handleWidthResizeKeyDown/)
  assert.match(app, /className="agent-chat__corner-resize-handle"/)
  assert.match(app, /handleCornerResizePointerMove/)
  assert.match(app, /handleCornerResizeKeyDown/)
  assert.match(css, /\.agent-chat__width-resize-handle\s*{[^}]*cursor:\s*ew-resize/)
  assert.match(css, /\.agent-chat__corner-resize-handle\s*{[^}]*cursor:\s*nesw-resize/)
  assert.match(css, /\.agent-chat__resize-handle::after\s*{[^}]*width:\s*100%[^}]*height:\s*1px/)
  assert.match(css, /\.agent-chat__width-resize-handle::after\s*{[^}]*width:\s*1px[^}]*height:\s*100%/)
  assert.match(css, /\.agent-chat__resize-handle::after\s*{[^}]*opacity:\s*0/)
  assert.match(css, /\.agent-chat__resize-handle:hover::after[\s\S]+?opacity:\s*1/)
  assert.doesNotMatch(css, /\.agent-chat__corner-resize-handle::after/)
  assert.match(
    css,
    /is-resizing-corner \.agent-chat__resize-handle::after[\s\S]+?is-resizing-corner \.agent-chat__width-resize-handle::after/,
  )
  assert.match(
    css,
    /\.agent-chat__panel\s*{[^}]*background:[^;]*94%[^;]*;[^}]*backdrop-filter:\s*blur\(20px\)/,
  )
})

test('mobile composer hides submitted images and uses a single-line prompt', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/web/assistant/agent-chat-panel.tsx', import.meta.url), 'utf8'),
    readStyles(),
  ])
  const mobileStyles = css.match(
    /@media \(max-width: 640px\) \{([\s\S]+?)@media \(prefers-reduced-motion: reduce\)/,
  )?.[1]

  assert.match(
    app,
    /\{status !== 'loading' && imageAttachments\.length > 0 && \(/,
  )
  assert.match(
    mobileStyles,
    /\.agent-chat__composer textarea\s*\{[^}]*height:\s*2\.65rem[^}]*min-height:\s*2\.65rem/,
  )
  assert.match(
    app,
    /isMobileLayout\s*\? 'Ask or modify your deck…'\s*: 'Modify a deck, build a new one, or ask a question…'/,
  )
})

test('assistant composer stays focused and editable while a request is pending', async () => {
  const [panel, app] = await Promise.all([
    readFile(new URL('../src/web/assistant/agent-chat-panel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/app/app.tsx', import.meta.url), 'utf8'),
  ])
  const textarea = panel.match(/<textarea[\s\S]+?\/>/)?.[0]
  const sendButton = panel.match(
    /<button\s+className="agent-chat__send"[\s\S]+?<\/button>/,
  )?.[0]

  assert.ok(textarea)
  assert.ok(sendButton)
  assert.match(textarea, /disabled=\{!available\}/)
  assert.doesNotMatch(textarea, /disabled=\{[^}]*status === 'loading'/)
  assert.match(
    textarea,
    /if \(status !== 'loading'\) \{\s*event\.currentTarget\.form\?\.requestSubmit\(\)/,
  )
  assert.match(sendButton, /status === 'loading'/)
  assert.match(app, /if \(agentChatStatus === 'loading'\) return/)
  assert.match(
    app,
    /restoreAgentChatDraft\(current, submittedInput, basePrompt\)/,
  )
})

test('collection proposal rows offer independent apply and dismiss actions', async () => {
  const app = await readFile(new URL('../src/web/assistant/agent-messages.tsx', import.meta.url), 'utf8')

  assert.match(app, /className="agent-chat-change__actions"/)
  assert.match(
    app,
    /change\.zone === 'collection'[\s\S]+?onDismiss\(change\.id\)[\s\S]+?Dismiss/,
  )
})

test('proposal actions wait for every image turn in the active batch', async () => {
  const [panel, messages] = await Promise.all([
    readFile(new URL('../src/web/assistant/agent-chat-panel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/web/assistant/agent-messages.tsx', import.meta.url), 'utf8'),
  ])
  const proposal = messages.match(
    /function AgentChatProposal\(\{([\s\S]+?)const AgentMarkdownContext/,
  )?.[1]

  assert.ok(proposal)
  assert.match(panel, /<AgentChatProposal\s+disabled=\{status === 'loading'\}/)
  assert.match(proposal, /<AgentChatChangeRow[\s\S]+?disabled=\{disabled\}/)
  assert.match(
    proposal,
    /className="agent-chat__proposal-actions"[\s\S]+?disabled=\{disabled\}[\s\S]+?disabled=\{disabled\}/,
  )
})

test('image batching instructions stay out of the visible user message', async () => {
  const app = await readFile(new URL('../src/web/app/app.tsx', import.meta.url), 'utf8')
  const queue = app.match(
    /async function processAgentChatQueue\(\{([\s\S]+?)async function handleAgentChatSubmit/,
  )?.[1]

  assert.ok(queue)
  assert.match(
    queue,
    /const requestPrompt = agentImageQueuePrompt\([\s\S]+?const userMessage = createAgentChatUserMessage\(\s*basePrompt,/,
  )
  assert.match(queue, /prompt: requestPrompt/)
})
