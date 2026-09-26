export const startsWithDigit = (value: string): boolean => {
  const firstCharacter = value[0]

  return (
    firstCharacter !== undefined &&
    firstCharacter >= '0' &&
    firstCharacter <= '9'
  )
}

// Drops a build number or hash after the third part, so a version fits a
// one-line status (6.4.4.10685 -> 6.4.4).
export const releaseVersion = (version: string): string =>
  version.split('.').slice(0, 3).join('.')
