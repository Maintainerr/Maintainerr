import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { ombiSettingSchema, stripTrailingSlashes } from '@maintainerr/contracts'
import { z } from 'zod'
import { ServiceApiKeyHelp } from '../../Forms/ServiceApiKeyHelp'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
import ExternalServiceSettingsPage, {
  type ExternalServiceFieldConfig,
} from '../ExternalServiceSettingsPage'

const OmbiSettingDeleteSchema = z.object({
  url: z.literal(''),
  api_key: z.literal(''),
})

const OmbiSettingFormSchema = z.union([
  ombiSettingSchema,
  OmbiSettingDeleteSchema,
])

// A function, so every label resolves in the locale active at render.
const buildFields = (): ExternalServiceFieldConfig[] => [
  {
    name: 'url',
    fullWidth: true,
    label: 'URL',
    placeholder: 'http://localhost:3579',
    helpText: (
      <ServiceUrlExamples
        examples={['http://localhost:3579', 'https://ombi.example.com']}
      />
    ),
    basePath: true,
    normalize: stripTrailingSlashes,
    required: true,
  },
  {
    name: 'api_key',
    label: globalT`API key`,
    type: 'password',
    helpText: (values) => (
      <ServiceApiKeyHelp url={values.url} path="/Settings/Ombi">
        <Trans>Find it here: Settings → Ombi → API Key</Trans>
      </ServiceApiKeyHelp>
    ),
  },
]

const OmbiSettings = () => {
  const { t } = useLingui()

  return (
    <ExternalServiceSettingsPage
      updateErrorMessage={t`Ombi settings could not be updated`}
      pageTitle={t`Ombi settings - Maintainerr`}
      settingsPath="/settings/ombi"
      testPath="/settings/test/ombi"
      schema={OmbiSettingFormSchema}
      fields={buildFields()}
      serviceName="Ombi"
      testFailureMessage={t`Failed to connect to Ombi. Verify URL and API key.`}
    />
  )
}
export default OmbiSettings
