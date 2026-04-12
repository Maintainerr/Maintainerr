import { useMediaServerLibraries } from '../api/media-server'

export interface LibraryDisplay {
  title: string | undefined
  hasLibraryId: boolean
  isUnreachable: boolean
}

/**
 * Resolves a stored libraryId to a display title while distinguishing an
 * unreachable media server from a missing selection. Consumers render their
 * own fallback copy, but the detection logic stays consistent.
 */
export function useLibraryDisplay(
  libraryId: string | number | null | undefined,
): LibraryDisplay {
  const { data: libraries, isError: librariesError } = useMediaServerLibraries()

  const hasLibraryId = libraryId != null && libraryId !== ''
  const title = hasLibraryId
    ? libraries?.find((lib) => String(lib.id) === String(libraryId))?.title
    : undefined
  const isUnreachable = hasLibraryId && !title && librariesError

  return { title, hasLibraryId, isUnreachable }
}
