import { useLingui } from '@lingui/react/macro'
import {
  streamystatsSettingSchema,
  stripTrailingSlashes,
} from '@maintainerr/contracts'
import { z } from 'zod'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
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

// Jellyfin-only upstream; the services wrapper sends any other server's
// visit back to the hub.
const StreamystatsSettings = () => {
  const { t } = useLingui()

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
