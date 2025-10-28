import { useContext, useEffect } from 'react'
import LibrariesContext from '../../../contexts/libraries-context'
import SettingsContext from '../../../contexts/settings-context'
import GetApiHandler from '../../../utils/ApiHandler'

interface ILibrarySwitcher {
  onSwitch: (libraryId: number) => void
  allPossible?: boolean
}

const LibrarySwitcher = (props: ILibrarySwitcher) => {
  const LibrariesCtx = useContext(LibrariesContext)
  const SettingsCtx = useContext(SettingsContext)

  const onSwitchLibrary = (event: { target: { value: string } }) => {
    props.onSwitch(+event.target.value)
  }

  useEffect(() => {
    if (LibrariesCtx.libraries.length <= 0) {
      GetApiHandler('/plex/libraries').then((resp) => {
        if (resp) {
          LibrariesCtx.addLibraries(resp)
          if (props.allPossible !== undefined && !props.allPossible) {
            // Use default library from settings if available, otherwise use first library
            const defaultLibraryId = SettingsCtx.settings.plex_default_library
            const libraryToUse =
              defaultLibraryId &&
              resp.find((lib) => +lib.key === defaultLibraryId)
                ? defaultLibraryId
                : +resp[0].key

            props.onSwitch(libraryToUse)
          }
        } else {
          LibrariesCtx.addLibraries([])
        }
      })
    }
  }, [])

  return (
    <>
      <div className="mb-5 w-full">
        <form>
          <select
            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
            onChange={onSwitchLibrary}
          >
            {props.allPossible === undefined || props.allPossible ? (
              <option value={9999}>All</option>
            ) : undefined}
            {LibrariesCtx.libraries.map((el) => {
              return (
                <option key={el.key} value={el.key}>
                  {el.title}
                </option>
              )
            })}
          </select>
        </form>
      </div>
    </>
  )
}

export default LibrarySwitcher
