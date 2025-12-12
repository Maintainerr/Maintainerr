import { BasicResponseDto, RuleExecuteStatusDto } from '@maintainerr/contracts'
import {
  useMutation,
  UseMutationOptions,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query'
import type { IRule } from '../components/Rules/Rule/RuleCreator'
import type { IRuleGroup } from '../components/Rules/RuleGroup'
import { AgentConfiguration } from '../components/Settings/Notifications/CreateNotificationModal'
import { IConstants } from '../contexts/constants-context'
import GetApiHandler, {
  PostApiHandler,
  PutApiHandler,
} from '../utils/ApiHandler'
import { EPlexDataType } from '../utils/PlexDataType-enum'

export interface RuleGroupCollectionPayload {
  visibleOnRecommended: boolean
  visibleOnHome: boolean
  deleteAfterDays?: number
  manualCollection?: boolean
  manualCollectionName?: string
  keepLogsForMonths?: number
}

export interface RuleGroupCreatePayload {
  name: string
  description: string
  libraryId: number
  arrAction: number
  isActive: boolean
  useRules: boolean
  listExclusions: boolean
  forceOverseerr: boolean
  tautulliWatchedPercentOverride?: number
  radarrSettingsId?: number
  sonarrSettingsId?: number
  collection: RuleGroupCollectionPayload
  rules: IRule[]
  dataType: EPlexDataType
  notifications: AgentConfiguration[]
  ruleHandlerCronSchedule: string | null
}

export type RuleGroupUpdatePayload = RuleGroupCreatePayload & { id: number }

type UseRuleGroupQueryKey = ['rules', 'group', string]

type UseRuleGroupOptions = Omit<
  UseQueryOptions<IRuleGroup, Error, IRuleGroup, UseRuleGroupQueryKey>,
  'queryKey' | 'queryFn'
>

export const useRuleGroup = (
  id?: string | number,
  options?: UseRuleGroupOptions,
) => {
  const normalizedId = id != null ? String(id) : ''
  const queryEnabled = normalizedId.length > 0 && (options?.enabled ?? true)

  return useQuery<IRuleGroup, Error, IRuleGroup, UseRuleGroupQueryKey>({
    queryKey: ['rules', 'group', normalizedId],
    queryFn: async () => {
      if (!normalizedId) {
        throw new Error('Rule Group ID is required to fetch rule data.')
      }

      return await GetApiHandler<IRuleGroup>(`/rules/${normalizedId}`)
    },
    staleTime: 0,
    ...options,
    enabled: queryEnabled,
  })
}

export type UseRuleGroupResult = ReturnType<typeof useRuleGroup>

type UseRuleConstantsQueryKey = ['rules', 'constants']

type UseRuleConstantsOptions = Omit<
  UseQueryOptions<IConstants, Error, IConstants, UseRuleConstantsQueryKey>,
  'queryKey' | 'queryFn'
>

export const useRuleConstants = (options?: UseRuleConstantsOptions) => {
  return useQuery({
    queryKey: ['rules', 'constants'],
    queryFn: async () => {
      return await GetApiHandler<IConstants>(`/rules/constants`)
    },
    staleTime: 0,
    ...options,
  })
}

export type UseRuleConstants = ReturnType<typeof useRuleConstants>

type UseCreateRuleGroupOptions = Omit<
  UseMutationOptions<BasicResponseDto, Error, RuleGroupCreatePayload>,
  'mutationFn' | 'mutationKey'
>

export const useCreateRuleGroup = (options?: UseCreateRuleGroupOptions) => {
  return useMutation<BasicResponseDto, Error, RuleGroupCreatePayload>({
    mutationKey: ['rules', 'groups', 'create'],
    mutationFn: async (payload) => {
      const response = await PostApiHandler<BasicResponseDto>('/rules', payload)

      if (response.code !== 1) {
        throw new Error(response.message ?? 'Failed to create rule group')
      }

      return response
    },
    ...options,
  })
}

export type UseCreateRuleGroupResult = ReturnType<typeof useCreateRuleGroup>

type UseUpdateRuleGroupOptions = Omit<
  UseMutationOptions<BasicResponseDto, Error, RuleGroupUpdatePayload>,
  'mutationFn' | 'mutationKey' | 'onSuccess'
>

export const useUpdateRuleGroup = (options?: UseUpdateRuleGroupOptions) => {
  const queryClient = useQueryClient()

  return useMutation<BasicResponseDto, Error, RuleGroupUpdatePayload>({
    mutationKey: ['rules', 'groups', 'update'],
    mutationFn: async (payload) => {
      const response = await PutApiHandler<BasicResponseDto>('/rules', payload)

      if (response.code !== 1) {
        throw new Error(response.message ?? 'Failed to update rule group')
      }

      return response
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          'rules',
          'group',
          String(variables.id),
        ] satisfies UseRuleGroupQueryKey,
      })
    },
    ...options,
  })
}

