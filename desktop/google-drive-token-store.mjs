import fs from 'node:fs'
import path from 'node:path'

export function createGoogleDriveTokenStore(filePath, safeStorage) {
  function encryptionAvailable() {
    return safeStorage?.isEncryptionAvailable?.() === true
  }

  return {
    available: encryptionAvailable,

    clear() {
      try {
        fs.unlinkSync(filePath)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    },

    read() {
      if (!encryptionAvailable()) return ''
      try {
        const encrypted = Buffer.from(fs.readFileSync(filePath, 'utf8'), 'base64')
        return safeStorage.decryptString(encrypted).trim()
      } catch {
        return ''
      }
    },

    write(refreshToken) {
      if (!encryptionAvailable()) {
        throw new Error(
          'Google Drive cannot be connected because secure credential storage is unavailable.',
        )
      }
      const encrypted = safeStorage.encryptString(String(refreshToken))
      const temporaryPath = `${filePath}.tmp`
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(temporaryPath, encrypted.toString('base64'), {
        encoding: 'utf8',
        mode: 0o600,
      })
      fs.renameSync(temporaryPath, filePath)
    },
  }
}
