import { ChangeEvent, useState } from 'react'
import { Input } from '../../Forms/Input'

interface ISearchBar {
  placeholder?: string
  initialValue?: string
  value?: string
  onSearch: (input: string) => void
}

const SearchBar = (props: ISearchBar) => {
  const { initialValue = '', onSearch, placeholder, value } = props
  const [text, setText] = useState(initialValue)
  const displayedValue = value ?? text

  const inputHandler = (e: ChangeEvent<HTMLInputElement>) => {
    const nextText = e.target.value.toLowerCase()
    if (value === undefined) {
      setText(nextText)
    }
    onSearch(nextText)
  }

  return (
    <div className="relative flex w-full items-center text-white focus-within:text-zinc-200">
      <div className="pointer-events-none absolute left-4 flex items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
            clipRule="evenodd"
          ></path>
        </svg>
      </div>
      <Input
        type="search"
        name="search"
        onChange={(e) => inputHandler(e)}
        placeholder={placeholder ? placeholder : 'Search'}
        value={displayedValue}
        className="pl-10"
      />
    </div>
  )
}

export default SearchBar
