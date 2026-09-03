import assert from 'node:assert/strict'
import test from 'node:test'

import createViteConfig from '../vite.config.js'

test('production builds split Chart.js into a dedicated chunk', () => {
  const config = createViteConfig({ command: 'build', mode: 'production' })
  const chartGroup = config.build.rolldownOptions.output.codeSplitting.groups.find(
    ({ name }) => name === 'charts',
  )

  assert.ok(chartGroup)
  assert.equal(chartGroup.test.test('/project/node_modules/chart.js/dist/chart.js'), true)
  assert.equal(chartGroup.test.test('/project/src/web/decks/deck-analysis-view.tsx'), false)
})

test('production builds split Markdown rendering into a dedicated chunk', () => {
  const config = createViteConfig({ command: 'build', mode: 'production' })
  const markdownGroup = config.build.rolldownOptions.output.codeSplitting.groups.find(
    ({ name }) => name === 'markdown',
  )

  assert.ok(markdownGroup)
  assert.equal(
    markdownGroup.test.test('/project/node_modules/react-markdown/index.js'),
    true,
  )
  assert.equal(
    markdownGroup.test.test('/project/node_modules/micromark/index.js'),
    true,
  )
  assert.equal(markdownGroup.test.test('/project/src/web/app/app.tsx'), false)
})
