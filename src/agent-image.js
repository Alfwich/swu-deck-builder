export const AGENT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
export const AGENT_IMAGE_CAMERA_CAPTURE = 'environment'
export const AGENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const MAX_AGENT_IMAGE_ATTACHMENTS = 5

const SUPPORTED_TYPES = new Set(AGENT_IMAGE_ACCEPT.split(','))

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
  return total > 1
    ? `${prompt}\n\nProcess only attached image ${position + 1} of ${total} in this turn.`
    : prompt
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
