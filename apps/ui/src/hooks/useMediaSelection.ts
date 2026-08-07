import { useCallback, useState } from 'react'

/** Shared by every page with a bulk action, so they all behave identically. */
const useMediaSelection = () => {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  // Stable identity: MediaCard is memoized, so an inline handler would
  // re-render every loaded card on each selection click.
  const toggleSelection = useCallback((mediaId: string, selected: boolean) => {
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (selected) {
        nextIds.add(mediaId)
      } else {
        nextIds.delete(mediaId)
      }
      return nextIds
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // For a content reload that invalidates the mode itself, not just the picks.
  const resetSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelectionMode = () => {
    const nextSelectionMode = !selectionMode
    setSelectionMode(nextSelectionMode)
    if (!nextSelectionMode) {
      clearSelection()
    }
  }

  /**
   * Failed items stay selected so they can be retried; selection mode closes
   * once nothing is left to act on. Same contract for every bulk action.
   */
  const applyBulkOutcome = useCallback((failedIds: Set<string>) => {
    setSelectedIds(failedIds)
    setSelectionMode(failedIds.size > 0)
  }, [])

  return {
    selectionMode,
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelection,
    toggleSelectionMode,
    clearSelection,
    resetSelection,
    applyBulkOutcome,
  }
}

export default useMediaSelection
