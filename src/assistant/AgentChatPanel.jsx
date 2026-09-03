import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {
  AGENT_CHAT_RESIZE_STEP,
  AGENT_CHAT_TOP_BAR_CLEARANCE,
  canNavigateAgentPromptHistory,
  clampAgentChatHeight,
  clampAgentChatWidth,
  getAgentAccessNotice,
  getAgentChatScrollKey,
  getAgentChatSizeAfterResize,
  getCompactAgentChatHeight,
  hasSavedAgentChatSize,
  loadAgentChatSize,
  navigateAgentPromptHistory,
  saveAgentChatSize,
} from '../agent-chat.js'
import {
  AGENT_IMAGE_ACCEPT,
  AGENT_IMAGE_CAMERA_CAPTURE,
  MAX_AGENT_IMAGE_ATTACHMENTS,
  agentImageSelectionTitle,
  clipboardImageFiles,
  droppedImageFiles,
  formatAgentImageSize,
} from '../agent-image.js'
import { handleAgentImageInputChange } from './agent-session.js'
import { DictationControl } from './DictationControl.jsx'
import {
  AgentChatProposal,
  AgentMessageText,
} from './AgentMessages.jsx'
import { useMediaQuery } from '../shared/useMediaQuery.js'

export function AgentChatPanel({
  accessAvailable,
  available,
  cardReferences,
  desktopSettingsAvailable,
  error,
  featureResolved,
  history,
  imageAttachments,
  imageAttachmentsAvailable,
  imageError,
  input,
  isOpen,
  messages,
  onApplyChange,
  onApplyProposal,
  onDismissProposal,
  onDismissChange,
  onImagesSelected,
  onInputChange,
  onHidePreview,
  onOpenDesktopSettings,
  onPreviewCard,
  onRemoveImage,
  onSubmit,
  onToggle,
  status,
  topBarRef,
}) {
  const messagesRef = useRef(null)
  const panelRef = useRef(null)
  const cameraInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const imageDragDepthRef = useRef(0)
  const resizePointerOffsetRef = useRef(0)
  const resizeWidthPointerOffsetRef = useRef(0)
  const historyDraftRef = useRef('')
  const historyIndexRef = useRef(null)
  const hasSavedSizeRef = useRef(
    hasSavedAgentChatSize(window.localStorage),
  )
  const [isImageDragActive, setIsImageDragActive] = useState(false)
  const [agentChatSize, setAgentChatSize] = useState(
    () => loadAgentChatSize(window.localStorage),
  )
  const [resizeDirection, setResizeDirection] = useState(null)
  const [panelHeight, setPanelHeight] = useState(null)
  const [panelWidth, setPanelWidth] = useState(null)
  const isMobileLayout = useMediaQuery('(max-width: 640px)')
  const isCompact = agentChatSize === 'small'
  const scrollKey = getAgentChatScrollKey(messages, status)
  const accessNotice = getAgentAccessNotice({
    resolved: featureResolved,
    available: accessAvailable,
    desktopSettingsAvailable,
  })

  useEffect(() => {
    const container = messagesRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [scrollKey])

  useEffect(() => {
    historyDraftRef.current = ''
    historyIndexRef.current = null
  }, [history, isOpen])

  useEffect(() => {
    if (!desktopSettingsAvailable || hasSavedSizeRef.current) return

    hasSavedSizeRef.current = true
    setAgentChatSize('small')
    saveAgentChatSize(window.localStorage, 'small')
  }, [desktopSettingsAvailable])

  useLayoutEffect(() => {
    if (!isOpen) return

    const panel = panelRef.current
    if (!panel) return
    const panelBounds = panel.getBoundingClientRect()
    const topBarBottom = topBarRef.current?.getBoundingClientRect().bottom
    const bounds = {
      panelBottom: panelBounds.bottom,
      viewportHeight: window.innerHeight,
      ...(Number.isFinite(topBarBottom)
        ? { topBoundary: topBarBottom + AGENT_CHAT_TOP_BAR_CLEARANCE }
        : {}),
    }

    setPanelHeight((currentHeight) =>
      currentHeight === null && isCompact
        ? getCompactAgentChatHeight(bounds)
        : clampAgentChatHeight({
            ...bounds,
            height: currentHeight ?? panelBounds.height,
          }),
    )
    if (!isMobileLayout) {
      setPanelWidth((currentWidth) =>
        clampAgentChatWidth({
          width: currentWidth ?? panelBounds.width,
          panelLeft: panelBounds.left,
          viewportWidth: window.innerWidth,
        }),
      )
    }
  }, [isCompact, isMobileLayout, isOpen, topBarRef])

  useEffect(() => {
    if (!isOpen) return undefined

    function clampToViewport() {
      const panel = panelRef.current
      if (!panel) return
      const panelBounds = panel.getBoundingClientRect()
      const topBarBottom = topBarRef.current?.getBoundingClientRect().bottom

      setPanelHeight((currentHeight) =>
        clampAgentChatHeight({
            height: currentHeight ?? panelBounds.height,
            panelBottom: panelBounds.bottom,
            viewportHeight: window.innerHeight,
            ...(Number.isFinite(topBarBottom)
              ? { topBoundary: topBarBottom + AGENT_CHAT_TOP_BAR_CLEARANCE }
              : {}),
          }),
      )
      if (!isMobileLayout) {
        setPanelWidth((currentWidth) =>
          clampAgentChatWidth({
            width: currentWidth ?? panelBounds.width,
            panelLeft: panelBounds.left,
            viewportWidth: window.innerWidth,
          }),
        )
      }
    }

    window.addEventListener('resize', clampToViewport)
    return () => window.removeEventListener('resize', clampToViewport)
  }, [isMobileLayout, isOpen, topBarRef])

  function resizePanelToPointer(clientY) {
    const panel = panelRef.current
    if (!panel) return

    const panelBottom = panel.getBoundingClientRect().bottom
    const topBarBottom = topBarRef.current?.getBoundingClientRect().bottom
    setPanelHeight(
      clampAgentChatHeight({
        height: panelBottom - clientY + resizePointerOffsetRef.current,
        panelBottom,
        viewportHeight: window.innerHeight,
        ...(Number.isFinite(topBarBottom)
          ? { topBoundary: topBarBottom + AGENT_CHAT_TOP_BAR_CLEARANCE }
          : {}),
      }),
    )
  }

  function handleResizePointerDown(event) {
    if (event.button !== 0) return

    event.preventDefault()
    resizePointerOffsetRef.current =
      event.clientY - panelRef.current.getBoundingClientRect().top
    event.currentTarget.setPointerCapture(event.pointerId)
    setAgentChatSize(getAgentChatSizeAfterResize)
    setResizeDirection('height')
  }

  function handleResizePointerMove(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    resizePanelToPointer(event.clientY)
  }

  function resizePanelWidthToPointer(clientX) {
    const panel = panelRef.current
    if (!panel) return

    const panelBounds = panel.getBoundingClientRect()
    setPanelWidth(
      clampAgentChatWidth({
        width:
          clientX - panelBounds.left + resizeWidthPointerOffsetRef.current,
        panelLeft: panelBounds.left,
        viewportWidth: window.innerWidth,
      }),
    )
  }

  function handleWidthResizePointerDown(event) {
    if (event.button !== 0 || isMobileLayout) return

    event.preventDefault()
    resizeWidthPointerOffsetRef.current =
      panelRef.current.getBoundingClientRect().right - event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
    setAgentChatSize(getAgentChatSizeAfterResize)
    setResizeDirection('width')
  }

  function handleWidthResizePointerMove(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    resizePanelWidthToPointer(event.clientX)
  }

  function handleCornerResizePointerDown(event) {
    if (event.button !== 0 || isMobileLayout) return

    const panel = panelRef.current
    if (!panel) return

    event.preventDefault()
    const panelBounds = panel.getBoundingClientRect()
    resizePointerOffsetRef.current = event.clientY - panelBounds.top
    resizeWidthPointerOffsetRef.current = panelBounds.right - event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
    setAgentChatSize(getAgentChatSizeAfterResize)
    setResizeDirection('corner')
  }

  function handleCornerResizePointerMove(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    resizePanelToPointer(event.clientY)
    resizePanelWidthToPointer(event.clientX)
  }

  function finishPanelResize(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizePointerOffsetRef.current = 0
    resizeWidthPointerOffsetRef.current = 0
    setResizeDirection(null)
  }

  function handleResizeKeyDown(event) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return

    const panel = panelRef.current
    if (!panel) return

    event.preventDefault()
    setAgentChatSize(getAgentChatSizeAfterResize)
    const panelBounds = panel.getBoundingClientRect()
    const topBarBottom = topBarRef.current?.getBoundingClientRect().bottom
    const requestedHeight = event.key === 'ArrowUp'
      ? panelBounds.height + AGENT_CHAT_RESIZE_STEP
      : event.key === 'ArrowDown'
        ? panelBounds.height - AGENT_CHAT_RESIZE_STEP
        : event.key === 'Home'
          ? 0
          : Number.MAX_SAFE_INTEGER
    setPanelHeight(
      clampAgentChatHeight({
        height: requestedHeight,
        panelBottom: panelBounds.bottom,
        viewportHeight: window.innerHeight,
        ...(Number.isFinite(topBarBottom)
          ? { topBoundary: topBarBottom + AGENT_CHAT_TOP_BAR_CLEARANCE }
          : {}),
      }),
    )
  }

  function handleWidthResizeKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

    const panel = panelRef.current
    if (!panel || isMobileLayout) return

    event.preventDefault()
    setAgentChatSize(getAgentChatSizeAfterResize)
    const panelBounds = panel.getBoundingClientRect()
    const requestedWidth = event.key === 'ArrowRight'
      ? panelBounds.width + AGENT_CHAT_RESIZE_STEP
      : event.key === 'ArrowLeft'
        ? panelBounds.width - AGENT_CHAT_RESIZE_STEP
        : event.key === 'Home'
          ? 0
          : Number.MAX_SAFE_INTEGER
    setPanelWidth(
      clampAgentChatWidth({
        width: requestedWidth,
        panelLeft: panelBounds.left,
        viewportWidth: window.innerWidth,
      }),
    )
  }

  function handleCornerResizeKeyDown(event) {
    if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
      handleResizeKeyDown(event)
    } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      handleWidthResizeKeyDown(event)
    } else if (['Home', 'End'].includes(event.key)) {
      handleResizeKeyDown(event)
      handleWidthResizeKeyDown(event)
    }
  }

  function handlePaste(event) {
    if (!imageAttachmentsAvailable) return

    const images = clipboardImageFiles(event.clipboardData)
    if (images.length === 0) return

    event.preventDefault()
    onImagesSelected(images)
  }

  function handleImageDragEnter(event) {
    if (!imageAttachmentsAvailable || !event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    imageDragDepthRef.current += 1
    setIsImageDragActive(true)
  }

  function handleImageDragOver(event) {
    if (!imageAttachmentsAvailable || !event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect =
      available && status !== 'loading' ? 'copy' : 'none'
  }

  function handleImageDragLeave(event) {
    if (!imageAttachmentsAvailable || !event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1)
    if (imageDragDepthRef.current === 0) setIsImageDragActive(false)
  }

  function handleImageDrop(event) {
    if (!imageAttachmentsAvailable || !event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    imageDragDepthRef.current = 0
    setIsImageDragActive(false)
    if (!available || status === 'loading') return

    const images = droppedImageFiles(event.dataTransfer)
    if (images.length > 0) onImagesSelected(images)
  }

  function handlePanelToggle() {
    imageDragDepthRef.current = 0
    setIsImageDragActive(false)
    setResizeDirection(null)
    onToggle()
  }

  function handlePanelSizeChange(nextIsCompact) {
    if (nextIsCompact === isCompact) return

    hasSavedSizeRef.current = true
    saveAgentChatSize(
      window.localStorage,
      nextIsCompact ? 'small' : 'large',
    )

    setPanelHeight(null)
    setPanelWidth(null)
    setAgentChatSize(nextIsCompact ? 'small' : 'large')
  }

  const panelStyle = {
    ...(panelHeight === null ? {} : { height: `${panelHeight}px` }),
    ...(isMobileLayout || panelWidth === null
      ? {}
      : { width: `${panelWidth}px` }),
  }

  return (
    <div className={`agent-chat${isOpen ? ' is-open' : ''}`}>
      {isOpen && (
        <aside
          ref={panelRef}
          className={`agent-chat__panel${isCompact ? ' is-compact' : ''}${
            resizeDirection ? ` is-resizing is-resizing-${resizeDirection}` : ''
          }`}
          aria-label="AI deck assistant"
          onPaste={imageAttachmentsAvailable ? handlePaste : undefined}
          style={panelStyle}
        >
          <div
            className="agent-chat__resize-handle"
            role="separator"
            aria-label="Resize AI deck assistant"
            aria-orientation="horizontal"
            aria-valuenow={panelHeight ?? undefined}
            tabIndex={0}
            title="Drag to resize. Use the up and down arrow keys for precise control."
            onKeyDown={handleResizeKeyDown}
            onPointerCancel={finishPanelResize}
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={finishPanelResize}
          />
          <div
            className="agent-chat__width-resize-handle"
            role="separator"
            aria-label="Resize AI deck assistant width"
            aria-orientation="vertical"
            aria-valuenow={panelWidth ?? undefined}
            tabIndex={0}
            title="Drag to resize width. Use the left and right arrow keys for precise control."
            onKeyDown={handleWidthResizeKeyDown}
            onPointerCancel={finishPanelResize}
            onPointerDown={handleWidthResizePointerDown}
            onPointerMove={handleWidthResizePointerMove}
            onPointerUp={finishPanelResize}
          />
          <div
            className="agent-chat__corner-resize-handle"
            role="button"
            aria-label="Resize AI deck assistant width and height"
            tabIndex={0}
            title="Drag to resize width and height. Use the arrow keys for precise control."
            onKeyDown={handleCornerResizeKeyDown}
            onPointerCancel={finishPanelResize}
            onPointerDown={handleCornerResizePointerDown}
            onPointerMove={handleCornerResizePointerMove}
            onPointerUp={finishPanelResize}
          />
          <header className="agent-chat__header">
            <div>
              <span>AI deck assistant</span>
            </div>
            <div className="agent-chat__header-actions">
              <div
                className="agent-chat__size-toggle"
                role="group"
                aria-label="AI deck assistant size"
              >
                <button
                  type="button"
                  aria-pressed={isCompact}
                  onClick={() => handlePanelSizeChange(true)}
                >
                  Small
                </button>
                <button
                  type="button"
                  aria-pressed={!isCompact}
                  onClick={() => handlePanelSizeChange(false)}
                >
                  Large
                </button>
              </div>
              <button
                type="button"
                onClick={handlePanelToggle}
                aria-label="Close AI deck assistant"
              >
                ×
              </button>
            </div>
          </header>

          <div className="agent-chat__messages" ref={messagesRef} aria-live="polite">
            {accessNotice && (
              <article className="agent-chat__availability">
                <h2>{accessNotice.title}</h2>
                <p>{accessNotice.text}</p>
                {accessNotice.features?.length > 0 && (
                  <section className="agent-chat__availability-features">
                    <h3>{accessNotice.featureTitle}</h3>
                    <ul>
                      {accessNotice.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {accessNotice.link && (
                  <a
                    href={accessNotice.link}
                    rel={accessNotice.externalLink ? 'noreferrer' : undefined}
                    target={accessNotice.externalLink ? '_blank' : undefined}
                  >
                    {accessNotice.linkLabel}
                  </a>
                )}
                {accessNotice.action === 'open-desktop-settings' && (
                  <button
                    className="agent-chat__availability-action"
                    type="button"
                    onClick={onOpenDesktopSettings}
                  >
                    {accessNotice.actionLabel}
                  </button>
                )}
              </article>
            )}

            {!accessNotice &&
              messages.map((message) => (
                <article
                  className={`agent-chat__message is-${message.role}`}
                  key={message.id}
                >
                  <span className="agent-chat__message-role">
                    {message.role === 'user'
                      ? 'You'
                      : message.role === 'system'
                        ? 'Session'
                        : 'Deck assistant'}
                  </span>
                  <AgentMessageText
                    cardsById={cardReferences}
                    onHidePreview={onHidePreview}
                    onPreviewCard={onPreviewCard}
                    text={message.text}
                  />
                  {typeof message.attachmentName === 'string' && (
                    <span className="agent-chat__message-attachment">
                      Image · {message.attachmentName}
                    </span>
                  )}
                  {Array.isArray(message.features) && (
                    <ul className="agent-chat__message-features">
                      {message.features
                        .filter((feature) => typeof feature === 'string')
                        .map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                  )}
                  {typeof message.followup === 'string' && (
                    <p className="agent-chat__message-followup">
                      {message.followup}
                    </p>
                  )}

                  {message.proposal && (
                    <AgentChatProposal
                      disabled={status === 'loading'}
                      message={message}
                      onApply={onApplyProposal}
                      onApplyChange={onApplyChange}
                      onDismiss={onDismissProposal}
                      onDismissChange={onDismissChange}
                      onHidePreview={onHidePreview}
                      onPreviewCard={onPreviewCard}
                    />
                  )}
                </article>
              ))}

            {!accessNotice && status === 'loading' && (
              <div className="agent-chat__thinking" role="status">
                <span />
                <span />
                <span />
                Thinking
              </div>
            )}
          </div>

          {accessAvailable && error && (
            <p className="agent-chat__error" role="alert">
              {error}
            </p>
          )}

          {accessAvailable && (
            <form
              className={`agent-chat__composer${isImageDragActive ? ' is-image-drag-active' : ''}`}
              onDragEnter={handleImageDragEnter}
              onDragLeave={handleImageDragLeave}
              onDragOver={handleImageDragOver}
              onDrop={handleImageDrop}
              onSubmit={onSubmit}
            >
              {isImageDragActive && (
                <div className="agent-chat__drop-target" role="status">
                  Drop images to queue them
                </div>
              )}
              {status !== 'loading' && imageAttachments.length > 0 && (
                <div className="agent-chat__attachments">
                  {imageAttachments.map((image, index) => (
                    <div className="agent-chat__attachment" key={image.id}>
                      <img
                        src={image.previewUrl}
                        alt={`Attached ${image.name}`}
                      />
                      <div>
                        <strong>{image.name}</strong>
                        <span>
                          {formatAgentImageSize(image.size)} · {index + 1} of{' '}
                          {imageAttachments.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${image.name}`}
                        disabled={status === 'loading'}
                        onClick={() => onRemoveImage(image.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {imageError && (
                <p className="agent-chat__attachment-error" role="alert">
                  {imageError}
                </p>
              )}
              <textarea
                aria-label="Message the AI deck assistant"
                disabled={!available || status === 'loading'}
                maxLength={4000}
                placeholder={
                  isMobileLayout
                    ? 'Ask or modify your deck…'
                    : 'Modify a deck, build a new one, or ask a question…'
                }
                rows={3}
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (canNavigateAgentPromptHistory({
                    altKey: event.altKey,
                    ctrlKey: event.ctrlKey,
                    key: event.key,
                    metaKey: event.metaKey,
                    selectionEnd: event.currentTarget.selectionEnd,
                    selectionStart: event.currentTarget.selectionStart,
                    shiftKey: event.shiftKey,
                    value: event.currentTarget.value,
                  })) {
                    const navigation = navigateAgentPromptHistory({
                      direction: event.key === 'ArrowUp' ? 'up' : 'down',
                      draft: historyDraftRef.current,
                      history,
                      index: historyIndexRef.current,
                      input,
                    })
                    if (navigation) {
                      event.preventDefault()
                      historyDraftRef.current = navigation.draft
                      historyIndexRef.current = navigation.index
                      onInputChange(navigation.input)
                      return
                    }
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
              />
              <div className="agent-chat__composer-actions">
                <div className="agent-chat__composer-tools">
                  <DictationControl
                    disabled={!available || status === 'loading'}
                    isElectron={desktopSettingsAvailable}
                    onTranscript={(transcript) =>
                      onInputChange(
                        [input.trimEnd(), transcript]
                          .filter(Boolean)
                          .join(' ')
                          .slice(0, 4000),
                      )
                    }
                  />
                  {imageAttachmentsAvailable && (
                    <>
                      <input
                        ref={cameraInputRef}
                        className="agent-chat__image-input"
                        type="file"
                        accept={AGENT_IMAGE_ACCEPT}
                        capture={AGENT_IMAGE_CAMERA_CAPTURE}
                        tabIndex={-1}
                        onChange={(event) =>
                          handleAgentImageInputChange(event, onImagesSelected)
                        }
                      />
                      <input
                        ref={imageInputRef}
                        className="agent-chat__image-input"
                        type="file"
                        accept={AGENT_IMAGE_ACCEPT}
                        multiple
                        tabIndex={-1}
                        onChange={(event) =>
                          handleAgentImageInputChange(event, onImagesSelected)
                        }
                      />
                      <button
                        className="agent-chat__attach"
                        type="button"
                        aria-label="Take a photo"
                        disabled={
                          !available ||
                          status === 'loading' ||
                          imageAttachments.length >= MAX_AGENT_IMAGE_ATTACHMENTS
                        }
                        title={agentImageSelectionTitle(
                          imageAttachments.length,
                          'Take a photo with this device',
                        )}
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        Photo
                      </button>
                      <button
                        className="agent-chat__attach"
                        type="button"
                        disabled={
                          !available ||
                          status === 'loading' ||
                          imageAttachments.length >= MAX_AGENT_IMAGE_ATTACHMENTS
                        }
                        title={agentImageSelectionTitle(
                          imageAttachments.length,
                          'Add images',
                        )}
                        onClick={() => imageInputRef.current?.click()}
                      >
                        <span aria-hidden="true">+</span>
                        Images
                      </button>
                    </>
                  )}
                </div>
                <button
                  className="agent-chat__send"
                  type="submit"
                  disabled={
                    !available ||
                    status === 'loading' ||
                    (!input.trim() && imageAttachments.length === 0)
                  }
                >
                  Send
                </button>
              </div>
            </form>
          )}
        </aside>
      )}

      {!isOpen && (
        <button
          className="agent-chat__launcher"
          type="button"
          aria-expanded="false"
          aria-label="Open AI deck assistant"
          title="Open AI deck assistant"
          onClick={handlePanelToggle}
        >
          <span aria-hidden="true">✦</span>
          Deck assistant
        </button>
      )}
    </div>
  )
}
