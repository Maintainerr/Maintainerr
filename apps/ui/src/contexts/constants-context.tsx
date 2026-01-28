import {
  type MediaItemType,
  type MediaType,
  type RulePossibility,
} from '@maintainerr/contracts'

export interface IConstants {
  applications: IApplication[] | null
}
interface IApplication {
  id: number
  name: string
  mediaType: MediaType
  props: IProperty[]
}
export interface IProperty {
  id: number
  name: string
  humanName: string
  mediaType: MediaType
  type: IPropertyType
  showType?: MediaItemType[]
}

interface IPropertyType {
  key: string
  possibilities: RulePossibility[]
}
