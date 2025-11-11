import {
  createContext,
  ReactElement,
  ReactNode,
  ReactPortal,
  useState,
} from 'react'
import { EPlexDataType } from '../utils/PlexDataType-enum'

interface Iconstants {
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
  showType?: EPlexDataType[]
}

interface IPropertyType {
  key: string
  possibilities: RulePossibility[]
}

export enum RulePossibility {
  BIGGER,
  SMALLER,
  EQUALS,
  NOT_EQUALS,
  CONTAINS,
  BEFORE,
  AFTER,
  IN_LAST,
  IN_NEXT,
  NOT_CONTAINS,
  CONTAINS_PARTIAL,
  NOT_CONTAINS_PARTIAL,
  CONTAINS_ALL,
  NOT_CONTAINS_ALL,
  COUNT_EQUALS,
  COUNT_NOT_EQUALS,
  COUNT_BIGGER,
  COUNT_SMALLER,
}

export const RulePossibilityTranslations = {
  [RulePossibility.BIGGER]: 'Bigger',
  [RulePossibility.SMALLER]: 'Smaller',
  [RulePossibility.EQUALS]: 'Equals',
  [RulePossibility.NOT_EQUALS]: 'Not Equals',
  [RulePossibility.CONTAINS]: 'Contains (Exact list match)',
  [RulePossibility.BEFORE]: 'Before',
  [RulePossibility.AFTER]: 'After',
  [RulePossibility.IN_LAST]: 'In Last',
  [RulePossibility.IN_NEXT]: 'In Next',
  [RulePossibility.NOT_CONTAINS]: 'Not Contains (Exact list match)',
  [RulePossibility.CONTAINS_PARTIAL]: 'Contains (Partial list match)',
  [RulePossibility.NOT_CONTAINS_PARTIAL]: 'Not Contains (Partial list match)',
  [RulePossibility.CONTAINS_ALL]: 'Contains (All items)',
  [RulePossibility.NOT_CONTAINS_ALL]: 'Not Contains (All items)',
  [RulePossibility.COUNT_EQUALS]: 'Count Equals',
  [RulePossibility.COUNT_NOT_EQUALS]: 'Count Does Not Equal',
  [RulePossibility.COUNT_BIGGER]: 'Count Is Bigger Than',
  [RulePossibility.COUNT_SMALLER]: 'Count Is Smaller Than',
}

export const enum MediaType {
  BOTH,
  MOVIE,
  SHOW,
}

export const enum Application {
  PLEX,
  RADARR,
  SONARR,
  OVERSEERR,
  TAUTULLI,
}

const ConstantsContext = createContext({
  constants: {} as Iconstants,
  setConstants: (constants: Iconstants) => {},
  removeConstants: () => {},
})

export function ConstantsContextProvider(props: {
  children:
    | boolean
    | ReactElement<any>
    | number
    | string
    | Iterable<ReactNode>
    | ReactPortal
    | null
    | undefined
}) {
  const [constants, setConstants] = useState<Iconstants>({ applications: null })

  function setConstantsHandler(constants: Iconstants) {
    setConstants(constants)
  }
  function removeConstantsHandler() {
    setConstants({} as Iconstants)
  }

  const context: {
    constants: Iconstants
    setConstants: (constants: Iconstants) => void
    removeConstants: () => void
  } = {
    constants: constants,
    setConstants: setConstantsHandler,
    removeConstants: removeConstantsHandler,
  }

  return (
    <ConstantsContext.Provider value={context}>
      {props.children}
    </ConstantsContext.Provider>
  )
}

export default ConstantsContext
