import { getCardPreviewLayout } from '../catalog/card-preview.js'
import { revealImage } from '../shared/image.js'
import type { AgentCardPreviewState } from './use-agent-card-preview.js'

export function AgentCardHoverPreview({
  preview,
}: {
  preview: AgentCardPreviewState
}) {
  const title = [preview.card.name, preview.card.subtitle]
    .filter(Boolean)
    .join(' — ')
  const isHorizontal = ['Leader', 'Base'].includes(preview.card.type)
  const layout = getCardPreviewLayout({
    anchorX: preview.anchorX,
    anchorY: preview.anchorY,
    horizontal: isHorizontal,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  })

  return (
    <aside
      aria-hidden="true"
      className={`agent-card-hover-preview${isHorizontal ? ' is-horizontal' : ''}`}
      style={layout}
    >
      <img
        src={preview.card.url ?? undefined}
        alt={title}
        decoding="async"
        draggable="false"
        onLoad={revealImage}
      />
    </aside>
  )
}
