// App Store marketing versions compare numerically, independently of build numbers.
export function compareVersions(left, right) {
  const parts = value => {
    if (!/^\d+(?:\.\d+){0,2}$/.test(value)) throw new Error(`Invalid marketing version: ${value}`);
    const result = value.split('.').map(Number);
    if (result.some(part => !Number.isSafeInteger(part))) throw new Error(`Invalid marketing version: ${value}`);
    return [...result, ...Array(3 - result.length).fill(0)];
  };
  const a = parts(left), b = parts(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function validateReleaseVersion(requested, existing) {
  if (!/^\d+\.\d+\.\d+$/.test(requested ?? '')) throw new Error('RELEASE_VERSION must contain major.minor.patch');
  compareVersions(requested, requested);
  for (const version of existing) {
    if (compareVersions(requested, version) < 0) {
      throw new Error(`Release version ${requested} is lower than the existing App Store Connect version ${version}; choose that version or a newer one.`);
    }
  }
  return requested;
}
