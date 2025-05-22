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
    { id: number; type: 'global' | 'specific'; ruleGroupId?: number }
  >()

  const showRatingKeysToMark = new Map<string, number[]>()

  // Step 1: Process exclusions
  for (const excl of exclusions) {
    const key = String(excl.plexId).trim()
    const isSpecific = !!excl.ruleGroupId

    exclusionMap.set(key, {
      id: excl.id,
      type: isSpecific ? 'specific' : 'global',
      ruleGroupId: excl.ruleGroupId,
    })

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

  // Step 2: Enrich items
  return items.map((item) => {
    const key = item.ratingKey.trim()
    const direct = exclusionMap.get(key)
    const isManual = manualPlexIds.has(Number(item.ratingKey))

    if (direct) {
      return {
        ...item,
        maintainerrExclusionType: direct.type,
        maintainerrExclusionId: direct.id,
        maintainerrRuleGroupId: direct.ruleGroupId,
        maintainerrRuleGroupIds: direct.ruleGroupId ? [direct.ruleGroupId] : [],
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
