import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useServarrSettings } from '../../../api/settings'
import { DeleteApiHandler } from '../../../utils/ApiHandler'
import { logClientError } from '../../../utils/ClientLogger'
import { ICollection } from '../../Collection'
import { ServiceCardAddTile } from '../ServiceCard'
import ServarrServerCard from './ServarrServerCard'
import ServerInUseModal from './ServerInUseModal'

export type ServarrService = 'radarr' | 'sonarr' | 'sportarr'

type DeleteServarrSettingResponseDto =
  | {
      status: 'OK'
      code: 1
      message: string
      data?: never
    }
  | {
      status: 'NOK'
      code: 0
      message: string
      data: {
        collectionsInUse: ICollection[]
      } | null
    }

// Whole messages per service rather than a spliced name, so each translates
// as a sentence.
const serviceCopy: Record<
  ServarrService,
  { name: string; title: MessageDescriptor; add: MessageDescriptor }
> = {
  radarr: {
    name: 'Radarr',
    title: msg`Radarr settings - Maintainerr`,
    add: msg`Add Radarr server`,
  },
  sonarr: {
    name: 'Sonarr',
    title: msg`Sonarr settings - Maintainerr`,
    add: msg`Add Sonarr server`,
  },
  sportarr: {
    name: 'Sportarr',
    title: msg`Sportarr settings - Maintainerr`,
    add: msg`Add Sportarr server`,
  },
}

export const ServarrSettings = ({ service }: { service: ServarrService }) => {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const copy = serviceCopy[service]
  const serviceName = copy.name
  const { data: servers, isLoading } = useServarrSettings(service)
  const [adding, setAdding] = useState(false)
  // The server just added, so its card can confirm the save.
  const [createdId, setCreatedId] = useState<number>()
  const [collectionsInUseWarning, setCollectionsInUseWarning] = useState<
    ICollection[] | undefined
  >()
  // The services switcher and hub read the same query, so they follow along.
  const refetchServers = () =>
    queryClient.invalidateQueries({
      queryKey: ['settings', 'servarr', service],
    })

  const confirmedDelete = async (id: number) => {
    try {
      const resp = await DeleteApiHandler<DeleteServarrSettingResponseDto>(
        `/settings/${service}/${id}`,
      )

      if (resp.code === 1) {
        void refetchServers()
        return true
      }

      if (resp.data?.collectionsInUse) {
        // The in-use dialog says why, so the card adds no warning of its own.
        setCollectionsInUseWarning(resp.data.collectionsInUse)
        return true
      }
    } catch (error: unknown) {
      void logClientError(
        `Failed to delete ${serviceName} setting`,
        error,
        'Settings.Servarr.confirmedDelete',
      )
    }

    return false
  }

  const cardProps = {
    settingsPath: `/settings/${service}`,
    testPath: `/settings/test/${service}`,
    serviceName,
    metadataRefreshPath:
      service === 'sportarr'
        ? '/settings/metadata/refresh/sportarr'
        : undefined,
    canTagExclusions: service !== 'sportarr',
    onDelete: confirmedDelete,
  }

  return (
    <>
      <title>{t(copy.title)}</title>
      <div className="h-full w-full">
        {/* Reserve the card-row height so the list doesn't pop in / shift the
            page (no layout shift) while the server list loads. */}
        <ul className="grid min-h-39 max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
          {isLoading ? null : (
            <>
              {servers?.map((server) => (
                <li key={server.id} className="h-full">
                  <ServarrServerCard
                    {...cardProps}
                    title={server.serverName}
                    settings={server}
                    created={server.id === createdId}
                    onSaved={() => void refetchServers()}
                  />
                </li>
              ))}
              <li className={adding ? 'h-full' : 'self-start'}>
                {adding ? (
                  <ServarrServerCard
                    {...cardProps}
                    title={t(copy.add)}
                    onSaved={async (setting) => {
                      setCreatedId(setting.id)
                      // Close the draft once its saved card is in the list.
                      await refetchServers()
                      setAdding(false)
                    }}
                    onCancel={() => setAdding(false)}
                  />
                ) : (
                  <ServiceCardAddTile
                    label={t(copy.add)}
                    onClick={() => setAdding(true)}
                  />
                )}
              </li>
            </>
          )}
        </ul>
      </div>
      {collectionsInUseWarning ? (
        <ServerInUseModal
          collections={collectionsInUseWarning}
          onClose={() => setCollectionsInUseWarning(undefined)}
        />
      ) : undefined}
    </>
  )
}

const isServarrService = (value?: string): value is ServarrService =>
  value === 'radarr' || value === 'sonarr' || value === 'sportarr'

const ServarrSettingsPage = () => {
  const { service } = useParams()
  return isServarrService(service) ? (
    <ServarrSettings key={service} service={service} />
  ) : (
    <Navigate to="/services" replace />
  )
}

export default ServarrSettingsPage
