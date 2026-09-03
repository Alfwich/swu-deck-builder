import fs from 'node:fs'
import path from 'node:path'

const MAX_METADATA_BYTES = 4096

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function createGoogleDriveSyncStore(filePath) {
  return {
    read() {
      try {
        const source = fs.readFileSync(filePath, 'utf8')
        if (Buffer.byteLength(source, 'utf8') > MAX_METADATA_BYTES) return null
        const metadata = JSON.parse(source)
        return isObject(metadata) ? metadata : null
      } catch {
        return null
      }
    },

    write(metadata) {
      if (!isObject(metadata)) {
        throw new TypeError('Google Drive sync metadata must be an object.')
      }
      const source = `${JSON.stringify(metadata, null, 2)}\n`
      if (Buffer.byteLength(source, 'utf8') > MAX_METADATA_BYTES) {
        throw new TypeError('Google Drive sync metadata is too large.')
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      const temporaryPath = `${filePath}.${process.pid}.tmp`
      fs.writeFileSync(temporaryPath, source, {
        encoding: 'utf8',
        mode: 0o600,
      })
      fs.renameSync(temporaryPath, filePath)
      return metadata
    },
  }
}
