import { IComparisonStatistics } from '../rules/rule'

export type CollectionLogDto = {
  timestamp: Date
  message: string
} & (
  | {
      type: ECollectionLogType.MEDIA
      meta:
        | CollectionLogMetaMediaAddedByRule
        | CollectionLogMetaMediaRemovedByRule
        | CollectionLogMetaMediaAddedManually
        | CollectionLogMetaMediaRemovedManually
    }
  | {
      type: ECollectionLogType.COLLECTION
      meta: null
    }
  | {
      type: ECollectionLogType.RULES
      meta: null
    }
)

export enum ECollectionLogType {
  COLLECTION,
  MEDIA,
  RULES,
}

export const isMetaActionedByRule = (
  type: CollectionLogMeta,
): type is
  | CollectionLogMetaMediaAddedByRule
  | CollectionLogMetaMediaRemovedByRule => {
  return (
    type.type === 'media_added_by_rule' || type.type === 'media_removed_by_rule'
  )
}

export type CollectionLogMeta =
  | CollectionLogMetaMediaAddedByRule
  | CollectionLogMetaMediaRemovedByRule
  | CollectionLogMetaMediaAddedManually
  | CollectionLogMetaMediaRemovedManually

export type CollectionLogMetaMediaAddedByRule = {
  type: 'media_added_by_rule'
  data: IComparisonStatistics
}

export type CollectionLogMetaMediaRemovedByRule = {
  type: 'media_removed_by_rule'
  data: IComparisonStatistics
}

export type CollectionLogMetaMediaAddedManually = {
  type: 'media_added_manually'
}

export type CollectionLogMetaMediaRemovedManually = {
  type: 'media_removed_manually'
}
