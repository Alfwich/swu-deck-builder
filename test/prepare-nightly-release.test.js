import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReleaseNotes,
  nextPatchVersion,
  updateManifestVersions,
} from '../scripts/prepare-nightly-release.mjs';

test('nextPatchVersion increments only stable patch versions', () => {
  assert.equal(nextPatchVersion('0.12.0'), '0.12.1');
  assert.equal(nextPatchVersion('2.7.99'), '2.7.100');
  assert.throws(() => nextPatchVersion('1.2.3-beta.1'), /stable semantic version/);
});

test('updateManifestVersions updates every release version without mutating inputs', () => {
  const packageManifest = { name: 'example', version: '1.2.3' };
  const packageLock = {
    name: 'example',
    version: '1.2.3',
    packages: { '': { name: 'example', version: '1.2.3' }, dependency: { version: '4.0.0' } },
  };

  const updated = updateManifestVersions(packageManifest, packageLock, '1.2.4');

  assert.equal(updated.packageManifest.version, '1.2.4');
  assert.equal(updated.packageLock.version, '1.2.4');
  assert.equal(updated.packageLock.packages[''].version, '1.2.4');
  assert.equal(updated.packageLock.packages.dependency.version, '4.0.0');
  assert.equal(packageManifest.version, '1.2.3');
  assert.equal(packageLock.version, '1.2.3');
});

test('buildReleaseNotes includes ordered commits and release download guidance', () => {
  const notes = buildReleaseNotes({
    version: '1.2.4',
    previousVersion: '1.2.3',
    repositoryUrl: 'https://github.com/example/project',
    commits: [
      { hash: '1111111aaaaaaaa', subject: 'Add feature [one]' },
      { hash: '2222222bbbbbbbb', subject: 'Fix the follow-up' },
    ],
  });

  assert.match(notes, /Changes since 1\.2\.3/);
  assert.ok(notes.includes('Add feature \\[one\\]'));
  assert.match(notes, /commit\/1111111aaaaaaaa/);
  assert.ok(notes.indexOf('Add feature') < notes.indexOf('Fix the follow-up'));
  assert.match(notes, /SWU\.Deck\.Builder-1\.2\.4\.Setup\.exe/);
  assert.match(notes, /compare\/v1\.2\.3\.\.\.v1\.2\.4/);
});

test('buildReleaseNotes rejects an empty change set', () => {
  assert.throws(
    () => buildReleaseNotes({
      version: '1.2.4',
      previousVersion: '1.2.3',
      repositoryUrl: 'https://github.com/example/project',
      commits: [],
    }),
    /without any new commits/,
  );
});
