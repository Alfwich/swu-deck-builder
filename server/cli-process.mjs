import { spawn } from 'node:child_process'
import path from 'node:path'

function childEnvironment(environment, additions) {
  const exactNames = new Set([
    'PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC',
    'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA',
    'LANG', 'LC_ALL', 'TERM', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy',
    'no_proxy',
  ])
  const prefixes = ['CODEX_', 'OPENAI_', 'CLAUDE_', 'ANTHROPIC_']
  const filtered = {}

  for (const [name, value] of Object.entries(environment)) {
    if (
      value !== undefined &&
      (exactNames.has(name) || prefixes.some((prefix) => name.startsWith(prefix)))
    ) {
      filtered[name] = value
    }
  }

  return { ...filtered, ...additions }
}

function createGate(maxConcurrency) {
  let active = 0
  const waiters = []

  async function enter() {
    if (active >= maxConcurrency) {
      await new Promise((resolve) => waiters.push(resolve))
    }
    active += 1
  }

  function leave() {
    active -= 1
    waiters.shift()?.()
  }

  return { enter, leave }
}

export function createCliProcessRunner(config, dependencies = {}) {
  const spawnProcess = dependencies.spawnProcess ?? spawn
  const gate = createGate(config.cliMaxConcurrency ?? 1)

  return async function runCli({ args, input, env = {} }) {
    await gate.enter()
    try {
      return await new Promise((resolve, reject) => {
        const useShell = process.platform === 'win32' &&
          ['.cmd', '.bat'].includes(path.extname(config.cliExecutable).toLowerCase())
        const child = spawnProcess(config.cliExecutable, args, {
          cwd: config.cliWorkPath,
          env: childEnvironment(process.env, env),
          shell: useShell,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let outputBytes = 0
        let settled = false
        let forcedError = null

        const finish = (callback) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          callback()
        }
        const stop = (error) => {
          if (forcedError) return
          forcedError = error
          child.kill()
        }
        const collect = (target) => (chunk) => {
          outputBytes += chunk.length
          if (outputBytes > config.cliMaxOutputBytes) {
            stop(new Error('AI CLI output exceeded the configured limit.'))
            return
          }
          if (target === 'stdout') stdout += chunk.toString('utf8')
          else stderr += chunk.toString('utf8')
        }

        child.stdout.on('data', collect('stdout'))
        child.stderr.on('data', collect('stderr'))
        child.on('error', (error) => finish(() => reject(forcedError ?? error)))
        child.on('close', (code, signal) => finish(() => {
          if (forcedError) {
            reject(forcedError)
            return
          }
          if (code === 0) {
            resolve({ stdout, stderr })
            return
          }
          const detail = stderr.trim().slice(-2000)
          reject(new Error(
            `AI CLI exited ${signal ? `after signal ${signal}` : `with code ${code}`}${detail ? `: ${detail}` : '.'}`,
          ))
        }))

        const timer = setTimeout(() => {
          stop(new Error(
            `AI CLI timed out after ${config.cliTimeoutMs}ms.`,
          ))
        }, config.cliTimeoutMs)
        timer.unref?.()
        child.stdin.on('error', () => {})
        child.stdin.end(input, 'utf8')
      })
    } finally {
      gate.leave()
    }
  }
}
