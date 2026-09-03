import { useEffect, useRef, useState } from 'react'

import {
  MAX_AGENT_IMAGE_ATTACHMENTS,
  agentImageDisplayName,
  validateAgentImageFile,
} from './agent-image.js'
import { createChatMessageId } from './agent-session.js'
import type { AgentImageAttachment } from '../types/assistant.js'

export interface QueuedAgentImage extends AgentImageAttachment {
  id: string
  previewUrl: string
  size: number
}

export function useAgentImages(available: boolean) {
  const [images, setImages] = useState<QueuedAgentImage[]>([])
  const [error, setError] = useState('')
  const previousImagesRef = useRef<QueuedAgentImage[]>([])

  useEffect(() => {
    const currentUrls = new Set(images.map(({ previewUrl }) => previewUrl))
    previousImagesRef.current.forEach(({ previewUrl }) => {
      if (!currentUrls.has(previewUrl)) URL.revokeObjectURL(previewUrl)
    })
    previousImagesRef.current = images
  }, [images])

  useEffect(
    () => () => {
      previousImagesRef.current.forEach(({ previewUrl }) =>
        URL.revokeObjectURL(previewUrl),
      )
    },
    [],
  )

  useEffect(() => {
    if (available) return undefined
    const timeoutId = window.setTimeout(() => {
      setImages([])
      setError('')
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [available])

  function add(files: Iterable<File>) {
    if (!available) return

    const selectedFiles = [...files]
    if (
      selectedFiles.length === 0 ||
      images.length + selectedFiles.length > MAX_AGENT_IMAGE_ATTACHMENTS
    ) {
      setError(
        `Attach no more than ${MAX_AGENT_IMAGE_ATTACHMENTS} images at a time.`,
      )
      return
    }

    const validationError = selectedFiles
      .map((file) => validateAgentImageFile(file))
      .find(Boolean)
    if (validationError) {
      setError(validationError)
      return
    }

    setImages((current) => [
      ...current,
      ...selectedFiles.map((file) => ({
        file,
        id: createChatMessageId(),
        name: agentImageDisplayName(file),
        previewUrl: URL.createObjectURL(file),
        size: file.size,
      })),
    ])
    setError('')
  }

  function remove(imageId: string) {
    setImages((current) =>
      current.filter((attachment) => attachment.id !== imageId),
    )
    setError('')
  }

  return {
    add,
    error,
    images,
    remove,
    setError,
    setImages,
  }
}
