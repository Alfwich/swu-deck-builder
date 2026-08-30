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
  assert.equal(chartGroup.test.test('/project/src/DeckAnalysis.jsx'), false)
})
