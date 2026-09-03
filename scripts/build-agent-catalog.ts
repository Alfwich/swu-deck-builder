import { ensureAgentCatalogArtifact } from '../src/server/catalog.js'

const catalog = await ensureAgentCatalogArtifact()

console.log(
  `Agent catalog ready: ${catalog.metadata.cardCount.toLocaleString()} cards, SHA-256 ${catalog.hash}`,
)
console.log(catalog.outputPath)
