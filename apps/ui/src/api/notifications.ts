import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import GetApiHandler from '../utils/ApiHandler'

export interface AgentConfiguration {
  id?: number
  name: string
  agent: string
  enabled: boolean
  types: number[]
  aboutScale: number
  options: object
}

export interface NotificationAgentSpec {
  name: string
  friendlyName: string
  options: Array<{
    field: string
    type: string
    required: boolean
    // Set where the field name alone would not say what the option does.
    label?: string
    extraInfo: string
  }>
}

export interface NotificationTypeSpec {
  title: string
  id: number
}

export type UseNotificationConfigurationsQueryKey = [
  'notifications',
  'configurations',
]

type UseNotificationConfigurationsOptions = Omit<
  UseQueryOptions<
    AgentConfiguration[],
    Error,
    AgentConfiguration[],
    UseNotificationConfigurationsQueryKey
  >,
  'queryKey' | 'queryFn'
>

export const useNotificationConfigurations = (
  options?: UseNotificationConfigurationsOptions,
) =>
  useQuery<
    AgentConfiguration[],
    Error,
    AgentConfiguration[],
    UseNotificationConfigurationsQueryKey
  >({
    queryKey: ['notifications', 'configurations'],
    queryFn: () =>
      GetApiHandler<AgentConfiguration[]>('/notifications/configurations'),
    staleTime: 0,
    ...options,
  })

// Both lists are fixed by the server build, so one fetch serves every card.
export const useNotificationAgents = () =>
  useQuery({
    queryKey: ['notifications', 'agents'],
    queryFn: () =>
      GetApiHandler<NotificationAgentSpec[]>('/notifications/agents'),
    staleTime: Infinity,
  })

export const useNotificationTypes = () =>
  useQuery({
    queryKey: ['notifications', 'types'],
    queryFn: () =>
      GetApiHandler<NotificationTypeSpec[]>('/notifications/types'),
    staleTime: Infinity,
  })
