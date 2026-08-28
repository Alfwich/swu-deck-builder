const { MakerDeb } = require('@electron-forge/maker-deb')
const { MakerDMG } = require('@electron-forge/maker-dmg')
const { MakerRpm } = require('@electron-forge/maker-rpm')
const { MakerSquirrel } = require('@electron-forge/maker-squirrel')
const { MakerZIP } = require('@electron-forge/maker-zip')

const desktopIcon = './desktop/assets/icon'
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

module.exports = {
  packagerConfig: {
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
