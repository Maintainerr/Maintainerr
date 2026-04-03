import { tautulliSettingSchema } from '@maintainerr/contracts'
import { z } from 'zod'
import { stripTrailingSlashes } from '../../../utils/SettingsUtils'
import ExternalServiceSettingsPage from '../ExternalServiceSettingsPage'

const TautulliSettingDeleteSchema = z.object({
  url: z.literal(''),
  api_key: z.literal(''),
})

const TautulliSettingFormSchema = z.union([
  tautulliSettingSchema,
  TautulliSettingDeleteSchema,
])

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
      urlPlaceholder="http://localhost:8181"
      urlHelpText={
        <>
          Example URL formats:{' '}
          <span className="whitespace-nowrap">http://localhost:8181</span>,{' '}
          <span className="whitespace-nowrap">http://192.168.1.5/tautulli</span>
          ,{' '}
          <span className="whitespace-nowrap">
            https://tautulli.example.com
          </span>
        </>
      }
      testSuccessTitle="Tautulli"
      testFailureMessage="Failed to connect to Tautulli. Verify URL and API key."
      normalizeUrl={stripTrailingSlashes}
    />
  )
}
export default TautulliSettings
