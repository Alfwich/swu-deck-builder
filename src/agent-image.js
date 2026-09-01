export const AGENT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
export const AGENT_IMAGE_CAMERA_CAPTURE = 'environment'
export const AGENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const MAX_AGENT_IMAGE_ATTACHMENTS = 5

const SUPPORTED_TYPES = new Set(AGENT_IMAGE_ACCEPT.split(','))

export function agentImageSelectionTitle(attachmentCount, actionTitle) {
  return attachmentCount >= MAX_AGENT_IMAGE_ATTACHMENTS
    ? `Up to ${MAX_AGENT_IMAGE_ATTACHMENTS} images can be queued at once.`
    : actionTitle
}

export function validateAgentImageFile(file) {
  if (!file || typeof file !== 'object') {
    return 'Choose an image to attach.'
  }
  if (!SUPPORTED_TYPES.has(file.type)) {
    return 'Only PNG, JPEG, and WebP images are supported.'
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return 'The selected image is empty.'
  }
  if (file.size > AGENT_IMAGE_MAX_BYTES) {
    return 'Images must be 10 MB or smaller.'
  }
  return ''
}

export function clipboardImageFiles(clipboardData) {
  const images = []
  for (const item of clipboardData?.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile?.() ?? null
      if (file) images.push(file)
    }
  }
  return images.slice(0, MAX_AGENT_IMAGE_ATTACHMENTS)
}

export function droppedImageFiles(dataTransfer) {
  const files = [...(dataTransfer?.files ?? [])].filter((file) =>
    file?.type?.startsWith('image/'),
  )
  if (files.length > 0) return files

  const images = []
  for (const item of dataTransfer?.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile?.() ?? null
      if (file) images.push(file)
    }
  }
  return images
}

export function agentImageQueuePrompt(prompt, position, total) {
  if (total <= 1) return prompt

  const imageNumber = position + 1
  if (imageNumber < total) {
    return `${prompt}\n\nAnalyze only attached image ${imageNumber} of ${total} in this turn. Retain its findings for the remaining image turns. Return an informational answer only and do not propose or repeat any changes yet.`
  }

  return `${prompt}\n\nAnalyze attached image ${imageNumber} of ${total}. This is the final image. Combine the findings from all ${total} images into one complete response. If the request changes the deck or card library, return a single proposal containing the complete combined set exactly once.`
}

export function shouldPresentAgentImageProposal(position, total) {
  return total <= 1 || position === total - 1
}

export function agentImageDisplayName(file) {
  const name = typeof file?.name === 'string' ? file.name.trim() : ''
  return name || 'Pasted image'
}

export function formatAgentImageSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
