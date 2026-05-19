import { tautulliSettingSchema } from '@maintainerr/contracts'
import { z } from 'zod'
import { stripTrailingSlashes } from '../../../utils/SettingsUtils'
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

const fields: ExternalServiceFieldConfig[] = [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:8181',
    helpText: (
      <>
        Example URL formats:{' '}
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
    label: 'API key',
    type: 'password',
  },
]

const TautulliSettings = () => {
  return (
    <ExternalServiceSettingsPage
      scope="Tautulli settings"
      pageTitle="Tautulli settings - Maintainerr"
      heading="Tautulli Settings"
      description="Tautulli configuration"
      docsPage="Configuration/#tautulli"
      settingsPath="/settings/tautulli"
      testPath="/settings/test/tautulli"
      schema={TautulliSettingFormSchema}
      fields={fields}
      testSuccessTitle="Tautulli"
      testFailureMessage="Failed to connect to Tautulli. Verify URL and API key."
    />
  )
}
export default TautulliSettings
