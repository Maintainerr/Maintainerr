// Numeric segment-wise compare; missing segments count as 0 (so "4.1" equals
// "4.1.0"). Returns false for unparseable versions - a dev or custom build
// should not be locked out by a strict parse.
export function isBelowMinimumVersion(
  version: string,
  minimum: string,
): boolean {
  const parse = (v: string) => {
    const trimmed = v.trim();
    // Strip a leading "v"/"V" prefix without a regex (project convention).
    const digits =
      trimmed[0] === 'v' || trimmed[0] === 'V' ? trimmed.slice(1) : trimmed;
    return digits.split('.').map((s) => Number.parseInt(s, 10));
  };
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
