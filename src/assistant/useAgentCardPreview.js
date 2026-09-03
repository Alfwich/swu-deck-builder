import { useCallback, useEffect, useState } from 'react'

export function useAgentCardPreview() {
  const [preview, setPreview] = useState(null)
  const visible = preview !== null

  const hide = useCallback(() => setPreview(null), [])
  const show = useCallback((card, event) => {
    const isPointerEvent = event.type.startsWith('pointer')
    const bounds = event.currentTarget.getBoundingClientRect()
    setPreview({
      card,
      anchorX: isPointerEvent ? event.clientX : bounds.right,
      anchorY: isPointerEvent
        ? event.clientY
        : bounds.top + bounds.height / 2,
    })
  }, [])

  useEffect(() => {
    if (!visible) return undefined

    const hidePreviewOutsideTrigger = (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[data-agent-card-preview]')
      ) {
        hide()
      }
    }

    window.addEventListener('blur', hide)
    window.addEventListener('pointermove', hidePreviewOutsideTrigger, {
      passive: true,
    })
    return () => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('pointermove', hidePreviewOutsideTrigger)
    }
  }, [hide, visible])

  return { hide, preview, show }
}
