import { useEffect, useRef } from 'react'
import { usePlexLibraries } from '../../../api/plex'

interface ILibrarySwitcher {
  onLibraryChange: (libraryId: number) => void
  shouldShowAllOption?: boolean
}

const LibrarySwitcher = (props: ILibrarySwitcher) => {
  const { onLibraryChange, shouldShowAllOption } = props
  const {
    data: plexLibraries,
    error: plexLibrariesError,
    isLoading: plexLibrariesLoading,
  } = usePlexLibraries()
  const lastAutoSelectedLibraryKey = useRef<number | null>(null)

  const onSwitchLibrary = (event: { target: { value: string } }) => {
    onLibraryChange(+event.target.value)
  }

  useEffect(() => {
    if (!plexLibraries || plexLibraries.length === 0) {
      return
    }

    if (shouldShowAllOption === false) {
      const firstKey = Number(plexLibraries[0].key)

      if (
        !Number.isNaN(firstKey) &&
        lastAutoSelectedLibraryKey.current !== firstKey
      ) {
        lastAutoSelectedLibraryKey.current = firstKey
        onLibraryChange(firstKey)
      }
    } else {
      lastAutoSelectedLibraryKey.current = null
    }
  }, [plexLibraries, shouldShowAllOption, onLibraryChange])

  return (
    <>
      <div className="mb-5 w-full">
        <form>
          <select
            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
            onChange={onSwitchLibrary}
          >
            {plexLibrariesLoading ? (
              <option disabled={true} value="">
                Loading libraries...
              </option>
            ) : plexLibrariesError ? (
              <option disabled={true} value="">
                Could not fetch libraries
              </option>
            ) : (
              <>
                {(props.shouldShowAllOption === undefined ||
                  props.shouldShowAllOption) && (
                  <option value={9999}>All</option>
                )}

                {plexLibraries?.map((el) => {
                  return (
                    <option key={el.key} value={el.key}>
                      {el.title}
                    </option>
                  )
                })}
              </>
            )}
          </select>
        </form>
      </div>
    </>
  )
}

export default LibrarySwitcher
