import { BasicResponseDto } from '@maintainerr/contracts'
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
    staleTime: Infinity,
    ...options,
  })
}

export type UseRuleConstants = ReturnType<typeof useRuleConstants>

type UseCreateRuleGroupOptions = Omit<
  UseMutationOptions<BasicResponseDto, Error, RuleGroupCreatePayload>,
  'mutationFn' | 'mutationKey' | 'onSuccess'
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
