import {
  createContext,
  ReactElement,
  ReactNode,
  ReactPortal,
  useState,
} from 'react'

export interface ISearch {
  text: string
}

const SearchContext = createContext({
  search: {} as ISearch,
  addText: (input: string) => {},
  removeText: () => {},
})

export function SearchContextProvider(props: {
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
  const [searchText, setSearch] = useState<ISearch>({ text: '' } as ISearch)

  function addSearchHandler(input: string) {
    setSearch(() => {
      return { text: input } as ISearch
    })
  }
  function removeSearchHandler() {
    setSearch(() => {
      return { text: '' } as ISearch
    })
  }

  const context: {
    search: ISearch
    addText: (input: string) => void
    removeText: () => void
  } = {
    search: searchText,
    addText: addSearchHandler,
    removeText: removeSearchHandler,
  }

  return (
    <SearchContext.Provider value={context}>
      {props.children}
    </SearchContext.Provider>
  )
}

export default SearchContext
