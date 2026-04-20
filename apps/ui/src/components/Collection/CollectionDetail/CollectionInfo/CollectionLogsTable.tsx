import { DocumentTextIcon } from '@heroicons/react/solid'
import {
  CollectionLogDto,
  CollectionLogMetaMediaAddedByRule,
  CollectionLogMetaMediaRemovedByRule,
  ECollectionLogType,
  isMetaActionedByRule,
} from '@maintainerr/contracts'
import type { ICollection } from '../..'
import useInfinitePaginatedList from '../../../../hooks/useInfinitePaginatedList'
import GetApiHandler from '../../../../utils/ApiHandler'
import Badge from '../../../Common/Badge'
import LoadingSpinner, {
  SmallLoadingSpinner,
} from '../../../Common/LoadingSpinner'
import Table from '../../../Common/Table'

interface CollectionLogsTableProps {
  collection: ICollection
  searchFilter: string
  currentSort: 'ASC' | 'DESC'
  currentFilter: ECollectionLogType | -1
  onShowMeta: (
    value:
      | {
          meta:
            | CollectionLogMetaMediaAddedByRule
            | CollectionLogMetaMediaRemovedByRule
          title: string
        }
      | undefined,
  ) => void
}

interface CollectionLogsResponse {
  totalSize: number
  items: CollectionLogDto[]
}

const CollectionLogsTable = ({
  collection,
  searchFilter,
  currentSort,
  currentFilter,
  onShowMeta,
}: CollectionLogsTableProps) => {
  const fetchAmount = 25
  const { data, isLoading, isLoadingExtra } = useInfinitePaginatedList<
    CollectionLogDto,
    CollectionLogDto
  >({
    fetchAmount,
    fetchPage: async (page) => {
      return await GetApiHandler<CollectionLogsResponse>(
        `/collections/logs/${collection.id}/content/${page}?size=${fetchAmount}${
          searchFilter ? `&search=${searchFilter}` : ''
        }${currentSort ? `&sort=${currentSort}` : ''}${
          currentFilter !== -1 ? `&filter=${currentFilter}` : ''
        }`,
      )
    },
    mapPageItems: (items) => items,
  })

  return (
    <Table>
      <thead>
        <tr>
          <Table.TH>{'DATE'}</Table.TH>
          <Table.TH>{'LABEL'}</Table.TH>
          <Table.TH>{'EVENT'}</Table.TH>
          <Table.TH></Table.TH>
        </tr>
      </thead>
      <Table.TBody>
        {isLoading ? (
          <tr>
            <Table.TD colSpan={4} noPadding>
              <LoadingSpinner />
            </Table.TD>
          </tr>
        ) : (
          <>
            {data.map((row: CollectionLogDto, index: number) => {
              return (
                <tr key={`log-list-${index}`}>
                  <Table.TD className="text-gray-300">
                    {new Date(row.timestamp).toLocaleString()}
                  </Table.TD>
                  <Table.TD className="text-gray-300">
                    <Badge
                      badgeType={
                        row.type === ECollectionLogType.COLLECTION
                          ? 'danger'
                          : row.type === ECollectionLogType.MEDIA
                            ? 'warning'
                            : row.type === ECollectionLogType.RULES
                              ? 'success'
                              : 'default'
                      }
                    >
                      {ECollectionLogType[row.type].toUpperCase()}
                    </Badge>
                  </Table.TD>
                  <Table.TD className="text-gray-300">
                    {row.message}
                    {row.meta && row.type == ECollectionLogType.MEDIA && (
                      <>
                        {' '}
                        {[
                          'media_added_manually',
                          'media_removed_manually',
                        ].includes(row.meta.type) && (
                          <span className="text-gray-400">(manual)</span>
                        )}
                      </>
                    )}
                  </Table.TD>
                  <Table.TD className="text-right">
                    {row.meta &&
                      row.type == ECollectionLogType.MEDIA &&
                      isMetaActionedByRule(row.meta) && (
                        <button
                          type="button"
                          className="rounded bg-maintainerr-600 px-2 py-1 text-white shadow-md hover:bg-maintainerr"
                          title="View Metadata"
                          onClick={() => {
                            if (!isMetaActionedByRule(row.meta)) return

                            onShowMeta({
                              meta: row.meta,
                              title: row.message,
                            })
                          }}
                        >
                          <DocumentTextIcon className="h-5 w-5" />
                        </button>
                      )}
                  </Table.TD>
                </tr>
              )
            })}

            {isLoadingExtra ? (
              <tr>
                <Table.TD colSpan={2} noPadding>
                  <SmallLoadingSpinner className="m-auto mb-2 mt-2 w-8" />
                </Table.TD>
              </tr>
            ) : undefined}
          </>
        )}
      </Table.TBody>
    </Table>
  )
}

export default CollectionLogsTable
