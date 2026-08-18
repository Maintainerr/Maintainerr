import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  stripTrailingSlashes,
  tautulliSettingSchema,
} from '@maintainerr/contracts'
import { z } from 'zod'
import ExternalServiceSettingsPage, {
  type ExternalServiceFieldConfig,
} from '../ExternalServiceSettingsPage'

const TautulliSettingDeleteSchema = z.object({
  url: z.literal(''),
  api_key: z.literal(''),
})

const TautulliSettingFormSchema = z.union([
  tautulliSettingSchema,
  TautulliSettingDeleteSchema,
])

// A function, so every label resolves in the locale active at render.
const buildFields = (): ExternalServiceFieldConfig[] => [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:8181',
    helpText: (
      <>
        <Trans>Example URL formats:</Trans>{' '}
        <span className="whitespace-nowrap">http://localhost:8181</span>,{' '}
        <span className="whitespace-nowrap">http://192.168.1.5/tautulli</span>,{' '}
        <span className="whitespace-nowrap">https://tautulli.example.com</span>
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

const TautulliSettings = () => {
  const { t } = useLingui()

  return (
    <ExternalServiceSettingsPage
      updatedMessage={t`Tautulli settings updated`}
      updateErrorMessage={t`Tautulli settings could not be updated`}
      pageTitle={t`Tautulli settings - Maintainerr`}
      heading={t`Tautulli Settings`}
      description={t`Tautulli configuration`}
      docsPage="Configuration/#tautulli"
      settingsPath="/settings/tautulli"
      testPath="/settings/test/tautulli"
      schema={TautulliSettingFormSchema}
      fields={buildFields()}
      testSuccessTitle="Tautulli"
      testFailureMessage={t`Failed to connect to Tautulli. Verify URL and API key.`}
    />
  )
}
export default TautulliSettings
