const { MakerSquirrel } = require('@electron-forge/maker-squirrel')

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'swu-deck-builder',
    icon: './public/favicon.ico',
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
      setupIcon: './public/favicon.ico',
    }),
  ],
}
