import type {
  OverlaySettings,
  OverlaySettingsUpdate,
  OverlayTemplate,
  OverlayTemplateCreate,
  OverlayTemplateExport,
  OverlayTemplateUpdate,
} from '@maintainerr/contracts'
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

export const buildPosterUrl = (plexId: string) =>
  `${API_BASE_PATH}/api/overlays/poster?plexId=${encodeURIComponent(plexId)}`

export const getOverlayFonts = () =>
  GetApiHandler<{ name: string; path: string }[]>('/overlays/fonts')

export const buildOverlayFontUrl = (fontName: string, cacheBust?: number) => {
  const base = `${API_BASE_PATH}/api/overlays/fonts/${encodeURIComponent(fontName)}`
  return cacheBust !== undefined ? `${base}?v=${cacheBust}` : base
}

export const uploadFont = async (file: File) => {
  const formData = new FormData()
  formData.append('font', file)
  return PostApiHandler<{ name: string; path: string }>(
    '/overlays/fonts',
    formData,
  )
}

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

// ── Template API ──────────────────────────────────────────────────────────

export const getOverlayTemplates = () =>
  GetApiHandler<OverlayTemplate[]>('/overlays/templates')

export const getOverlayTemplate = (id: number) =>
  GetApiHandler<OverlayTemplate>(`/overlays/templates/${id}`)

export const createOverlayTemplate = (data: OverlayTemplateCreate) =>
  PostApiHandler<OverlayTemplate>('/overlays/templates', data)

export const updateOverlayTemplate = (
  id: number,
  data: OverlayTemplateUpdate,
) => PutApiHandler<OverlayTemplate>(`/overlays/templates/${id}`, data)

export const deleteOverlayTemplate = (id: number) =>
  DeleteApiHandler<{ success: boolean }>(`/overlays/templates/${id}`)

export const duplicateOverlayTemplate = (id: number) =>
  PostApiHandler<OverlayTemplate>(`/overlays/templates/${id}/duplicate`, {})

export const setDefaultOverlayTemplate = (id: number) =>
  PostApiHandler<OverlayTemplate>(`/overlays/templates/${id}/default`, {})

export const exportOverlayTemplate = (id: number) =>
  PostApiHandler<OverlayTemplateExport>(`/overlays/templates/${id}/export`, {})

export const importOverlayTemplate = (data: OverlayTemplateExport) =>
  PostApiHandler<OverlayTemplate>('/overlays/templates/import', data)

export const buildTemplatePreviewUrl = (
  templateId: number,
  plexId: string,
  cacheBust?: number,
) => {
  const params = new URLSearchParams({ plexId })
  if (cacheBust) params.set('_t', String(cacheBust))
  return `${API_BASE_PATH}/api/overlays/templates/${templateId}/preview?${params.toString()}`
}
