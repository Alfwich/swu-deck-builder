import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'

const STYLE_PATHS = [
  '../src/styles/foundation.css',
  '../src/styles/shell-and-library.css',
  '../src/styles/assistant.css',
  '../src/styles/deck-workspace.css',
]

export async function readStyles() {
  const styles = await Promise.all(
    STYLE_PATHS.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
  )
  return styles.join('\n')
}
