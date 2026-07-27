// The native connection depends on Sportarr's league/event surface plus the
// download-history endpoint and the Jellyfin/Emby id-alias emission, which
// shipped together in the Sportarr 4.0.1022 release. The connection test
// rejects older instances so users get an actionable message instead of
// silently failing actions.
export const MINIMUM_SPORTARR_VERSION = '4.0.1022';

// Numeric segment-wise compare; missing segments count as 0 (so "4.1" equals
// "4.1.0"). Returns false for unparseable versions - a dev or custom build
// should not be locked out by a strict parse.
export function isBelowMinimumVersion(
  version: string,
  minimum: string,
): boolean {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((s) => Number.parseInt(s, 10));
  const current = parse(version);
  const required = parse(minimum);
  if (current.some(Number.isNaN) || required.some(Number.isNaN)) {
    return false;
  }
  for (let i = 0; i < Math.max(current.length, required.length); i++) {
    const c = current[i] ?? 0;
    const r = required[i] ?? 0;
    if (c !== r) {
      return c < r;
    }
  }
  return false;
}
