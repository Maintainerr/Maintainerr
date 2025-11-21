import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import type { IRuleGroup } from '../components/Rules/RuleGroup'
import { IConstants } from '../contexts/constants-context'
import GetApiHandler from '../utils/ApiHandler'

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