export type UseUpdateRuleGroupResult = ReturnType<typeof useUpdateRuleGroup>

type UseRuleHandlerStatusQueryKey = ['rules', 'execute', 'status']

type UseRuleHandlerStatusOptions = Omit<
  UseQueryOptions<
    RuleExecuteStatusDto,
    Error,
    RuleExecuteStatusDto,
    UseRuleHandlerStatusQueryKey
  >,
  'queryKey' | 'queryFn'
>

export const useRuleHandlerStatus = (options?: UseRuleHandlerStatusOptions) => {
  return useQuery({
    queryKey: ['rules', 'execute', 'status'],
    queryFn: async () => {
      return await GetApiHandler<RuleExecuteStatusDto>('/rules/execute/status')
    },
    staleTime: 0,
    ...options,
  })
}

export type UseRuleHandlerStatus = ReturnType<typeof useRuleHandlerStatus>

type UseStopAllRuleExecutionOptions = Omit<
  UseMutationOptions<void, Error, void>,
  'mutationFn' | 'mutationKey'
>

export const useStopAllRuleExecution = (
  options?: UseStopAllRuleExecutionOptions,
) => {
  const queryClient = useQueryClient()

  return useMutation<void, Error, void>({
    mutationKey: ['rules', 'execute', 'stop'],
    mutationFn: async () => {
      await PostApiHandler<void>('/rules/execute/stop', {})
    },
    onSuccess: async (data, variables, context, mutation) => {
      await queryClient.invalidateQueries({
        queryKey: [
          'rules',
          'execute',
          'status',
        ] satisfies UseRuleHandlerStatusQueryKey,
      })

      if (options?.onSuccess) {
        await options.onSuccess(data, variables, context, mutation)
      }
    },
    ...options,
  })
}

export type UseStopAllRuleExecution = ReturnType<typeof useStopAllRuleExecution>

type UseStopRuleGroupExecutionOptions = Omit<
  UseMutationOptions<void, Error, number | string>,
  'mutationFn' | 'mutationKey'
>

export const useStopRuleGroupExecution = (
  options?: UseStopRuleGroupExecutionOptions,
) => {
  const queryClient = useQueryClient()

  return useMutation<void, Error, number | string>({
    mutationKey: ['rules', 'execute', 'rulegroup', 'stop'],
    mutationFn: async (id) => {
      const normalizedId = String(id)

      await PostApiHandler<void>(`/rules/${normalizedId}/execute/stop`, {})
    },
    onSuccess: async (data, variables, context, mutation) => {
      await queryClient.invalidateQueries({
        queryKey: [
          'rules',
          'execute',
          'status',
        ] satisfies UseRuleHandlerStatusQueryKey,
      })

      if (options?.onSuccess) {
        await options.onSuccess(data, variables, context, mutation)
      }
    },
    ...options,
  })
}

export type UseStopRuleGroupExecution = ReturnType<
  typeof useStopRuleGroupExecution
>

type UseExecuteRuleGroupOptions = Omit<
  UseMutationOptions<void, Error, number | string>,
  'mutationFn' | 'mutationKey'
>

export const useExecuteRuleGroup = (options?: UseExecuteRuleGroupOptions) => {
  const queryClient = useQueryClient()

  return useMutation<void, Error, number | string>({
    mutationKey: ['rules', 'execute', 'rulegroup', 'start'],
    mutationFn: async (id) => {
      const normalizedId = String(id)

      await PostApiHandler<void>(`/rules/${normalizedId}/execute`, {})
    },
    onSuccess: async (data, variables, context, mutation) => {
      await queryClient.invalidateQueries({
        queryKey: [
          'rules',
          'execute',
          'status',
        ] satisfies UseRuleHandlerStatusQueryKey,
      })

      if (options?.onSuccess) {
        await options.onSuccess(data, variables, context, mutation)
      }
    },
    ...options,
  })
}

export type UseExecuteRuleGroup = ReturnType<typeof useExecuteRuleGroup>
