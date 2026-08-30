import { randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_AGENT_IMAGE_BYTES = 10 * 1024 * 1024

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

export const AGENT_IMAGE_CONTENT_TYPES = Object.freeze(
  Object.keys(IMAGE_TYPES),
)

export class AgentImageError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'AgentImageError'
    this.status = status
  }
}

function normalizedContentType(value) {
  return String(value ?? '').split(';', 1)[0].trim().toLowerCase()
}

export function validateAgentImage(bytes, declaredContentType) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new AgentImageError('The image upload is empty.')
  }
  if (bytes.length > MAX_AGENT_IMAGE_BYTES) {
    throw new AgentImageError('Images must be 10 MB or smaller.', 413)
  }

  const contentType = normalizedContentType(declaredContentType)
  const imageType = IMAGE_TYPES[contentType]
  if (!imageType) {
    throw new AgentImageError(
      'Only PNG, JPEG, and WebP images are supported.',
      415,
    )
  }
  if (!imageType.matches(bytes)) {
    throw new AgentImageError(
      'The image contents do not match the declared file type.',
      415,
    )
  }

  return { contentType, extension: imageType.extension, size: bytes.length }
}

export function createAgentImageStore(
  directory,
  {
    createToken = () => randomBytes(24).toString('base64url'),
    maxEntries = 100,
    maxEntriesPerOwner = 5,
    now = () => Date.now(),
    ttlMs = 5 * 60 * 1000,
  } = {},
) {
  const entries = new Map()
  const expiryTimers = new Map()

  async function remove(token) {
    const entry = entries.get(token)
    if (!entry) return false
    entries.delete(token)
    clearTimeout(expiryTimers.get(token))
    expiryTimers.delete(token)
    try {
      await unlink(entry.path)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    return true
  }

  async function sweep() {
    const timestamp = now()
    const expiredTokens = [...entries]
      .filter(([, entry]) => !entry.claimed && entry.expiresAt <= timestamp)
      .map(([token]) => token)
    await Promise.all(expiredTokens.map((token) => remove(token)))
  }

  async function stage(bytes, declaredContentType, owner) {
    if (typeof owner !== 'string' || !owner) {
      throw new AgentImageError('A valid agent session is required.', 401)
    }

    const image = validateAgentImage(bytes, declaredContentType)
    await sweep()
    const ownerEntryCount = [...entries.values()]
      .filter((entry) => entry.owner === owner)
      .length
    if (ownerEntryCount >= maxEntriesPerOwner) {
      throw new AgentImageError(
        `Up to ${maxEntriesPerOwner} images can be queued at once.`,
        409,
      )
    }
    if (entries.size >= maxEntries) {
      throw new AgentImageError(
        'Image uploads are busy. Please try again shortly.',
        503,
      )
    }

    const token = createToken()
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token) || entries.has(token)) {
      throw new Error('Could not create a safe agent image token.')
    }

    await mkdir(directory, { recursive: true })
    const imagePath = path.join(directory, `${token}${image.extension}`)
    await writeFile(imagePath, bytes, { flag: 'wx', mode: 0o600 })
    const entry = {
      ...image,
      claimed: false,
      expiresAt: now() + ttlMs,
      owner,
      path: imagePath,
      token,
    }
    entries.set(token, entry)
    const expiryTimer = setTimeout(() => {
      const current = entries.get(token)
      if (!current || current.claimed || current.expiresAt > now()) return
      remove(token).catch((error) => {
        console.warn('Expired agent image cleanup failed:', error)
      })
    }, ttlMs)
    expiryTimer.unref?.()
    expiryTimers.set(token, expiryTimer)
    return {
      token,
      contentType: entry.contentType,
      size: entry.size,
    }
  }

  return {
    stage,
    async claim(token, owner) {
      await sweep()
      const entry = entries.get(token)
      if (!entry || entry.owner !== owner || entry.claimed) return null
      entry.claimed = true
      return { ...entry }
    },
    get(token) {
      const entry = entries.get(token)
      return entry ? { ...entry } : null
    },
    remove,
    async removeOwner(owner) {
      await Promise.all(
        [...entries]
          .filter(([, entry]) => entry.owner === owner)
          .map(([token]) => remove(token)),
      )
    },
    async sweep() {
      await sweep()
      return entries.size
    },
    async close() {
      await Promise.all([...entries.keys()].map((token) => remove(token)))
    },
  }
}

// Compatibility aliases for packaged desktop versions that still use the
// original module names while the image pipeline is shared with the web app.
export const MAX_DESKTOP_IMAGE_BYTES = MAX_AGENT_IMAGE_BYTES
export const DESKTOP_IMAGE_CONTENT_TYPES = AGENT_IMAGE_CONTENT_TYPES
export const DesktopImageError = AgentImageError
export const validateDesktopImage = validateAgentImage
export const createDesktopImageStore = createAgentImageStore
