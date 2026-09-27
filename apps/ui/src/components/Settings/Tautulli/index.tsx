import { t as globalT } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import {
  stripTrailingSlashes,
  tautulliSettingSchema,
} from '@maintainerr/contracts'
import { z } from 'zod'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
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
      <ServiceUrlExamples
        examples={['http://localhost:8181', 'https://tautulli.example.com']}
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
  },
]

const TautulliSettings = () => {
  const { t } = useLingui()

  return (
    <ExternalServiceSettingsPage
      updateErrorMessage={t`Tautulli settings could not be updated`}
      pageTitle={t`Tautulli settings - Maintainerr`}
      settingsPath="/settings/tautulli"
      testPath="/settings/test/tautulli"
      schema={TautulliSettingFormSchema}
      fields={buildFields()}
      serviceName="Tautulli"
      testFailureMessage={t`Failed to connect to Tautulli. Verify URL and API key.`}
    />
  )
}
export default TautulliSettings
