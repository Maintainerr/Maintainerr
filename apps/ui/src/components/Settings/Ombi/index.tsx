import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { ombiSettingSchema, stripTrailingSlashes } from '@maintainerr/contracts'
import { z } from 'zod'
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
    label: 'URL',
    placeholder: 'http://localhost:3579',
    helpText: (
      <>
        <Trans>Example URL formats:</Trans>{' '}
        <span className="whitespace-nowrap">http://localhost:3579</span>,{' '}
        <span className="whitespace-nowrap">http://192.168.1.5/ombi</span>,{' '}
        <span className="whitespace-nowrap">https://ombi.example.com</span>
      </>
    ),
    normalize: stripTrailingSlashes,
    required: true,
  },
  {
    name: 'api_key',
    label: globalT`API key`,
    type: 'password',
  },
]

const OmbiSettings = () => {
  const { t } = useLingui()

  return (
    <ExternalServiceSettingsPage
      updatedMessage={t`Ombi settings updated`}
      updateErrorMessage={t`Ombi settings could not be updated`}
      pageTitle={t`Ombi settings - Maintainerr`}
      heading={t`Ombi Settings`}
      description={t`Ombi configuration`}
      docsPage="Configuration/#ombi"
      settingsPath="/settings/ombi"
      testPath="/settings/test/ombi"
      schema={OmbiSettingFormSchema}
      fields={buildFields()}
      testSuccessTitle="Ombi"
      testFailureMessage={t`Failed to connect to Ombi. Verify URL and API key.`}
    />
  )
}
export default OmbiSettings
