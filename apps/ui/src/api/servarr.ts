import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import GetApiHandler from '../utils/ApiHandler'

interface QualityProfile {
  id: number
  name: string
}

type UseQualityProfilesQueryKey = [
  'servarr',
  'qualityProfiles',
  'radarr' | 'sonarr',
  number,
]

type UseQualityProfilesOptions = Omit<
  UseQueryOptions<
    QualityProfile[],
    Error,
    QualityProfile[],
    UseQualityProfilesQueryKey
  >,
  'queryKey' | 'queryFn'
>

export const useQualityProfiles = (
  type: 'radarr' | 'sonarr',
  settingId?: number | null,
  options?: UseQualityProfilesOptions,
) => {
  const normalizedId = settingId ?? 0
  const queryEnabled =
    settingId != null && settingId > 0 && (options?.enabled ?? true)

  return useQuery<
    QualityProfile[],
    Error,
    QualityProfile[],
    UseQualityProfilesQueryKey
  >({
    queryKey: ['servarr', 'qualityProfiles', type, normalizedId],
    queryFn: async () => {
      if (!normalizedId) {
        return []
      }

      return await GetApiHandler<QualityProfile[]>(
        `/servarr/${type}/${normalizedId}/profiles`,
      )
    },
    staleTime: 300000, // 5 minutes
    ...options,
    enabled: queryEnabled,
  })
}

export type UseQualityProfilesResult = ReturnType<typeof useQualityProfiles>
