import {
  createContext,
  ReactElement,
  ReactNode,
  ReactPortal,
  useState,
} from 'react'

export interface ILibrary {
  key: string
  type: 'movie' | 'show'
  title: string
}
const LibrariesContext = createContext({
  libraries: [] as ILibrary[],
  addLibraries: (libraries: ILibrary[]) => {},
  removeLibraries: () => {},
})

export function LibrariesContextProvider(props: {
  children:
    | boolean
    | ReactElement<any>
    | number
    | string
    | Iterable<ReactNode>
    | ReactPortal
    | null
    | undefined
}) {
  const [libraries, setLibraries] = useState<ILibrary[]>([])

  function addLibrariesHandler(libraries: ILibrary[]) {
    setLibraries(() => {
      return libraries
    })
  }
  function removeLibrariesHandler() {
    setLibraries(() => {
      return [] as ILibrary[]
    })
  }

  const context: {
    libraries: ILibrary[]
    addLibraries: (libraries: ILibrary[]) => void
    removeLibraries: () => void
  } = {
    libraries: libraries,
    addLibraries: addLibrariesHandler,
    removeLibraries: removeLibrariesHandler,
  }

  return (
    <LibrariesContext.Provider value={context}>
      {props.children}
    </LibrariesContext.Provider>
  )
}

export default LibrariesContext
