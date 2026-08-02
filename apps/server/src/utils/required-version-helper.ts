// Numeric segments are compared first; prereleases sort before the matching
// stable release. Unparseable versions are accepted for dev/custom builds.
const isNumericIdentifier = (value: string): boolean => {
  if (value.length === 0) {
    return false;
  }

  for (let index = 0; index < value.length; index++) {
    const characterCode = value.charCodeAt(index);
    if (characterCode < 48 || characterCode > 57) {
      return false;
    }
  }

  return true;
};

interface ParsedVersion {
  numericSegments: number[];
  prerelease?: string[];
}

export function isBelowMinimumVersion(
  version: string,
  minimum: string,
): boolean {
  const parse = (value: string): ParsedVersion | undefined => {
    const trimmed = value.trim();
    const normalized =
      trimmed[0] === 'v' || trimmed[0] === 'V' ? trimmed.slice(1) : trimmed;
    const prereleaseIndex = normalized.indexOf('-');
    const core =
      prereleaseIndex === -1
        ? normalized
        : normalized.slice(0, prereleaseIndex);
    const prerelease =
      prereleaseIndex === -1
        ? undefined
        : normalized.slice(prereleaseIndex + 1).split('.');
    const numericSegments = core.split('.');

    if (
      numericSegments.some((segment) => !isNumericIdentifier(segment)) ||
      prerelease?.some((segment) => segment.length === 0)
    ) {
      return undefined;
    }

    return {
      numericSegments: numericSegments.map((segment) =>
        Number.parseInt(segment, 10),
      ),
      prerelease,
    };
  };
  const current = parse(version);
  const required = parse(minimum);
  if (!current || !required) {
    return false;
  }

  for (
    let index = 0;
    index <
    Math.max(current.numericSegments.length, required.numericSegments.length);
    index++
  ) {
    const c = current.numericSegments[index] ?? 0;
    const r = required.numericSegments[index] ?? 0;
    if (c !== r) {
      return c < r;
    }
  }

  if (!current.prerelease && required.prerelease) {
    return false;
  }
  if (current.prerelease && !required.prerelease) {
    return true;
  }
  if (!current.prerelease || !required.prerelease) {
    return false;
  }

  for (
    let index = 0;
    index < Math.max(current.prerelease.length, required.prerelease.length);
    index++
  ) {
    const currentIdentifier = current.prerelease[index];
    const requiredIdentifier = required.prerelease[index];
    if (currentIdentifier === requiredIdentifier) {
      continue;
    }
    if (currentIdentifier === undefined) {
      return true;
    }
    if (requiredIdentifier === undefined) {
      return false;
    }

    const currentIsNumeric = isNumericIdentifier(currentIdentifier);
    const requiredIsNumeric = isNumericIdentifier(requiredIdentifier);
    if (currentIsNumeric && requiredIsNumeric) {
      return (
        Number.parseInt(currentIdentifier, 10) <
        Number.parseInt(requiredIdentifier, 10)
      );
    }
    if (currentIsNumeric !== requiredIsNumeric) {
      return currentIsNumeric;
    }
    return currentIdentifier < requiredIdentifier;
  }

  return false;
}
