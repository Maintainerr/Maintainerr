import {
  BasicResponseDto,
  JellyfinSetting,
  MediaServerSwitchPreview,
  MediaServerType,
  SwitchMediaServerRequest,
  SwitchMediaServerResponse,
} from '@maintainerr/contracts'
import {
  useMutation,
  UseMutationOptions,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query'
import GetApiHandler, {
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
  // Media server type - null when not yet selected
  media_server_type?: MediaServerType | null
  // Plex settings
  plex_name: string
  plex_hostname: string
  plex_port: number
  plex_ssl: number
  plex_auth_token: string | null
  // Jellyfin settings
  jellyfin_url?: string
  jellyfin_api_key?: string
  jellyfin_user_id?: string
  jellyfin_server_name?: string
  // Third-party integrations
  overseerr_api_key: string
  tautulli_url: string
  tautulli_api_key: string
  jellyseerr_url: string
  jellyseerr_api_key: string
  collection_handler_job_cron: string
  rules_handler_job_cron: string
}

// Jellyfin test result (not in contracts as it's UI-specific)
export interface JellyfinTestResult {
  status: string
  code: number
  message: string
  serverName?: string
  version?: string
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

type UseTestJellyfinOptions = Omit<
  UseMutationOptions<JellyfinTestResult, Error, JellyfinSetting>,
  'mutationFn' | 'mutationKey'
>

export const useTestJellyfin = (options?: UseTestJellyfinOptions) => {
  return useMutation<JellyfinTestResult, Error, JellyfinSetting>({
    mutationKey: ['settings', 'testJellyfin'],
    mutationFn: async (payload) => {
      return await PostApiHandler<JellyfinTestResult>(
        '/settings/jellyfin/test',
        payload,
      )
    },
    ...options,
  })
}

export type UseTestJellyfinResult = ReturnType<typeof useTestJellyfin>

type UseSaveJellyfinSettingsOptions = Omit<
  UseMutationOptions<BasicResponseDto, Error, JellyfinSetting>,
  'mutationFn' | 'mutationKey' | 'onSuccess'
>

export const useSaveJellyfinSettings = (
  options?: UseSaveJellyfinSettingsOptions,
) => {
  const queryClient = useQueryClient()

  return useMutation<BasicResponseDto, Error, JellyfinSetting>({
    mutationKey: ['settings', 'saveJellyfin'],
    mutationFn: async (payload) => {
      return await PostApiHandler<BasicResponseDto>(
        '/settings/jellyfin',
        payload,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings'] satisfies UseSettingsQueryKey,
      })
    },
    ...options,
  })
}

export type UseSaveJellyfinSettingsResult = ReturnType<
  typeof useSaveJellyfinSettings
>

type UseDeleteJellyfinSettingsOptions = Omit<
  UseMutationOptions<BasicResponseDto, Error, void>,
  'mutationFn' | 'mutationKey' | 'onSuccess'
>

export const useDeleteJellyfinSettings = (
  options?: UseDeleteJellyfinSettingsOptions,
) => {
  const queryClient = useQueryClient()

  return useMutation<BasicResponseDto, Error, void>({
    mutationKey: ['settings', 'deleteJellyfin'],
    mutationFn: async () => {
      return await DeleteApiHandler<BasicResponseDto>('/settings/jellyfin')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings'] satisfies UseSettingsQueryKey,
      })
    },
    ...options,
  })
}

export type UseDeleteJellyfinSettingsResult = ReturnType<
  typeof useDeleteJellyfinSettings
>

type UsePreviewMediaServerSwitchOptions = Omit<
  UseMutationOptions<MediaServerSwitchPreview, Error, MediaServerType>,
  'mutationFn' | 'mutationKey'
>

export const usePreviewMediaServerSwitch = (
  options?: UsePreviewMediaServerSwitchOptions,
) => {
  return useMutation<MediaServerSwitchPreview, Error, MediaServerType>({
    mutationKey: ['settings', 'previewMediaServerSwitch'],
    mutationFn: async (targetServerType) => {
      return await GetApiHandler<MediaServerSwitchPreview>(
        `/settings/media-server/switch/preview/${targetServerType}`,
      )
    },
    ...options,
  })
}

export type UsePreviewMediaServerSwitchResult = ReturnType<
  typeof usePreviewMediaServerSwitch
>

type UseSwitchMediaServerOptions = Omit<
  UseMutationOptions<
    SwitchMediaServerResponse,
    Error,
    SwitchMediaServerRequest
  >,
  'mutationFn' | 'mutationKey' | 'onSuccess'
>

export const useSwitchMediaServer = (options?: UseSwitchMediaServerOptions) => {
  const queryClient = useQueryClient()

  return useMutation<
    SwitchMediaServerResponse,
    Error,
    SwitchMediaServerRequest
  >({
    mutationKey: ['settings', 'switchMediaServer'],
    mutationFn: async (payload) => {
      return await PostApiHandler<SwitchMediaServerResponse>(
        '/settings/media-server/switch',
        payload,
      )
    },
    onSuccess: () => {
      // Invalidate all relevant queries after switching
      queryClient.invalidateQueries({
        queryKey: ['settings'] satisfies UseSettingsQueryKey,
      })
      queryClient.invalidateQueries({
        queryKey: ['collections'],
      })
    },
    ...options,
  })
}

export type UseSwitchMediaServerResult = ReturnType<typeof useSwitchMediaServer>
