import {
  DocumentAddIcon,
  DocumentRemoveIcon,
  FlagIcon,
  GlobeAltIcon,
} from '@heroicons/react/outline'
import React, { useState } from 'react'
import AddModal from '../../AddModal'
import { IPlexMetadata } from '../../Overview/Content'
import Button from '../Button'
import MediaModalContent from '../MediaCard/MediaModal'
import Tooltipwrapper from '../Tooltip'

interface TableDataProps {
  data: IPlexMetadata[]
  libraryId: number
  ruleGroups?: Record<number, string>
  ruleGroupId?: number
}

const TableData: React.FC<TableDataProps> = ({
  data,
  libraryId,
  ruleGroups,
}) => {
  const [selectedItem, setSelectedItem] = useState<IPlexMetadata | null>(null)

  const openModal = (item: IPlexMetadata) => {
    setSelectedItem(item)
    setShowMediaModal(true)
  }

  const closeModal = () => {
    setSelectedItem(null)
    setShowMediaModal(false)
  }

  const extractTmdbId = (item: IPlexMetadata): string | undefined => {
    const guidList = item.Guid ?? []
    const tmdbGuid = guidList.find((g) => g.id.startsWith('tmdb://'))
    return tmdbGuid?.id.replace('tmdb://', '')
  }

  const [showAddModal, setShowAddModal] = useState(false)
  const [showMediaModal, setShowMediaModal] = useState(false)

  const [showExcludeModal, setShowExcludeModal] = useState(false)

  const openAddModal = (item: IPlexMetadata) => {
    setSelectedItem(item)
    setShowAddModal(true)
  }

  const openExcludeModal = (item: IPlexMetadata) => {
    setSelectedItem(item)
    setShowExcludeModal(true)
  }

  return (
    <div className="relative overflow-x-auto rounded-lg border border-zinc-700">
      <div className="overflow-x-auto overflow-y-auto">
        <table className="min-w-full table-auto text-left text-sm text-white">
          <thead className="bg-zinc-800 text-xs uppercase text-zinc-400">
            <tr className="sticky top-0 z-0 bg-zinc-800 shadow-md shadow-zinc-900">
              <th className="max-w-7 px-4 py-3 text-center"></th>
              <th className="px-4 py-3 text-amber-600">Title</th>
              <th className="px-4 py-3 text-amber-600">Year</th>
              <th className="px-4 py-3 text-center text-amber-600">PlexID</th>
              <th className="px-4 py-3 text-amber-600">Rating</th>
              <th className="px-2 py-3 text-center text-amber-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {data.map((item) => {
              const title =
                item.grandparentTitle || item.parentTitle || item.title

              return (
                <tr
                  key={item.ratingKey}
                  className="transition focus-within:bg-zinc-800 hover:bg-zinc-800"
                >
                  <td className="text-center text-sm">
                    <div className="m-auto flex w-1 items-center justify-center whitespace-nowrap">
                      {/* Exclusion icon */}
                      {item.maintainerrExclusionType === 'global' && (
                        <Tooltipwrapper
                          id={`global-tooltip-${item.ratingKey}`}
                          content="Excluded from all rules"
                          placement="right"
                        >
                          <GlobeAltIcon className="h-4 w-4 text-zinc-100" />
                        </Tooltipwrapper>
                      )}

                      {item.maintainerrExclusionType === 'specific' && (
                        <Tooltipwrapper
                          id={`specific-tooltip-${item.ratingKey}`}
                          content={
                            item.maintainerrRuleGroupIds?.length ? (
                              <div className="inline-block text-left">
                                <div className="mb-1 font-medium text-amber-400">
                                  Excluded from:
                                </div>
                                {item.maintainerrRuleGroupIds.map(
                                  (id, index) => (
                                    <div key={index}>
                                      • {ruleGroups?.[id] || `Rule ${id}`}
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              'Excluded at season or episode level'
                            )
                          }
                          placement="right"
                        >
                          <FlagIcon className="h-4 w-4 text-zinc-100" />
                        </Tooltipwrapper>
                      )}
                    </div>
                  </td>

                  <td
                    className="m-auto flex cursor-alias items-center px-2 py-2 hover:underline"
                    title={title}
                    onClick={() => openModal(item)}
                  >
                    {title}
                  </td>

                  <td className="px-4 py-2">
                    {item.parentYear ?? item.year ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-center">{item.ratingKey}</td>
                  <td className="px-4 py-2">
                    {item.audienceRating ? item.audienceRating.toFixed(1) : '-'}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <div className="flex justify-center gap-1">
                      <Button
                        buttonType="twin-primary-l"
                        buttonSize="md"
                        className="h-6 w-16 p-1 text-zinc-200"
                        onClick={(e) => {
                          e.stopPropagation()
                          openAddModal(item)
                        }}
                      >
                        <DocumentAddIcon className="h-4 w-4" /> Add
                      </Button>
                      <Button
                        buttonType="twin-primary-r"
                        buttonSize="md"
                        className="h-6 w-16 p-1 text-zinc-200"
                        onClick={(e) => {
                          e.stopPropagation()
                          openExcludeModal(item)
                        }}
                      >
                        <DocumentRemoveIcon className="h-4 w-4" /> Excl
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showMediaModal && selectedItem && extractTmdbId(selectedItem) && (
        <MediaModalContent
          id={Number(selectedItem.ratingKey)}
          onClose={closeModal}
          title={
            selectedItem.grandparentTitle ||
            selectedItem.parentTitle ||
            selectedItem.title
          }
          summary={selectedItem.summary || 'No description available.'}
          mediaType={
            selectedItem.type as 'movie' | 'show' | 'season' | 'episode'
          }
          tmdbid={extractTmdbId(selectedItem)}
          year={
            selectedItem.parentYear?.toString() ||
            selectedItem.year?.toString() ||
            undefined
          }
          userScore={selectedItem.audienceRating || 0}
        />
      )}
      {showAddModal && selectedItem && (
        <AddModal
          plexId={Number(selectedItem.ratingKey)}
          libraryId={libraryId}
          type={selectedItem.type === 'movie' ? 1 : 2} // Adjust as needed
          onSubmit={() => setShowAddModal(false)}
          onCancel={() => setShowAddModal(false)}
          modalType="add"
        />
      )}

      {showExcludeModal && selectedItem && (
        <AddModal
          plexId={Number(selectedItem.ratingKey)}
          libraryId={libraryId}
          type={selectedItem.type === 'movie' ? 1 : 2}
          onSubmit={() => setShowExcludeModal(false)}
          onCancel={() => setShowExcludeModal(false)}
          modalType="exclude"
        />
      )}
    </div>
  )
}

export default TableData
