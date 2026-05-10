import { QueryClient, type QueryClientConfig } from '@tanstack/react-query'

export const createTestQueryClient = (config?: QueryClientConfig) => {
  return new QueryClient({
    ...config,
    defaultOptions: {
      queries: {
        retry: false,
        ...config?.defaultOptions?.queries,
      },
      mutations: {
        retry: false,
        ...config?.defaultOptions?.mutations,
      },
    },
  })
}
