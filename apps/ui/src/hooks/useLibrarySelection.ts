import { useCallback, useRef, useState } from 'react'

interface UseLibrarySelectionOptions {
  initialLibraryId?: string
}

const useLibrarySelection = ({
  initialLibraryId,
}: UseLibrarySelectionOptions = {}) => {
  const [selectedLibrary, setSelectedLibrary] = useState<string | undefined>(
    initialLibraryId,
  )
  const selectedLibraryRef = useRef<string | undefined>(initialLibraryId)

  const applySelectedLibrary = useCallback((libraryId: string | undefined) => {
    selectedLibraryRef.current = libraryId
    setSelectedLibrary(libraryId)
  }, [])

  const shouldSkipLibrarySwitch = useCallback(
    (libraryId: string | undefined) => {
      return !libraryId || selectedLibraryRef.current === libraryId
    },
    [],
  )

  return {
    selectedLibrary,
    selectedLibraryRef,
    applySelectedLibrary,
    shouldSkipLibrarySwitch,
  }
}

export default useLibrarySelection
