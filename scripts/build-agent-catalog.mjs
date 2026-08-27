import { ensureAgentCatalogArtifact } from '../server/catalog.mjs'

const catalog = await ensureAgentCatalogArtifact()

console.log(
  `Agent catalog ready: ${catalog.metadata.cardCount.toLocaleString()} cards, SHA-256 ${catalog.hash}`,
)
console.log(catalog.outputPath)
