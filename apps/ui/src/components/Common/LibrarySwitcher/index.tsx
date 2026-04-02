import { type MediaLibrary } from '@maintainerr/contracts'
import { useEffect, useRef } from 'react'
import { Select } from '../../Forms/Select'

interface ILibrarySwitcher {
  onLibraryChange: (libraryId: string) => void
  shouldShowAllOption?: boolean
  selectedLibraryId?: string
  formClassName?: string
  libraries?: MediaLibrary[]
  librariesLoading?: boolean
  librariesError?: boolean
}

const LibrarySwitcher = (props: ILibrarySwitcher) => {
  const {
    onLibraryChange,
    selectedLibraryId,
    shouldShowAllOption,
    formClassName,
    libraries,
    librariesLoading = false,
    librariesError = false,
  } = props
  const lastAutoSelectedLibraryId = useRef<string | null>(null)
  const selectValue =
    librariesLoading || librariesError
      ? ''
      : (selectedLibraryId ??
        (shouldShowAllOption === false ? (libraries?.[0]?.id ?? '') : 'all'))

  const onSwitchLibrary = (event: { target: { value: string } }) => {
    onLibraryChange(event.target.value)
  }

  useEffect(() => {
    if (!libraries || libraries.length === 0) {
      return
    }

    if (shouldShowAllOption === false) {
      if (selectedLibraryId) {
        lastAutoSelectedLibraryId.current = selectedLibraryId
        return
      }

      const firstId = libraries[0].id

      if (firstId && lastAutoSelectedLibraryId.current !== firstId) {
        lastAutoSelectedLibraryId.current = firstId
        onLibraryChange(firstId)
      }
    } else {
      lastAutoSelectedLibraryId.current = null
    }
  }, [libraries, onLibraryChange, selectedLibraryId, shouldShowAllOption])

  return (
    <div className="mb-5 min-h-[44px] w-full">
      <form className={`w-full ${formClassName ?? 'max-w-xs'}`}>
        <Select
          className="h-11 px-3"
          onChange={onSwitchLibrary}
          value={selectValue}
        >
          {librariesLoading ? (
            <option disabled={true} value="">
              Loading libraries...
            </option>
          ) : librariesError ? (
            <option disabled={true} value="">
              Could not fetch libraries
            </option>
          ) : (
            <>
              {(props.shouldShowAllOption === undefined ||
                props.shouldShowAllOption) && <option value="all">All</option>}

              {libraries?.map((lib) => {
                return (
                  <option key={lib.id} value={lib.id}>
                    {lib.title}
                  </option>
                )
              })}
            </>
          )}
        </Select>
      </form>
    </div>
  )
}

export default LibrarySwitcher
