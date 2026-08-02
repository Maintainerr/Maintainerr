import { isBelowMinimumVersion } from './required-version-helper';

describe('isBelowMinimumVersion', () => {
  it.each([
    ['4.0.1021', '4.0.1022', true],
    ['4.0.1022', '4.0.1022', false],
    ['4.0.1023', '4.0.1022', false],
    ['v4.0.1022', '4.0.1022', false],
    ['2.0.0-beta.0', '2.0.0-beta.1', true],
    ['2.0.0-beta.1', '2.0.0-beta.1', false],
    ['2.0.0-beta.2', '2.0.0-beta.1', false],
    ['2.0.0', '2.0.0-beta.1', false],
    ['2.0.0-beta.1', '2.0.0', true],
    ['2.0.0-alpha.1', '2.0.0-beta.1', true],
    ['2.0.0-beta.1', '2.0.0-beta.1.1', true],
  ])('%s below %s -> %s', (version, minimum, below) => {
    expect(isBelowMinimumVersion(version, minimum)).toBe(below);
  });

  it('accepts unparseable versions', () => {
    expect(isBelowMinimumVersion('dev-build', '4.0.1022')).toBe(false);
    expect(isBelowMinimumVersion('', '4.0.1022')).toBe(false);
  });
});
