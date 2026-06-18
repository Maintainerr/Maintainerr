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
SearchContext.displayName = 'SearchContext'

export function SearchContextProvider(props: { children: ReactNode }) {
  const [searchText, setSearchText] = useState<ISearch>({ text: '' } as ISearch)

  function addSearchHandler(input: string) {
    setSearchText(() => {
      return { text: input } as ISearch
    })
  }

  function removeSearchHandler() {
    setSearchText(() => {
      return { text: '' } as ISearch
    })
  }

  const context: SearchContextType = {
    search: searchText,
    addText: addSearchHandler,
    removeText: removeSearchHandler,
  }

  return <SearchContext value={context}>{props.children}</SearchContext>
}

export default SearchContext
