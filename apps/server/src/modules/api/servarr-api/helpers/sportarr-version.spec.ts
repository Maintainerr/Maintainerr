import {
  MINIMUM_SPORTARR_VERSION,
  isBelowMinimumVersion,
} from './sportarr-version';

describe('sportarr version pin', () => {
  it('pins the minimum to the release that shipped the native surface', () => {
    expect(MINIMUM_SPORTARR_VERSION).toBe('4.0.1022');
  });

  it.each([
    ['4.0.1021', true],
    ['3.9.9999', true],
    ['4.0', true], // 4.0.0 is below 4.0.1022
    ['4.0.1022', false],
    ['4.0.1023', false],
    ['4.0.1022.5', false],
    ['4.1.0', false],
    ['v4.0.1022', false],
  ])('%s below the minimum -> %s', (version, below) => {
    expect(isBelowMinimumVersion(version, MINIMUM_SPORTARR_VERSION)).toBe(
      below,
    );
  });

  it('never locks out unparseable versions', () => {
    // A dev or custom build with a non-numeric version should not be blocked
    // by a strict parse; the connection test falls through to the normal path.
    expect(isBelowMinimumVersion('dev-build', MINIMUM_SPORTARR_VERSION)).toBe(
      false,
    );
    expect(isBelowMinimumVersion('', MINIMUM_SPORTARR_VERSION)).toBe(false);
  });
});
