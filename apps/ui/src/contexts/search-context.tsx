import { createContext, ReactNode, useState } from 'react'

export interface ISearch {
  text: string
}

interface SearchContextType {
  search: ISearch
  addText: (input: string) => void
  removeText: () => void
}

const SearchContext = createContext<SearchContextType>({
  search: {} as ISearch,
  addText: (_input: string) => {},
  removeText: () => {},
})

export function SearchContextProvider(props: { children: ReactNode }) {
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

  const context: SearchContextType = {
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
