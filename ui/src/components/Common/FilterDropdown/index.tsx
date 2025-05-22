import { FilterIcon } from '@heroicons/react/solid'
import React, { useEffect, useRef, useState } from 'react'

export type FilterOption = 'all' | 'excluded' | 'nonExcluded'

interface FilterDropdownProps {
  value: FilterOption
  onChange: (value: FilterOption) => void
}

const FILTER_OPTIONS: { label: string; value: FilterOption }[] = [
  { label: 'All Items', value: 'all' },
  { label: 'Excluded Only', value: 'excluded' },
  { label: 'Non-Excluded Only', value: 'nonExcluded' },
]

const FilterDropdown: React.FC<FilterDropdownProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    } else {
      document.removeEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div ref={dropdownRef} className="relative ml-2 inline-block text-left">
      <button
        type="button"
        aria-label="Filter"
        onClick={() => setOpen(!open)}
        className="relative inline-flex items-center rounded-md bg-zinc-700 p-2 text-sm font-medium text-white hover:bg-zinc-600 focus:outline-none"
      >
        <FilterIcon className="mr-2 h-5 w-5" />
        {'Filter'}
        {/* Active Filter Dot */}
        {value !== 'all' && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400" />
        )}
        <svg className="ml-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.23 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-zinc-800">
          <div className="py-1">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`w-full px-4 py-2 text-left text-sm ${
                  value === option.value
                    ? 'bg-zinc-100 font-medium dark:bg-zinc-700'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'
                } text-gray-800 dark:text-white`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default FilterDropdown
