import { ViewListIcon } from '@heroicons/react/solid'
import React, { useEffect, useRef, useState } from 'react'

export type ViewMode = 'poster' | 'table'

interface ViewToggleDropdownProps {
  viewMode: ViewMode
  onChange: (value: ViewMode) => void
}

const VIEW_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: 'Poster', value: 'poster' },
  { label: 'Table', value: 'table' },
]

const ViewToggleDropdown: React.FC<ViewToggleDropdownProps> = ({
  viewMode,
  onChange,
}) => {
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
    <div ref={dropdownRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="View Mode"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center rounded-md bg-zinc-700 p-2 text-sm font-medium text-white hover:bg-zinc-600 focus:outline-none"
      >
        <ViewListIcon className="mr-2 h-5 w-5" />
        {'View'}
        <svg className="ml-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.23 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-10 mt-2 w-auto origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none md:right-0 dark:bg-zinc-800">
          <div className="py-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`w-full px-4 py-2 text-sm ${
                  viewMode === option.value
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

export default ViewToggleDropdown
