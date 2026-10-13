import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, validateReleaseVersion } from './version.mjs';

test('rejects the version downgrade that hid the sorting update', () => {
  assert.throws(() => validateReleaseVersion('1.0.0', ['1.0.1']), /lower than/);
  assert.equal(validateReleaseVersion('1.0.2', ['1.0.0', '1.0.1']), '1.0.2');
  assert.equal(validateReleaseVersion('1.0.1', ['1.0.1']), '1.0.1');
});
test('compares marketing version components numerically and normalizes short versions', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
});
test('rejects malformed versions before any release work', () => {
  for (const value of ['1.0', '', 'latest', '1.0.2.1', '1.0.-1', '9007199254740992.0.0']) {
    assert.throws(() => validateReleaseVersion(value, []));
  }
});
