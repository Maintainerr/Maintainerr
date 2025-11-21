import { useEffect, useRef } from 'react'
import { usePlexLibraries } from '../../../api/plex'

interface ILibrarySwitcher {
  onSwitch: (libraryId: number) => void
  allPossible?: boolean
}

const LibrarySwitcher = (props: ILibrarySwitcher) => {
  const { onSwitch, allPossible } = props
  const { data: plexLibraries } = usePlexLibraries()
  const lastAutoSelectedKey = useRef<number | null>(null)

  const onSwitchLibrary = (event: { target: { value: string } }) => {
    onSwitch(+event.target.value)
  }

  useEffect(() => {
    if (!plexLibraries || plexLibraries.length === 0) {
      return
    }

    if (allPossible === false) {
      const firstKey = Number(plexLibraries[0].key)

      if (!Number.isNaN(firstKey) && lastAutoSelectedKey.current !== firstKey) {
        lastAutoSelectedKey.current = firstKey
        onSwitch(firstKey)
      }
    } else {
      lastAutoSelectedKey.current = null
    }
  }, [plexLibraries, allPossible, onSwitch])

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
            {plexLibraries?.map((el) => {
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
