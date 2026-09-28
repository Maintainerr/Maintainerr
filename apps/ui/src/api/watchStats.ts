import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import GetApiHandler from '../utils/ApiHandler'

export const watchStatsKeys = {
  all: ['watchStats'] as const,
  item: (path: string) => [...watchStatsKeys.all, path] as const,
}

/**
 * Hook to fetch an item's watch statistics from a statistics service. Resolves
 * to null on a 404, which is how every such endpoint says it has nothing on the
 * item, so an unwatched item is not retried or reported as a failure.
 */
export const useWatchStats = <T>(path: string, enabled = true) =>
  useQuery<T | null>({
    queryKey: watchStatsKeys.item(path),
    queryFn: async () => {
      try {
        return (await GetApiHandler<T | undefined>(path)) ?? null
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
    retry: false,
    enabled,
  })
