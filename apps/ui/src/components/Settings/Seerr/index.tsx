import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  seerrSettingSchema,
  stripTrailingSlashes,
} from '@maintainerr/contracts'
import { z } from 'zod'
import { ServiceApiKeyHelp } from '../../Forms/ServiceApiKeyHelp'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
import ExternalServiceSettingsPage, {
  type ExternalServiceFieldConfig,
} from '../ExternalServiceSettingsPage'

const SeerrSettingDeleteSchema = z.object({
  url: z.literal(''),
  api_key: z.literal(''),
})

const SeerrSettingFormSchema = z.union([
  seerrSettingSchema,
  SeerrSettingDeleteSchema,
])

// A function, so every label resolves in the locale active at render.
const buildFields = (): ExternalServiceFieldConfig[] => [
  {
    name: 'url',
    fullWidth: true,
    label: 'URL',
    placeholder: 'http://localhost:5055',
    helpText: (
      <ServiceUrlExamples
        examples={['http://localhost:5055', 'https://seerr.example.com']}
      />
    ),
    normalize: stripTrailingSlashes,
    required: true,
  },
  {
    name: 'api_key',
    label: globalT`API key`,
    type: 'password',
    helpText: (values) => (
      <ServiceApiKeyHelp url={values.url} path="/settings/main">
        <Trans>Find it here: Settings → General → API Key</Trans>
      </ServiceApiKeyHelp>
    ),
  },
]

const SeerrSettings = () => {
  const { t } = useLingui()

  return (
    <ExternalServiceSettingsPage
      updateErrorMessage={t`Seerr settings could not be updated`}
      pageTitle={t`Seerr settings - Maintainerr`}
      settingsPath="/settings/seerr"
      testPath="/settings/test/seerr"
      schema={SeerrSettingFormSchema}
      fields={buildFields()}
      serviceName="Seerr"
      testFailureMessage={t`Failed to connect to Seerr. Verify URL and API key.`}
    />
  )
}
export default SeerrSettings
