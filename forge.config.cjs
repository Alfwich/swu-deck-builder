const { MakerDeb } = require('@electron-forge/maker-deb')
const { MakerDMG } = require('@electron-forge/maker-dmg')
const { MakerRpm } = require('@electron-forge/maker-rpm')
const { MakerSquirrel } = require('@electron-forge/maker-squirrel')
const { MakerZIP } = require('@electron-forge/maker-zip')
const { readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { parseEnv } = require('node:util')

const desktopIcon = './desktop/assets/icon'
const windowsIconUrl =
  'https://raw.githubusercontent.com/Alfwich/swu-deck-builder/master/desktop/assets/icon.ico'
const linuxPackageOptions = {
  categories: ['Game'],
  description: 'A local-first Star Wars: Unlimited deck builder.',
  genericName: 'Deck Builder',
  homepage: 'https://github.com/Alfwich/swu-deck-builder',
  icon: `${desktopIcon}.png`,
  name: 'swu-deck-builder',
  productDescription:
    'Build, save, validate, and improve Star Wars: Unlimited decks locally.',
  productName: 'SWU Deck Builder',
}

function desktopGoogleDriveClientSecret() {
  const configured = process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET?.trim()
  if (configured) return configured
  try {
    return String(
      parseEnv(readFileSync(path.join(__dirname, '.env'), 'utf8'))
        .GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET ?? '',
    ).trim()
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return ''
  }
}

function injectDesktopGoogleDriveClientSecret(
  buildPath,
  _electronVersion,
  _platform,
  _arch,
  callback,
) {
  try {
    const clientSecret = desktopGoogleDriveClientSecret()
    if (!clientSecret) {
      throw new Error(
        'GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET is required to package the desktop app.',
      )
    }
    const target = path.join(
      buildPath,
      'desktop',
      'google-drive-client-secret.mjs',
    )
    writeFileSync(
      target,
      `// Generated during Electron packaging.\nexport const GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET = ${JSON.stringify(clientSecret)}\n`,
      'utf8',
    )
    callback()
  } catch (error) {
    callback(error)
  }
}

module.exports = {
  packagerConfig: {
    afterCopy: [injectDesktopGoogleDriveClientSecret],
    appBundleId: 'ch.wuteri.swu-deck-builder',
    appCategoryType: 'public.app-category.games',
    asar: true,
    executableName: 'swu-deck-builder',
    icon: desktopIcon,
    ignore: [
      /^[\\/]\.env(?:\.|$)/,
      /^[\\/]\.git(?:[\\/]|$)/,
      /^[\\/]artifacts(?:[\\/]|$)/,
      /^[\\/]data[\\/]cache(?:[\\/]|$)/,
      /^[\\/]data[\\/]local(?:[\\/]|$)/,
      /^[\\/]data[\\/]agent[\\/]openai-file-cache\.json$/,
      /^[\\/]docs(?:[\\/]|$)/,
      /^[\\/]ops(?:[\\/]|$)/,
      /^[\\/]out(?:[\\/]|$)/,
      /^[\\/]public(?:[\\/]|$)/,
      /^[\\/]scripts(?:[\\/]|$)/,
      /^[\\/]src(?:[\\/]|$)/,
      /^[\\/]test(?:[\\/]|$)/,
      /^[\\/](?:AGENTS\.md|eslint\.config\.js|vite\.config\.js)$/,
    ],
    name: 'SWU Deck Builder',
  },
  makers: [
    new MakerSquirrel({
      iconUrl: windowsIconUrl,
      name: 'swu_deck_builder',
      setupIcon: `${desktopIcon}.ico`,
    }),
    new MakerDMG({
      icon: `${desktopIcon}.icns`,
      name: 'SWU Deck Builder',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({
      options: {
        ...linuxPackageOptions,
        maintainer: 'SWU Deck Builder contributors',
      },
    }),
    new MakerRpm({
      options: {
        ...linuxPackageOptions,
        group: 'Amusements/Games',
        license: 'WTFPL',
      },
    }),
  ],
}
