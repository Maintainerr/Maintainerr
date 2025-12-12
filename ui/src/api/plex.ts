import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import GetApiHandler from '../utils/ApiHandler'

export interface ILibrary {
  key: string
  type: 'movie' | 'show'
  title: string
}

type UsePlexLibrariesQueryKey = ['plex', 'libraries']

type UsePlexLibrariesOptions = Omit<
  UseQueryOptions<ILibrary[], Error, ILibrary[], UsePlexLibrariesQueryKey>,
  'queryKey' | 'queryFn'
>

export const usePlexLibraries = (options?: UsePlexLibrariesOptions) => {
  const queryEnabled = options?.enabled ?? true

  return useQuery<ILibrary[], Error, ILibrary[], UsePlexLibrariesQueryKey>({
    queryKey: ['plex', 'libraries'],
    queryFn: async () => {
      return await GetApiHandler<ILibrary[]>(`/plex/libraries`)
    },
    staleTime: 0,
    ...options,
    enabled: queryEnabled,
  })
}

export type UsePlexLibrariesResult = ReturnType<typeof usePlexLibraries>
