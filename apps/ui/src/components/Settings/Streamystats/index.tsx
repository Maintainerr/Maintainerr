import { streamystatsSettingSchema } from '@maintainerr/contracts'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { useMediaServerType } from '../../../hooks/useMediaServerType'
import { stripTrailingSlashes } from '../../../utils/SettingsUtils'
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

const fields: ExternalServiceFieldConfig[] = [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:3000',
    helpText: (
      <>
        <div>Example URL formats:</div>
        <div className="whitespace-nowrap">http://localhost:3000</div>
        <div className="whitespace-nowrap">
          https://streamystats.example.com
        </div>
      </>
    ),
    normalize: stripTrailingSlashes,
    required: true,
  },
]

const StreamystatsSettings = () => {
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
      scope="Streamystats settings"
      pageTitle="Streamystats settings - Maintainerr"
      heading="Streamystats Settings"
      description="Streamystats configuration. Authentication reuses the configured Jellyfin API key."
      docsPage="Configuration/#streamystats"
      settingsPath="/settings/streamystats"
      testPath="/settings/test/streamystats"
      schema={StreamystatsSettingFormSchema}
      fields={fields}
      testSuccessTitle="Streamystats"
      testFailureMessage="Failed to connect to Streamystats. Verify URL and that the service is running."
    />
  )
}
export default StreamystatsSettings
