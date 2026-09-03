const VIEWPORT_MARGIN = 12
const CURSOR_GAP = 18

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function getCardPreviewLayout({
  anchorX,
  anchorY,
  horizontal = false,
  viewportHeight,
  viewportWidth,
}: {
  anchorX: number
  anchorY: number
  horizontal?: boolean
  viewportHeight: number
  viewportWidth: number
}) {
  const aspectRatio = horizontal ? 7 / 5 : 5 / 7
  const preferredWidth = horizontal ? 420 : 320
  const availableWidth = Math.max(viewportWidth - VIEWPORT_MARGIN * 2, 1)
  const availableHeight = Math.max(viewportHeight - VIEWPORT_MARGIN * 2, 1)
  const width = Math.min(
    preferredWidth,
    availableWidth,
    availableHeight * aspectRatio,
  )
  const height = width / aspectRatio
  const maximumLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
  const maximumTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN)
  const fitsToRight =
    anchorX + CURSOR_GAP + width <= viewportWidth - VIEWPORT_MARGIN
  const preferredLeft = fitsToRight
    ? anchorX + CURSOR_GAP
    : anchorX - CURSOR_GAP - width

  return {
    height,
    left: clamp(preferredLeft, VIEWPORT_MARGIN, maximumLeft),
    top: clamp(anchorY - CURSOR_GAP, VIEWPORT_MARGIN, maximumTop),
    width,
  }
}
