interface IPagination {
  totalItems: number
  currentPage: number
  pageSize: number
  handleForward: () => void
  handleBackward: () => void
}

const Pagination = (props: IPagination) => {
  return (
    <div className="flex flex-col items-center">
      <span className="mb-2 text-sm text-zinc-200">
        Showing{' '}
        <span className="font-bold text-zinc-400">
          {props.totalItems === 0
            ? 0
            : (props.currentPage - 1) * props.pageSize + 1}
        </span>{' '}
        to{' '}
        <span className="font-bold text-zinc-400">
          {props.currentPage * props.pageSize >= props.totalItems
            ? props.totalItems
            : props.currentPage * props.pageSize}
        </span>{' '}
        of <span className="font-bold text-zinc-400">{props.totalItems}</span>{' '}
        Rules
      </span>
      <div className="inline-flex xs:mt-0">
        {props.currentPage === 1 ? undefined : (
          <button
            onClick={() => props.handleBackward()}
            className="rounded-l bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Prev{' '}
          </button>
        )}
        {props.currentPage * props.pageSize >= props.totalItems ? undefined : (
          <button
            onClick={() => props.handleForward()}
            className={
              'rounded-r border-0 border-l border-gray-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800'
            }
          >
            Next
          </button>
        )}
      </div>
    </div>
  )
}

export default Pagination
