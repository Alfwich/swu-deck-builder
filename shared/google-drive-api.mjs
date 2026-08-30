export const GOOGLE_DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive.appdata'

const DRIVE_FILE_NAME = 'swu-deck-builder-player-database.json'
const DRIVE_FIELDS = 'id,name,modifiedTime,version,size'

export function googleDriveError(message, code = '') {
  const error = new Error(message)
  error.code = code
  return error
}

async function responseError(response, fallback) {
  const payload = await response.json().catch(() => ({}))
  return googleDriveError(payload?.error?.message || fallback)
}

function snapshotIdFromSource(source) {
  try {
    const payload = JSON.parse(source)
    return typeof payload?.snapshotId === 'string' ? payload.snapshotId : ''
  } catch {
    return ''
  }
}


export function createGoogleDriveApi({ fetchImpl, getAccessToken }) {
  async function authorizedFetch(url, options = {}, retry = true) {
    const token = await getAccessToken({ forceRefresh: false })
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    })
    if (response.status === 401 && retry) {
      await getAccessToken({ forceRefresh: true })
      return authorizedFetch(url, options, false)
    }
    return response
  }

  async function listBackups() {
    const parameters = new globalThis.URLSearchParams({
      fields: `files(${DRIVE_FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageSize: '10',
      q: `name = '${DRIVE_FILE_NAME}' and trashed = false`,
      spaces: 'appDataFolder',
    })
    const response = await authorizedFetch(
      `https://www.googleapis.com/drive/v3/files?${parameters}`,
    )
    if (!response.ok) {
      throw await responseError(response, 'Google Drive backups could not be listed.')
    }
    const payload = await response.json()
    return payload.files ?? []
  }

  async function readBackup(file) {
    const response = await authorizedFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    )
    if (!response.ok) {
      throw await responseError(response, 'The Google Drive backup could not be read.')
    }
    return {
      fileId: file.id,
      savedAt: file.modifiedTime,
      source: await response.text(),
      version: String(file.version ?? ''),
    }
  }

  async function createBackupFile(source) {
    const boundary = `swu-backup-${globalThis.crypto.randomUUID()}`
    const metadata = JSON.stringify({
      mimeType: 'application/json',
      name: DRIVE_FILE_NAME,
      parents: ['appDataFolder'],
    })
    const body = [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      metadata,
      `\r\n--${boundary}\r\n`,
      'Content-Type: application/json\r\n\r\n',
      source,
      `\r\n--${boundary}--`,
    ].join('')
    const parameters = new globalThis.URLSearchParams({
      fields: DRIVE_FIELDS,
      uploadType: 'multipart',
    })
    const response = await authorizedFetch(
      `https://www.googleapis.com/upload/drive/v3/files?${parameters}`,
      {
        body,
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        method: 'POST',
      },
    )
    if (!response.ok) {
      throw await responseError(response, 'The Google Drive backup file could not be created.')
    }
    return response.json()
  }

  async function uploadBackup(file, source) {
    const parameters = new globalThis.URLSearchParams({
      fields: DRIVE_FIELDS,
      uploadType: 'media',
    })
    const response = await authorizedFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?${parameters}`,
      {
        body: source,
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )
    if (!response.ok) {
      throw await responseError(response, 'The Google Drive backup could not be uploaded.')
    }
    return response.json()
  }

  return {
    async load() {
      const [file] = await listBackups()
      return file ? readBackup(file) : null
    },

    async save(source, {
      expectedSnapshotId = '',
      expectedVersion = '',
      force = false,
    } = {}) {
      const [existing] = await listBackups()
      const versionChanged =
        existing &&
        (!expectedVersion || String(existing.version ?? '') !== expectedVersion)
      if (versionChanged && !force) {
        const current = expectedSnapshotId
          ? await readBackup(existing)
          : null
        if (
          !current ||
          snapshotIdFromSource(current.source) !== expectedSnapshotId
        ) {
          throw googleDriveError(
            'The Google Drive backup changed on another device.',
            'remote_conflict',
          )
        }
      }
      const saved = existing
        ? await uploadBackup(existing, source)
        : await createBackupFile(source)
      return {
        fileId: saved.id,
        savedAt: saved.modifiedTime,
        source,
        version: String(saved.version ?? ''),
      }
    },
  }
}
