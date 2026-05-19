import { streamystatsSettingSchema } from '@maintainerr/contracts'
import { z } from 'zod'
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
        Example URL formats:{' '}
        <span className="whitespace-nowrap">http://localhost:3000</span>,{' '}
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
