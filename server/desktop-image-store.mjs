import { randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_DESKTOP_IMAGE_BYTES = 10 * 1024 * 1024

const IMAGE_TYPES = {
  'image/jpeg': {
    extension: '.jpg',
    matches: (bytes) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  'image/png': {
    extension: '.png',
    matches: (bytes) =>
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
  },
  'image/webp': {
    extension: '.webp',
    matches: (bytes) =>
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP',
  },
}

export const DESKTOP_IMAGE_CONTENT_TYPES = Object.freeze(
  Object.keys(IMAGE_TYPES),
)

export class DesktopImageError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'DesktopImageError'
    this.status = status
  }
}

function normalizedContentType(value) {
  return String(value ?? '').split(';', 1)[0].trim().toLowerCase()
}

export function validateDesktopImage(bytes, declaredContentType) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new DesktopImageError('The image upload is empty.')
  }
  if (bytes.length > MAX_DESKTOP_IMAGE_BYTES) {
    throw new DesktopImageError('Images must be 10 MB or smaller.', 413)
  }

  const contentType = normalizedContentType(declaredContentType)
  const imageType = IMAGE_TYPES[contentType]
  if (!imageType) {
    throw new DesktopImageError(
      'Only PNG, JPEG, and WebP images are supported.',
      415,
    )
  }
  if (!imageType.matches(bytes)) {
    throw new DesktopImageError(
      'The image contents do not match the declared file type.',
      415,
    )
  }

  return { contentType, extension: imageType.extension, size: bytes.length }
}

export function createDesktopImageStore(
  directory,
  { createToken = () => randomBytes(24).toString('base64url'), maxEntries = 5 } = {},
) {
  const entries = new Map()

  async function remove(token) {
    const entry = entries.get(token)
    if (!entry) return false
    entries.delete(token)
    try {
      await unlink(entry.path)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    return true
  }

  async function stage(bytes, declaredContentType) {
    const image = validateDesktopImage(bytes, declaredContentType)
    while (entries.size >= maxEntries) {
      await remove(entries.keys().next().value)
    }

    const token = createToken()
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token) || entries.has(token)) {
      throw new Error('Could not create a safe desktop image token.')
    }

    await mkdir(directory, { recursive: true })
    const imagePath = path.join(directory, `${token}${image.extension}`)
    await writeFile(imagePath, bytes, { flag: 'wx', mode: 0o600 })
    const entry = { ...image, path: imagePath, token }
    entries.set(token, entry)
    return {
      token,
      contentType: entry.contentType,
      size: entry.size,
    }
  }

  return {
    stage,
    get(token) {
      return entries.get(token) ?? null
    },
    remove,
    async close() {
      await Promise.all([...entries.keys()].map((token) => remove(token)))
    },
  }
}
