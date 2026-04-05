import { seerrSettingSchema } from '@maintainerr/contracts'
import { z } from 'zod'
import { stripTrailingSlashes } from '../../../utils/SettingsUtils'
import ExternalServiceSettingsPage from '../ExternalServiceSettingsPage'

const SeerrSettingDeleteSchema = z.object({
  url: z.literal(''),
  api_key: z.literal(''),
})

const SeerrSettingFormSchema = z.union([
  seerrSettingSchema,
  SeerrSettingDeleteSchema,
])

const SeerrSettings = () => {
  return (
    <ExternalServiceSettingsPage
      scope="Seerr settings"
      pageTitle="Seerr settings - Maintainerr"
      heading="Seerr Settings"
      description="Seerr configuration (also compatible with Overseerr and Jellyseerr)"
      docsPage="Configuration/#seerr"
      settingsPath="/settings/seerr"
      testPath="/settings/test/seerr"
      schema={SeerrSettingFormSchema}
      urlPlaceholder="http://localhost:5055"
      urlHelpText={
        <>
          Example URL formats:{' '}
          <span className="whitespace-nowrap">http://localhost:5055</span>,{' '}
          <span className="whitespace-nowrap">http://192.168.1.5/seerr</span>,{' '}
          <span className="whitespace-nowrap">https://seerr.example.com</span>
        </>
      }
      testSuccessTitle="Seerr"
      testFailureMessage="Failed to connect to Overseerr. Verify URL and API key."
      normalizeUrl={stripTrailingSlashes}
    />
  )
}
export default SeerrSettings
