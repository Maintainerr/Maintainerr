import { useLingui } from '@lingui/react/macro'
import {
  streamystatsSettingSchema,
  stripTrailingSlashes,
} from '@maintainerr/contracts'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
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
    fullWidth: true,
    label: 'URL',
    placeholder: 'http://localhost:3000',
    helpText: (
      <ServiceUrlExamples
        examples={['http://localhost:3000', 'https://streamystats.example.com']}
      />
    ),
    basePath: true,
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
  // /services/streamystats directly).
  if (!isJellyfin) {
    return <Navigate to="/services" replace />
  }

  return (
    <ExternalServiceSettingsPage
      updateErrorMessage={t`Streamystats settings could not be updated`}
      pageTitle={t`Streamystats settings - Maintainerr`}
      settingsPath="/settings/streamystats"
      testPath="/settings/test/streamystats"
      schema={StreamystatsSettingFormSchema}
      fields={buildFields()}
      serviceName="Streamystats"
      testFailureMessage={t`Failed to connect to Streamystats. Verify URL and that the service is running.`}
    />
  )
}
export default StreamystatsSettings
