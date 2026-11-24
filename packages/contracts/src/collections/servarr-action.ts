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
