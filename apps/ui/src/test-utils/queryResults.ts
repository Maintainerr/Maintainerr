import type {
  QueryObserverLoadingErrorResult,
  QueryObserverLoadingResult,
  QueryObserverResult,
  QueryObserverSuccessResult,
  UseQueryResult,
} from '@tanstack/react-query'
import { createDeferred } from './createDeferred'

type QueryResultRefetch<TData, TError> = UseQueryResult<
  TData,
  TError
>['refetch']

const createRefetch = <TData, TError>(): QueryResultRefetch<TData, TError> => {
  return async (): Promise<QueryObserverResult<TData, TError>> =>
    buildQueryLoadingResult<TData, TError>()
}

export const buildQuerySuccessResult = <TData, TError = Error>(
  data: TData,
  overrides: Partial<QueryObserverSuccessResult<TData, TError>> = {},
): QueryObserverSuccessResult<TData, TError> => {
  const result = {
    data,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isLoading: false,
    isPending: false,
    isLoadingError: false,
    isInitialLoading: false,
    isPaused: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    isEnabled: true,
    refetch: createRefetch<TData, TError>(),
    status: 'success',
    fetchStatus: 'idle',
    promise: Promise.resolve(data),
  } satisfies QueryObserverSuccessResult<TData, TError>

  return {
    ...result,
    ...overrides,
  }
}

export const buildQueryLoadingResult = <TData, TError = Error>(
  overrides: Partial<QueryObserverLoadingResult<TData, TError>> = {},
): QueryObserverLoadingResult<TData, TError> => {
  const result = {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: true,
    isLoading: true,
    isPending: true,
    isLoadingError: false,
    isInitialLoading: true,
    isPaused: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: true,
    isSuccess: false,
    isEnabled: true,
    refetch: createRefetch<TData, TError>(),
    status: 'pending',
    fetchStatus: 'fetching',
    promise: createDeferred<TData>().promise,
  } satisfies QueryObserverLoadingResult<TData, TError>

  return {
    ...result,
    ...overrides,
  }
}

export const buildQueryErrorResult = <TData, TError = Error>(
  error: TError,
  overrides: Partial<QueryObserverLoadingErrorResult<TData, TError>> = {},
): QueryObserverLoadingErrorResult<TData, TError> => {
  const result = {
    data: undefined,
    dataUpdatedAt: 0,
    error,
    errorUpdatedAt: 0,
    failureCount: 1,
    failureReason: error,
    errorUpdateCount: 1,
    isError: true,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isLoading: false,
    isPending: false,
    isLoadingError: true,
    isInitialLoading: false,
    isPaused: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: true,
    isSuccess: false,
    isEnabled: true,
    refetch: createRefetch<TData, TError>(),
    status: 'error',
    fetchStatus: 'idle',
    promise: createDeferred<TData>().promise,
  } satisfies QueryObserverLoadingErrorResult<TData, TError>

  return {
    ...result,
    ...overrides,
  }
}
