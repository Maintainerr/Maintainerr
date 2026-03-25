export interface ArrDiskspaceResource {
  id: number
  path: string | null
  label: string | null
  freeSpace: number
  totalSpace: number
  /**
   * False when the entry was synthesized from a root-folder response that does
   * not expose a trustworthy total-space value.
   */
  hasAccurateTotalSpace?: boolean
}

export const normalizeDiskPath = (path: string): string => {
  if (path.length <= 1) {
    return path
  }

  const firstCharacter = path.charCodeAt(0)
  const isDriveLetter =
    (firstCharacter >= 65 && firstCharacter <= 90) ||
    (firstCharacter >= 97 && firstCharacter <= 122)
  const minimumLengthToPreserve =
    isDriveLetter && path[1] === ':' && (path[2] === '/' || path[2] === '\\')
      ? 3
      : 1

  let endIndex = path.length

  while (endIndex > minimumLengthToPreserve) {
    const character = path[endIndex - 1]
    if (character !== '/' && character !== '\\') {
      break
    }

    endIndex -= 1
  }

  return endIndex === path.length ? path : path.slice(0, endIndex)
}
