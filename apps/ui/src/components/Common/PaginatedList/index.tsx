import React, { useState } from 'react'

interface ListItem {
  id: number
  title: string
}

interface PaginatedListProps {
  items: ListItem[]
  onEdit: (id: number) => void
  onAdd: () => void
  addName?: string
}

const PaginatedList: React.FC<PaginatedListProps> = ({
  items,
  onEdit,
  onAdd,
  addName,
}) => {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5

  const totalPages = Math.ceil(items.length / itemsPerPage)

  const currentItems = items.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  )

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1)
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1)
  }

  return (
    <div className="mx-auto mt-8 max-w-full rounded-lg bg-zinc-800 p-6 text-zinc-400 shadow-lg">
      <ul className="space-y-3">
        {currentItems.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-md bg-zinc-700 p-4 transition-all hover:bg-zinc-600"
          >
            <div className="flex flex-col space-y-2">
              <span className="text-lg font-medium">{item.title}</span>
              <button
                onClick={() => onEdit(item.id)}
                className="hover:text-maintainerr-600 self-start font-bold text-zinc-400 underline transition-all"
              >
                Edit
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between text-white">
        <button
          onClick={handlePrevPage}
          disabled={currentPage === 1}
          className={`rounded-md px-4 py-2 ${currentPage === 1 ? 'cursor-not-allowed bg-zinc-600 opacity-50' : 'bg-zinc-700 hover:bg-zinc-600'}`}
        >
          Previous
        </button>

        <span className="text-sm">
          Page {currentPage} of {totalPages}
        </span>

        <button
          onClick={handleNextPage}
          disabled={currentPage === totalPages}
          className={`rounded-md px-4 py-2 ${currentPage === totalPages ? 'cursor-not-allowed bg-zinc-600 opacity-50' : 'bg-zinc-700 hover:bg-zinc-600'}`}
        >
          Next
        </button>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={onAdd}
          className="focus:ring-maintainerr button-md border-maintainerr-600 bg-maintainerr-600 hover:border-maintainerr hover:bg-maintainerr focus:border-maintainerr-700 active:border-maintainerr-700 active:bg-maintainerr-700 inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent px-4 py-2 text-sm font-medium leading-5 text-white transition duration-150 ease-in-out focus:outline-none disabled:opacity-50"
        >
          {addName ? addName : 'Add'}
        </button>
      </div>
    </div>
  )
}

export default PaginatedList
