import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { app as electronApp, BrowserWindow, shell } from 'electron'
import squirrelStartup from 'electron-squirrel-startup'

import { createApp } from '../server/app.mjs'
import { loadServerConfig } from '../server/config.mjs'
import { createDesktopImageStore } from '../server/desktop-image-store.mjs'
import { createLocalDeckStore } from '../server/local-deck-store.mjs'
import {
  canOpenExternalUrl,
  createDesktopEnvironment,
  desktopIconPath,
} from './runtime.mjs'
import {
  createDesktopSettingsStore,
  desktopSettingsFromEnvironment,
} from './settings-store.mjs'

let backendServer = null
let deckStore = null
let desktopImageStore = null
let mainWindow = null

function startBackend(expressApp) {
  return new Promise((resolve, reject) => {
    const server = expressApp.listen(0, '127.0.0.1')
    server.once('error', reject)
    server.once('listening', () => resolve(server))
  })
}

function backendOrigin(server) {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('The desktop server did not expose a TCP address.')
  }
  return `http://127.0.0.1:${address.port}`
}

function closeBackend() {
  backendServer?.close()
  backendServer = null
  deckStore?.close()
  deckStore = null
  void desktopImageStore?.close()
  desktopImageStore = null
}

function restartDesktopApp() {
  setTimeout(() => {
    electronApp.relaunch()
    electronApp.quit()
  }, 250)
}

async function createMainWindow() {
  const accessToken = randomBytes(32).toString('base64url')
  const appPath = electronApp.getAppPath()
  if (!electronApp.isPackaged && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(path.join(appPath, '.env'))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }
  const settingsStore = createDesktopSettingsStore(
    path.join(electronApp.getPath('userData'), 'agent-settings.json'),
  )
  const storedSettings = settingsStore.read()
  const environment = createDesktopEnvironment({
    appPath,
    settings: storedSettings,
    userDataPath: electronApp.getPath('userData'),
  })
  const config = loadServerConfig(environment)
  const initialSettings = storedSettings ?? desktopSettingsFromEnvironment(
    environment,
    config.agenticDeckGeneration,
  )
  config.desktop = {
    accessToken,
    imageAttachmentsAvailable:
      config.agenticDeckGeneration.available &&
      config.agenticDeckGeneration.provider === 'codex-cli',
    settingsAvailable: true,
  }
  deckStore = createLocalDeckStore(config.localDeckDatabase.path)
  desktopImageStore = createDesktopImageStore(
    path.join(electronApp.getPath('userData'), 'agent-images'),
  )
  const expressApp = createApp(config, {
    desktopImageStore,
    desktopSettingsStore: {
      read() {
        const feature = config.agenticDeckGeneration
        return {
          settings: settingsStore.read() ?? initialSettings,
          effective: {
            available: feature.available,
            enabled: feature.enabled,
            executablePath: feature.cliExecutable,
            provider: feature.provider,
            unavailableReason: feature.unavailableReason,
          },
        }
      },
      write: (settings) => settingsStore.write(settings),
    },
    localDeckStore: deckStore,
    restartDesktopApp,
  })
  backendServer = await startBackend(expressApp)
  const origin = backendOrigin(backendServer)

  mainWindow = new BrowserWindow({
    backgroundColor: '#07111f',
    height: 900,
    icon: desktopIconPath(appPath),
    minHeight: 700,
    minWidth: 1000,
    show: false,
    title: 'SWU Deck Builder',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: 1280,
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (canOpenExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== `${origin}/` && !url.startsWith(`${origin}/`)) {
      event.preventDefault()
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    closeBackend()
  })

  await mainWindow.loadURL(
    `${origin}/desktop/bootstrap?token=${encodeURIComponent(accessToken)}`,
  )
}

electronApp.enableSandbox()

if (squirrelStartup) {
  electronApp.quit()
} else {
  const hasSingleInstanceLock = electronApp.requestSingleInstanceLock()
  if (!hasSingleInstanceLock) {
    electronApp.quit()
  } else {
    electronApp.on('second-instance', () => {
      if (mainWindow?.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow?.show()
      mainWindow?.focus()
    })

    electronApp.whenReady().then(createMainWindow).catch((error) => {
      console.error('Could not start the SWU Deck Builder desktop app:', error)
      electronApp.quit()
    })

    electronApp.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && !mainWindow) {
        void createMainWindow()
      }
    })

    electronApp.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        electronApp.quit()
      }
    })

    electronApp.on('before-quit', closeBackend)
  }
}
