export const GOOGLE_DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive.appdata'

const DRIVE_FILE_NAME = 'swu-deck-builder-player-database.json'
const DRIVE_FIELDS = 'id,name,modifiedTime,version,size'

interface GoogleDriveFile {
  id: string
  modifiedTime: string
  version?: string | number
}

interface GoogleDriveSnapshot {
  fileId: string
  savedAt: string
  source: string
  version: string
}

interface GoogleDriveApiOptions {
  fetchImpl: typeof fetch
  getAccessToken(options: { forceRefresh: boolean }): Promise<string>
}

interface GoogleDriveSaveOptions {
  expectedSnapshotId?: string
  expectedVersion?: string
  force?: boolean
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function googleDriveError(message: string, code = '') {
  return Object.assign(new Error(message), { code })
}

async function responseError(response: Response, fallback: string) {
  const payload: unknown = await response.json().catch(() => ({}))
  const error = isObject(payload) && isObject(payload.error)
    ? payload.error.message
    : null
  return googleDriveError(typeof error === 'string' && error ? error : fallback)
}

function snapshotIdFromSource(source: string) {
  try {
    const payload: unknown = JSON.parse(source)
    return isObject(payload) && typeof payload.snapshotId === 'string'
      ? payload.snapshotId
      : ''
  } catch {
    return ''
  }
}


export function createGoogleDriveApi({
  fetchImpl,
  getAccessToken,
}: GoogleDriveApiOptions) {
  async function authorizedFetch(
    url: string,
    options: RequestInit = {},
    retry = true,
  ): Promise<Response> {
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
    const payload: unknown = await response.json()
    return isObject(payload) && Array.isArray(payload.files)
      ? payload.files as GoogleDriveFile[]
      : []
  }

  async function readBackup(file: GoogleDriveFile): Promise<GoogleDriveSnapshot> {
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

  async function createBackupFile(source: string): Promise<GoogleDriveFile> {
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
    return response.json() as Promise<GoogleDriveFile>
  }

  async function uploadBackup(
    file: GoogleDriveFile,
    source: string,
  ): Promise<GoogleDriveFile> {
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
    return response.json() as Promise<GoogleDriveFile>
  }

  return {
    async load() {
      const [file] = await listBackups()
      return file ? readBackup(file) : null
    },

    async save(source: string, {
      expectedSnapshotId = '',
      expectedVersion = '',
      force = false,
    }: GoogleDriveSaveOptions = {}): Promise<GoogleDriveSnapshot> {
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
