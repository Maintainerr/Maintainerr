import { MediaItemType } from '../media-server/enums'

export enum ServarrAction {
  DELETE,
  UNMONITOR_DELETE_ALL,
  UNMONITOR_DELETE_EXISTING,
  UNMONITOR,
  DO_NOTHING,
  DELETE_SHOW_IF_EMPTY,
  UNMONITOR_SHOW_IF_EMPTY,
  CHANGE_QUALITY_PROFILE,
}

/** The *arr that takes a collection's action; without one, the media server does. */
export type ServarrActionManager = 'radarr' | 'sonarr' | 'sportarr'

const {
  DELETE,
  UNMONITOR_DELETE_ALL,
  UNMONITOR_DELETE_EXISTING,
  UNMONITOR,
  DO_NOTHING,
  DELETE_SHOW_IF_EMPTY,
  UNMONITOR_SHOW_IF_EMPTY,
  CHANGE_QUALITY_PROFILE,
} = ServarrAction

type ServarrActionTable = Record<
  ServarrActionManager,
  Partial<Record<MediaItemType, readonly ServarrAction[]>>
>

/** All the media server can do on its own. */
export const MEDIA_SERVER_ACTIONS = [DELETE, DO_NOTHING] as const

/** What each *arr can do, by media type. */
export const SERVARR_ACTIONS = {
  radarr: {
    movie: [
      DELETE,
      UNMONITOR_DELETE_ALL,
      UNMONITOR,
      DO_NOTHING,
      CHANGE_QUALITY_PROFILE,
    ],
  },
  sonarr: {
    show: [
      DELETE,
      UNMONITOR_DELETE_ALL,
      UNMONITOR_DELETE_EXISTING,
      UNMONITOR,
      DO_NOTHING,
      CHANGE_QUALITY_PROFILE,
    ],
    season: [
      DELETE,
      DELETE_SHOW_IF_EMPTY,
      UNMONITOR_DELETE_EXISTING,
      UNMONITOR,
      UNMONITOR_SHOW_IF_EMPTY,
      DO_NOTHING,
    ],
    episode: [DELETE, UNMONITOR, DO_NOTHING],
  },
  sportarr: {
    show: [DELETE, UNMONITOR, DO_NOTHING, CHANGE_QUALITY_PROFILE],
    season: [DELETE, UNMONITOR, DO_NOTHING],
    episode: [DELETE, UNMONITOR, DO_NOTHING],
  },
} as const satisfies ServarrActionTable

/**
 * The actions a collection can take. The editor offers exactly these and the
 * server rejects any other on save, so no collection holds an action its
 * handler refuses on every run (#4137).
 */
export const supportedServarrActions = (
  type: MediaItemType,
  manager: ServarrActionManager | undefined,
): readonly ServarrAction[] => {
  const table: ServarrActionTable = SERVARR_ACTIONS
  return manager ? (table[manager][type] ?? []) : MEDIA_SERVER_ACTIONS
}

/**
 * The *arr bound to a collection, in the order the collection handler picks
 * one. An *arr of the other kind still counts: it can take no action there.
 */
export const servarrActionManager = (
  type: MediaItemType,
  settings: {
    radarrSettingsId?: number | null
    sonarrSettingsId?: number | null
    sportarrSettingsId?: number | null
  },
): ServarrActionManager | undefined => {
  const ids: Record<ServarrActionManager, number | null | undefined> = {
    radarr: settings.radarrSettingsId,
    sonarr: settings.sonarrSettingsId,
    sportarr: settings.sportarrSettingsId,
  }
  const order: ServarrActionManager[] =
    type === 'movie'
      ? ['radarr', 'sonarr', 'sportarr']
      : ['sonarr', 'sportarr', 'radarr']
  return order.find((manager) => ids[manager] != null)
}

/**
 * Whether a collection's action is repeated on additional instances of its own
 * *arr, for setups that keep a second copy (a 4K instance, say) of what the
 * media server shows as one item. Only deleting a whole movie from Radarr or a
 * whole show from Sonarr: the other actions act on what the primary instance
 * holds (its seasons, episodes or quality profiles), which another instance
 * need not share. The editor offers the option for exactly these and the
 * server clears it for anything else.
 */
export const supportsAdditionalArrInstances = (
  type: MediaItemType,
  arrAction: ServarrAction | undefined,
  manager: ServarrActionManager | undefined,
): boolean =>
  arrAction === DELETE &&
  ((manager === 'radarr' && type === 'movie') ||
    (manager === 'sonarr' && type === 'show'))

/**
 * The additional instances a collection's action is repeated on: none when
 * its action does not support them, and never its primary instance, which
 * takes the action itself.
 */
export const additionalArrInstanceIds = (collection: {
  type: MediaItemType
  arrAction?: ServarrAction
  radarrSettingsId?: number | null
  sonarrSettingsId?: number | null
  sportarrSettingsId?: number | null
  additionalArrSettingsIds?: readonly number[] | null
}): number[] => {
  const manager = servarrActionManager(collection.type, collection)
  if (
    !supportsAdditionalArrInstances(
      collection.type,
      collection.arrAction,
      manager,
    )
  ) {
    return []
  }
  const primaryId =
    manager === 'radarr'
      ? collection.radarrSettingsId
      : collection.sonarrSettingsId
  return [...new Set(collection.additionalArrSettingsIds ?? [])].filter(
    (id) => id !== primaryId,
  )
}
