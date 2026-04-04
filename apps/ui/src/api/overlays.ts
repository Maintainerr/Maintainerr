import type {
    FrameConfig,
    OverlayExport,
    OverlaySettings,
    OverlaySettingsUpdate,
    OverlayStyleConfig,
    OverlayTextConfig,
} from '@maintainerr/contracts'
import axios from 'axios'
import GetApiHandler, {
    API_BASE_PATH,
    DeleteApiHandler,
    PostApiHandler,
    PutApiHandler,
} from '../utils/ApiHandler'

export const getOverlaySettings = () =>
  GetApiHandler<OverlaySettings>('/overlays/settings')

export const updateOverlaySettings = (data: OverlaySettingsUpdate) =>
  PutApiHandler<OverlaySettings>('/overlays/settings', data)

export const exportOverlaySettings = (type: 'poster' | 'titlecard') =>
  PostApiHandler<OverlayExport>(`/overlays/settings/export/${type}`, {})

export const importOverlaySettings = (
  type: 'poster' | 'titlecard',
  data: OverlayExport,
) => PostApiHandler<OverlaySettings>(`/overlays/settings/import/${type}`, data)

export const getOverlaySections = () =>
  GetApiHandler<{ key: string; title: string; type: string }[]>(
    '/overlays/sections',
  )

export const getRandomItem = (sectionId: string) =>
  GetApiHandler<{ plexId: string; title: string } | null>(
    `/overlays/random-item?sectionId=${encodeURIComponent(sectionId)}`,
  )

export const getRandomEpisode = (sectionId: string) =>
  GetApiHandler<{ plexId: string; title: string } | null>(
    `/overlays/random-episode?sectionId=${encodeURIComponent(sectionId)}`,
  )

export const getOverlayFonts = () =>
  GetApiHandler<{ name: string; path: string }[]>('/overlays/fonts')

export const processAllOverlays = () =>
  PostApiHandler<{ processed: number; reverted: number; errors: number }>(
    '/overlays/process',
    {},
  )

export const resetAllOverlays = () =>
  DeleteApiHandler<{ success: boolean }>('/overlays/reset')

export const getOverlayStatus = () =>
  GetApiHandler<{
    status: string
    lastRun: string | null
    lastResult: {
      processed: number
      reverted: number
      skipped: number
      errors: number
    } | null
  }>('/overlays/status')

/**
 * Build a preview image URL for the overlay.
 * To use as `<img src={...}>`, returns a URL that the browser hits directly.
 */
export const buildPreviewUrl = (
  plexId: string,
  mode: 'poster' | 'titlecard' = 'poster',
  cacheBust?: number,
) => {
  const params = new URLSearchParams({ plexId, mode })
  if (cacheBust) params.set('_t', String(cacheBust))
  return `${API_BASE_PATH}/api/overlays/preview?${params.toString()}`
}

/**
 * POST current (unsaved) settings to the preview endpoint and return an
 * object-URL that can be used as an `<img src>`.
 * Caller is responsible for revoking the previous URL via `URL.revokeObjectURL`.
 */
export const fetchPreviewWithSettings = async (
  plexId: string,
  overlayText: OverlayTextConfig,
  overlayStyle: OverlayStyleConfig,
  frame: FrameConfig,
): Promise<string> => {
  const res = await axios.post(
    `${API_BASE_PATH}/api/overlays/preview/with-settings`,
    { plexId, overlayText, overlayStyle, frame },
    { responseType: 'blob' },
  )
  return URL.createObjectURL(res.data as Blob)
}
