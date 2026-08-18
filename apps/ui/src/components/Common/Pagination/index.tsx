import { Trans } from '@lingui/react/macro'

interface IPagination {
  totalItems: number
  currentPage: number
  pageSize: number
  handleForward: () => void
  handleBackward: () => void
}

const Pagination = (props: IPagination) => {
  // Named locals so the extracted message carries readable placeholders
  // instead of {0}/{1}/{2}.
  const firstItem =
    props.totalItems === 0 ? 0 : (props.currentPage - 1) * props.pageSize + 1
  const lastItem =
    props.currentPage * props.pageSize >= props.totalItems
      ? props.totalItems
      : props.currentPage * props.pageSize
  const totalItems = props.totalItems

  return (
    <div className="flex flex-col items-center">
      <span className="mb-2 text-sm text-zinc-200">
        <Trans>
          Showing <span className="font-bold text-zinc-400">{firstItem}</span>{' '}
          to <span className="font-bold text-zinc-400">{lastItem}</span> of{' '}
          <span className="font-bold text-zinc-400">{totalItems}</span> Rules
        </Trans>
      </span>
      <div className="inline-flex xs:mt-0">
        {props.currentPage === 1 ? undefined : (
          <button
            onClick={() => props.handleBackward()}
            className="rounded-l bg-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-500"
          >
            <Trans>Prev</Trans>{' '}
          </button>
        )}
        {props.currentPage * props.pageSize >= props.totalItems ? undefined : (
          <button
            onClick={() => props.handleForward()}
            className={
              'rounded-r border-0 border-l border-zinc-700 bg-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-500'
            }
          >
            <Trans>Next</Trans>
          </button>
        )}
      </div>
    </div>
  )
}

export default Pagination
