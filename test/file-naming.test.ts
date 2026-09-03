import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TYPESCRIPT_FILENAME =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.(?:config|d|test))?\.(?:ts|tsx)$/;

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );

  return files.flat();
}

test('TypeScript filenames use lowercase kebab-case', async () => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const sourceDirectories = [
    'scripts',
    'src',
    'test',
  ];
  const files = (
    await Promise.all(
      sourceDirectories.map((directory) => listFiles(join(projectRoot, directory))),
    )
  )
    .flat()
    .filter((path) => /\.tsx?$/.test(path));
  files.push(join(projectRoot, 'vite.config.ts'));

  const inconsistentFilenames = files
    .map((path) => basename(path))
    .filter((filename) => !TYPESCRIPT_FILENAME.test(filename))
    .sort();

  assert.deepEqual(inconsistentFilenames, []);
});
