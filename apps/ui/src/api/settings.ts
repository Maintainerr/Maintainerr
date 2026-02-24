import axios from 'axios'
import { BasicResponseDto } from '@maintainerr/contracts'
import {
  useMutation,
  UseMutationOptions,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query'
import GetApiHandler, {
  API_BASE_PATH,
  DeleteApiHandler,
  PatchApiHandler,
  PostApiHandler,
} from '../utils/ApiHandler'

interface ISettings {
  id: number
  clientId: string
  applicationTitle: string
  applicationUrl: string
  apikey: string
  overseerr_url: string
  locale: string
  plex_name: string
  plex_hostname: string
  plex_port: number
  plex_ssl: number
  plex_auth_token: string | null
  overseerr_api_key: string
  tautulli_url: string
  tautulli_api_key: string
  jellyseerr_url: string
  jellyseerr_api_key: string
  collection_handler_job_cron: string
  rules_handler_job_cron: string
}

type UseSettingsQueryKey = ['settings']

type UseSettingsOptions = Omit<
  UseQueryOptions<ISettings, Error, ISettings, UseSettingsQueryKey>,
  'queryKey' | 'queryFn'
>

export const useSettings = (options?: UseSettingsOptions) => {
  const queryEnabled = options?.enabled ?? true

  return useQuery<ISettings, Error, ISettings, UseSettingsQueryKey>({
    queryKey: ['settings'],
    queryFn: async () => {
      return await GetApiHandler<ISettings>(`/settings`)
    },
    staleTime: 0,
    ...options,
    enabled: queryEnabled,
  })
}

export type UseSettingsResult = ReturnType<typeof useSettings>

type UsePatchSettingsOptions = Omit<
  UseMutationOptions<BasicResponseDto, Error, Partial<ISettings>>,
  'mutationFn' | 'mutationKey' | 'onSuccess'
>

export const usePatchSettings = (options?: UsePatchSettingsOptions) => {
  const queryClient = useQueryClient()

  return useMutation<BasicResponseDto, Error, Partial<ISettings>>({
    mutationKey: ['settings', 'patch'],
    mutationFn: async (payload) => {
      return await PatchApiHandler<BasicResponseDto>('/settings', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings'] satisfies UseSettingsQueryKey,
      })
    },
    ...options,
  })
}

export type UsePatchSettingsResult = ReturnType<typeof usePatchSettings>

type UseDeletePlexAuthOptions = Omit<
  UseMutationOptions<BasicResponseDto, Error, void>,
  'mutationFn' | 'mutationKey' | 'onSuccess'
>

export const useDeletePlexAuth = (options?: UseDeletePlexAuthOptions) => {
  const queryClient = useQueryClient()

  return useMutation<BasicResponseDto, Error, void>({
    mutationKey: ['settings', 'deletePlexAuth'],
    mutationFn: async () => {
      return await DeleteApiHandler<BasicResponseDto>('/settings/plex/auth')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings'] satisfies UseSettingsQueryKey,
      })
    },
    ...options,
  })
}

export type UseDeletePlexAuthResult = ReturnType<typeof useDeletePlexAuth>

type UseUpdatePlexAuthOptions = Omit<
  UseMutationOptions<BasicResponseDto, Error, string>,
  'mutationFn' | 'mutationKey' | 'onSuccess'
>

export const useUpdatePlexAuth = (options?: UseUpdatePlexAuthOptions) => {
  const queryClient = useQueryClient()

  return useMutation<BasicResponseDto, Error, string>({
    mutationKey: ['settings', 'updatePlexAuth'],
    mutationFn: async (token: string) => {
      return await PostApiHandler<BasicResponseDto>('/settings/plex/token', {
        plex_auth_token: token,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings'] satisfies UseSettingsQueryKey,
      })
    },
    ...options,
  })
}

export type UseUpdatePlexAuthResult = ReturnType<typeof useUpdatePlexAuth>

export const downloadDatabase = async (
  customFilename?: string,
): Promise<void> => {
  const response = await axios.get<Blob>(
    `${API_BASE_PATH}/api/settings/database/download`,
    {
      responseType: 'blob',
    },
  )

  const fileUrl = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  const contentDisposition = response.headers['content-disposition']
  const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/)
  const normalizedCustomFilename = customFilename?.trim()

  link.href = fileUrl
  link.download =
    normalizedCustomFilename && normalizedCustomFilename.length > 0
      ? normalizedCustomFilename
      : (filenameMatch?.[1] ?? 'maintainerr.sqlite')
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(fileUrl)
  }, 0)
}
