import type {
  OverlayLibrarySection,
  OverlayPreviewItem,
  OverlaySettings,
  OverlaySettingsUpdate,
  OverlayTemplate,
  OverlayTemplateCreate,
  OverlayTemplateExport,
  OverlayTemplateUpdate,
} from '@maintainerr/contracts'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
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

type UseOverlaySettingsQueryKey = ['overlays', 'settings']

type UseOverlaySettingsOptions = Omit<
  UseQueryOptions<
    OverlaySettings,
    Error,
    OverlaySettings,
    UseOverlaySettingsQueryKey
  >,
  'queryKey' | 'queryFn'
>

export const useOverlaySettings = (options?: UseOverlaySettingsOptions) =>
  useQuery<OverlaySettings, Error, OverlaySettings, UseOverlaySettingsQueryKey>(
    {
      queryKey: ['overlays', 'settings'],
      queryFn: async () => {
        const data = await GetApiHandler<OverlaySettings>('/overlays/settings')
        return data
      },
      staleTime: 0,
      ...options,
    },
  )

type UseUpdateOverlaySettingsOptions = Omit<
  UseMutationOptions<OverlaySettings, Error, OverlaySettingsUpdate>,
  'mutationFn' | 'mutationKey' | 'onSuccess'
>

export const useUpdateOverlaySettings = (
  options?: UseUpdateOverlaySettingsOptions,
) => {
  const queryClient = useQueryClient()
  return useMutation<OverlaySettings, Error, OverlaySettingsUpdate>({
    mutationKey: ['overlays', 'settings', 'update'],
    mutationFn: async (payload) => {
      const data = await PutApiHandler<OverlaySettings>(
        '/overlays/settings',
        payload,
      )
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData<OverlaySettings>(
        ['overlays', 'settings'] satisfies UseOverlaySettingsQueryKey,
        data,
      )
    },
    ...options,
  })
}

export const getOverlaySections = () =>
  GetApiHandler<OverlayLibrarySection[]>('/overlays/sections')

export const getRandomItem = (sectionId: string) =>
  GetApiHandler<OverlayPreviewItem | null>(
    `/overlays/random-item?sectionId=${encodeURIComponent(sectionId)}`,
  )

export const getRandomEpisode = (sectionId: string) =>
  GetApiHandler<OverlayPreviewItem | null>(
    `/overlays/random-episode?sectionId=${encodeURIComponent(sectionId)}`,
  )

export const buildItemImageUrl = (itemId: string) =>
  `${API_BASE_PATH}/api/overlays/poster?itemId=${encodeURIComponent(itemId)}`

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
  itemId: string,
  cacheBust?: number,
) => {
  const params = new URLSearchParams({ itemId })
  if (cacheBust) params.set('_t', String(cacheBust))
  return `${API_BASE_PATH}/api/overlays/templates/${templateId}/preview?${params.toString()}`
}
