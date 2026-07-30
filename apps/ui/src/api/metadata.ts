import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import GetApiHandler from '../utils/ApiHandler'

export const metadataKeys = {
  all: ['metadata'] as const,
  overview: (path: string) => [...metadataKeys.all, 'overview', path] as const,
}

type UseMetadataOverviewQueryKey = ReturnType<typeof metadataKeys.overview>
type UseMetadataOverviewOptions = Omit<
  UseQueryOptions<
    string | null,
    Error,
    string | null,
    UseMetadataOverviewQueryKey
  >,
  'queryKey' | 'queryFn'
>

/**
 * Hook to fetch an item's description from the configured metadata provider,
 * for items the media server does not describe itself. Takes the path built by
 * `buildMetadataPath('overview', ...)` and stays idle without one, so callers
 * can request it only when they need the fallback.
 */
export const useMetadataOverview = (
  path: string | undefined,
  options?: UseMetadataOverviewOptions,
) => {
  return useQuery<
    string | null,
    Error,
    string | null,
    UseMetadataOverviewQueryKey
  >({
    queryKey: metadataKeys.overview(path ?? ''),
    queryFn: async () => {
      if (!path) {
        return null
      }

      const response = await GetApiHandler<{ overview: string } | undefined>(
        path,
      )

      return response?.overview ?? null
    },
    // Provider descriptions barely change, and the server caches them too.
    staleTime: 300000, // 5 minutes
    enabled: !!path,
    ...options,
  })
}

export type UseMetadataOverviewResult = ReturnType<typeof useMetadataOverview>
