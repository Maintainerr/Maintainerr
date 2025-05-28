import { ICollectionMedia } from '../components/Collection'
import { IPlexMetadata } from '../components/Overview/Content'

interface RawExclusion {
  plexId: number
  type: number
  ruleGroupId?: number
  id: number
  parent?: number
}

export function metadataEnrichment(
  items: IPlexMetadata[],
  exclusions: RawExclusion[],
  collectionInfo?: ICollectionMedia[],
): IPlexMetadata[] {
  const exclusionMap = new Map<
    string,
    { ids: number[]; type: 'global' | 'specific'; ruleGroupIds: number[] }
  >()

  const showRatingKeysToMark = new Map<string, number[]>()

  for (const excl of exclusions) {
    const key = String(excl.plexId).trim()
    const isSpecific = !!excl.ruleGroupId

    const existing = exclusionMap.get(key)

    if (existing) {
      // Add to existing entry
      if (
        excl.ruleGroupId !== undefined &&
        !existing.ruleGroupIds.includes(excl.ruleGroupId)
      ) {
        existing.ruleGroupIds.push(excl.ruleGroupId)
      }
      if (!existing.ids.includes(excl.id)) {
        existing.ids.push(excl.id)
      }
    } else {
      // Initialize new entry
      exclusionMap.set(key, {
        ids: [excl.id],
        type: isSpecific ? 'specific' : 'global',
        ruleGroupIds: excl.ruleGroupId !== undefined ? [excl.ruleGroupId] : [],
      })
    }

    if (isSpecific && excl.parent && excl.ruleGroupId !== undefined) {
      const parentKey = String(excl.parent).trim()
      const existing = showRatingKeysToMark.get(parentKey) || []
      showRatingKeysToMark.set(
        parentKey,
        Array.from(new Set([...existing, excl.ruleGroupId])),
      )
    }
  }

  const manualPlexIds = new Set(
    collectionInfo?.filter((m) => m.isManual).map((m) => m.plexId) ?? [],
  )

  return items.map((item) => {
    const key = item.ratingKey.trim()
    const direct = exclusionMap.get(key)
    const isManual = manualPlexIds.has(Number(item.ratingKey))

    if (direct) {
      return {
        ...item,
        maintainerrExclusionType: direct.type,
        maintainerrExclusionId: direct.ids[0],
        maintainerrRuleGroupIds: direct.ruleGroupIds,
        maintainerrIsManual: isManual,
      }
    }

    const inheritedRuleGroupIds = showRatingKeysToMark.get(key)

    if (item.type === 'show' && inheritedRuleGroupIds?.length) {
      return {
        ...item,
        maintainerrExclusionType: 'specific',
        maintainerrRuleGroupIds: inheritedRuleGroupIds,
        maintainerrIsManual: isManual,
      }
    }

    return item
  })
}
