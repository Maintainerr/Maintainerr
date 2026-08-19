import { Trans, useLingui } from '@lingui/react/macro'
import {
  streamystatsSettingSchema,
  stripTrailingSlashes,
} from '@maintainerr/contracts'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { useMediaServerType } from '../../../hooks/useMediaServerType'
import ExternalServiceSettingsPage, {
  type ExternalServiceFieldConfig,
} from '../ExternalServiceSettingsPage'

const StreamystatsSettingDeleteSchema = z.object({
  url: z.literal(''),
})

const StreamystatsSettingFormSchema = z.union([
  streamystatsSettingSchema,
  StreamystatsSettingDeleteSchema,
])

// A function, so every label resolves in the locale active at render.
const buildFields = (): ExternalServiceFieldConfig[] => [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:3000',
    helpText: (
      <>
        <Trans>Example URL formats:</Trans>
        <br />
        <span className="whitespace-nowrap">http://localhost:3000</span>
        <br />
        <span className="whitespace-nowrap">
          https://streamystats.example.com
        </span>
      </>
    ),
    normalize: stripTrailingSlashes,
    required: true,
  },
]

const StreamystatsSettings = () => {
  const { t } = useLingui()
  const { isJellyfin, isLoading } = useMediaServerType()

  if (isLoading) {
    return null
  }

  // Streamystats is Jellyfin-only upstream; redirect away from the route if
  // the active media server is anything else (e.g. Plex/Emby user typing
  // /settings/streamystats directly).
  if (!isJellyfin) {
    return <Navigate to="/settings/main" replace />
  }

  return (
    <ExternalServiceSettingsPage
      updatedMessage={t`Streamystats settings updated`}
      updateErrorMessage={t`Streamystats settings could not be updated`}
      pageTitle={t`Streamystats settings - Maintainerr`}
      heading={t`Streamystats Settings`}
      description={t`Streamystats configuration. Authentication reuses the configured Jellyfin API key.`}
      docsPage="Configuration/#streamystats"
      settingsPath="/settings/streamystats"
      testPath="/settings/test/streamystats"
      schema={StreamystatsSettingFormSchema}
      fields={buildFields()}
      testSuccessTitle="Streamystats"
      testFailureMessage={t`Failed to connect to Streamystats. Verify URL and that the service is running.`}
    />
  )
}
export default StreamystatsSettings
