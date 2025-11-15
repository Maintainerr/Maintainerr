import { EPlexDataType } from '../../utils/PlexDataType-enum'

export interface IAddModal {
  onCancel: () => void
  onSubmit: () => void
  libraryId?: number
  type?: number
  plexId: number
  modalType: 'add' | 'exclude'
}

export interface ICollectionMedia {
  media?: []
  id: number
  plexId?: number
  libraryId?: number
  title: string
  description?: string
  isActive?: boolean
  arrAction?: number
  visibleOnRecommended?: boolean
  visibleOnHome?: boolean
  deleteAfterDays?: number
  type?: EPlexDataType
  collectionMedia?: []
}

export interface IAlterableMediaDto {
  id: number
  index?: number
  parenIndex?: number
  type: EPlexDataType
}
