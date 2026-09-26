import { Trans, useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  type AgentConfiguration,
  useNotificationAgents,
  useNotificationConfigurations,
  type UseNotificationConfigurationsQueryKey,
  useNotificationTypes,
} from '../../../api/notifications'
import { DeleteApiHandler } from '../../../utils/ApiHandler'
import { ServiceCardAddTile } from '../ServiceCard'
import NotificationAgentCard from './NotificationAgentCard'

const NotificationSettings = () => {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { data: configurations } = useNotificationConfigurations()
  const { data: agents } = useNotificationAgents()
  const { data: types } = useNotificationTypes()
  const [adding, setAdding] = useState(false)
  // The agent just added, so its card can confirm the save.
  const [createdId, setCreatedId] = useState<number>()

  // The services hub reads the same query, so it follows along.
  const refetch = async () => {
    const queryKey = [
      'notifications',
      'configurations',
    ] satisfies UseNotificationConfigurationsQueryKey
    await queryClient.refetchQueries({ queryKey })
    return queryClient.getQueryData<AgentConfiguration[]>(queryKey) ?? []
  }

  const deleteAgent = async (id: number) => {
    try {
      const response = await DeleteApiHandler<{ code: number }>(
        `/notifications/configuration/${id}`,
      )
      if (response.code !== 1) return false
      await refetch()
      return true
    } catch {
      return false
    }
  }

  return (
    <>
      <title>{t`Notification settings - Maintainerr`}</title>
      {/* Reserve the card-row height so the list doesn't pop in / shift the
          page (no layout shift) while the agents load. The cards wait for the
          agent and type lists, since every form is built from them. */}
      <ul className="flex min-h-39 max-w-6xl flex-col gap-6">
        {configurations && agents && types ? (
          <>
            {configurations.map((config) => (
              <li key={config.id}>
                <NotificationAgentCard
                  config={config}
                  agents={agents}
                  types={types}
                  created={config.id === createdId}
                  onSaved={() => void refetch()}
                  onDelete={deleteAgent}
                />
              </li>
            ))}
            <li>
              {adding ? (
                <NotificationAgentCard
                  agents={agents}
                  types={types}
                  onSaved={async () => {
                    const before = new Set(configurations.map((c) => c.id))
                    const after = await refetch()
                    setCreatedId(after.find((c) => !before.has(c.id))?.id)
                    // Close the draft once its saved card is in the list.
                    setAdding(false)
                  }}
                  onDelete={deleteAgent}
                  onCancel={() => setAdding(false)}
                />
              ) : (
                <ServiceCardAddTile
                  label={<Trans>Add Agent</Trans>}
                  onClick={() => setAdding(true)}
                />
              )}
            </li>
          </>
        ) : null}
      </ul>
    </>
  )
}

export default NotificationSettings
