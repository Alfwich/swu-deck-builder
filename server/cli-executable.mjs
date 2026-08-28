import { accessSync, constants, statSync } from 'node:fs'
import path from 'node:path'

const WINDOWS_EXTENSIONS = ['.exe', '.com', '.cmd', '.bat', '.ps1']

function isUsableFile(filePath, platform) {
  try {
    if (!statSync(filePath).isFile()) {
      return false
    }
    accessSync(filePath, platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

function candidateNames(command, platform, environment) {
  if (platform !== 'win32' || path.extname(command)) {
    return [command]
  }

  const configured = String(environment.PATHEXT ?? '')
    .split(';')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean)
  const extensions = [...new Set([...configured, ...WINDOWS_EXTENSIONS])]
  return [...extensions.map((extension) => `${command}${extension}`), command]
}

export function resolveCliExecutable({
  command,
  override = '',
  environment = process.env,
  platform = process.platform,
} = {}) {
  const requested = String(override || command || '').trim()
  if (!requested || requested.includes('\0')) {
    return ''
  }

  const hasPath = path.isAbsolute(requested) || /[\\/]/.test(requested)
  if (hasPath) {
    const resolved = path.resolve(requested)
    return isUsableFile(resolved, platform) ? resolved : ''
  }

  const pathEntries = String(environment.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)

  for (const directory of pathEntries) {
    for (const name of candidateNames(requested, platform, environment)) {
      const candidate = path.resolve(directory, name)
      if (isUsableFile(candidate, platform)) {
        return candidate
      }
    }
  }

  return ''
}
