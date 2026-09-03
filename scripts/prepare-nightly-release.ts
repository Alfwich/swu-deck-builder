import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STABLE_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextPatchVersion(version) {
  const match = STABLE_VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(`Expected a stable semantic version, received '${version}'.`);
  }

  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function updateManifestVersions(packageManifest, packageLock, version) {
  if (!STABLE_VERSION_PATTERN.test(version)) {
    throw new Error(`Expected a stable semantic version, received '${version}'.`);
  }
  if (!packageLock.packages?.['']) {
    throw new Error('package-lock.json is missing its root package metadata.');
  }

  return {
    packageManifest: { ...packageManifest, version },
    packageLock: {
      ...packageLock,
      version,
      packages: {
        ...packageLock.packages,
        '': { ...packageLock.packages[''], version },
      },
    },
  };
}

function escapeMarkdownText(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
}

export function buildReleaseNotes({ version, previousVersion, commits, repositoryUrl }) {
  if (commits.length === 0) {
    throw new Error('Cannot prepare a nightly release without any new commits.');
  }

  const changes = commits.map(({ hash, subject }) => {
    const shortHash = hash.slice(0, 7);
    return `- ${escapeMarkdownText(subject)} ([${shortHash}](${repositoryUrl}/commit/${hash}))`;
  });

  return `# SWU Deck Builder ${version} — Automated patch release

This automated release contains the changes merged since ${previousVersion}.

[Open the hosted app](https://swu.wuteri.ch/) · [View the project on GitHub](${repositoryUrl})

## Changes since ${previousVersion}

${changes.join('\n')}

See the [full comparison](${repositoryUrl}/compare/v${previousVersion}...v${version}) for every changed file.

## Get ${version}

Download the package for your platform from the **Assets** section below:

- **Windows x64:** \`SWU.Deck.Builder-${version}.Setup.exe\`
- **macOS, Apple Silicon or Intel:** \`SWU.Deck.Builder.dmg\`; use the universal \`.zip\` if you prefer an archive
- **Debian or Ubuntu Linux x64:** \`swu-deck-builder_${version}_amd64.deb\`
- **Fedora or RHEL Linux x64:** \`swu-deck-builder-${version}-1.x86_64.rpm\`

Saved decks, owned cards, browser chat state, and desktop settings remain local and are preserved when upgrading.

## Notes

- Windows and Linux packages currently target x64 systems.
- The macOS package is universal and supports both Apple Silicon and Intel Macs.
- Windows and macOS builds may not yet be code-signed, and macOS builds may not be notarized.
- This independent fan project is not affiliated with or endorsed by Lucasfilm Ltd., Fantasy Flight Games, TCGplayer, or SWUDB.
`;
}

function parseArguments(argv) {
  const previousTagIndex = argv.indexOf('--previous-tag');
  const previousTag = argv[previousTagIndex + 1];
  if (previousTagIndex === -1 || !previousTag) {
    throw new Error('Usage: node scripts/prepare-nightly-release.js --previous-tag v1.2.3');
  }
  if (!/^v\d+\.\d+\.\d+$/.test(previousTag)) {
    throw new Error(`Previous tag '${previousTag}' is not a stable semantic-version tag.`);
  }
  return { previousTag };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readCommits(previousTag, rootDirectory) {
  const output = execFileSync(
    'git',
    ['log', '--reverse', '--format=%H%x09%s', `${previousTag}..HEAD`],
    { cwd: rootDirectory, encoding: 'utf8' },
  ).trim();

  if (!output) return [];
  return output.split(/\r?\n/).map((line) => {
    const separator = line.indexOf('\t');
    if (separator === -1) {
      throw new Error(`Could not parse git log entry '${line}'.`);
    }
    return { hash: line.slice(0, separator), subject: line.slice(separator + 1) };
  });
}

export function prepareNightlyRelease({ rootDirectory, previousTag, repositoryUrl }) {
  const packagePath = path.join(rootDirectory, 'package.json');
  const lockPath = path.join(rootDirectory, 'package-lock.json');
  const packageManifest = readJson(packagePath);
  const packageLock = readJson(lockPath);
  const previousVersion = previousTag.slice(1);

  for (const [name, version] of [
    ['package.json', packageManifest.version],
    ['package-lock.json', packageLock.version],
    ['package-lock.json root package', packageLock.packages?.['']?.version],
  ]) {
    if (version !== previousVersion) {
      throw new Error(`${name} version '${version}' does not match ${previousTag}.`);
    }
  }

  const version = nextPatchVersion(previousVersion);
  const notesPath = path.join(rootDirectory, 'docs', 'releases', `${version}.md`);
  if (existsSync(notesPath)) {
    throw new Error(`Refusing to overwrite existing release notes at ${notesPath}.`);
  }

  const commits = readCommits(previousTag, rootDirectory);
  const updated = updateManifestVersions(packageManifest, packageLock, version);
  const notes = buildReleaseNotes({ version, previousVersion, commits, repositoryUrl });

  writeFileSync(packagePath, `${JSON.stringify(updated.packageManifest, null, 2)}\n`);
  writeFileSync(lockPath, `${JSON.stringify(updated.packageLock, null, 2)}\n`);
  writeFileSync(notesPath, notes);

  return { version, tag: `v${version}`, notesPath };
}

function run() {
  const { previousTag } = parseArguments(process.argv.slice(2));
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error('GITHUB_REPOSITORY must identify the release repository.');
  }

  const result = prepareNightlyRelease({
    rootDirectory,
    previousTag,
    repositoryUrl: `${serverUrl}/${repository}`,
  });

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${result.version}\ntag=${result.tag}\nnotes_path=${path.relative(rootDirectory, result.notesPath).replaceAll('\\', '/')}\n`,
    );
  }
  console.log(`Prepared ${result.tag}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  run();
}
