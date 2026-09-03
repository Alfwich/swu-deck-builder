import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function formatScriptHelp(scripts, scriptsInfo) {
  const names = Object.keys(scripts)
  const width = Math.max(...names.map((name) => name.length))
  const commands = names.map(
    (name) => `  npm run ${name.padEnd(width)}  ${scriptsInfo[name]}`,
  )

  return ['Available npm commands:', '', ...commands].join('\n')
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
      pathToFileURL(resolve(process.argv[1])).href === import.meta.url,
  )
}

if (isMainModule()) {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )

  console.log(formatScriptHelp(packageJson.scripts, packageJson.scriptsInfo))
}
