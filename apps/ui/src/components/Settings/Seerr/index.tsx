import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  seerrSettingSchema,
  stripTrailingSlashes,
} from '@maintainerr/contracts'
import { z } from 'zod'
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
    label: 'URL',
    placeholder: 'http://localhost:5055',
    helpText: (
      <>
        <Trans>Example URL formats:</Trans>{' '}
        <span className="whitespace-nowrap">http://localhost:5055</span>,{' '}
        <span className="whitespace-nowrap">http://192.168.1.5/seerr</span>,{' '}
        <span className="whitespace-nowrap">https://seerr.example.com</span>
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

const SeerrSettings = () => {
  const { t } = useLingui()

  return (
    <ExternalServiceSettingsPage
      updatedMessage={t`Seerr settings updated`}
      updateErrorMessage={t`Seerr settings could not be updated`}
      pageTitle={t`Seerr settings - Maintainerr`}
      heading={t`Seerr Settings`}
      description={t`Seerr configuration`}
      docsPage="Configuration/#seerr"
      settingsPath="/settings/seerr"
      testPath="/settings/test/seerr"
      schema={SeerrSettingFormSchema}
      fields={buildFields()}
      testSuccessTitle="Seerr"
      testFailureMessage={t`Failed to connect to Seerr. Verify URL and API key.`}
    />
  )
}
export default SeerrSettings
