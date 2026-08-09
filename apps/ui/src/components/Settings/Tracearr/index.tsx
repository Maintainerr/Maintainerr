import {
  serviceUrlSchema,
  stripTrailingSlashes,
  type TracearrServer,
  tracearrSettingSchema,
} from '@maintainerr/contracts'
import { PostApiHandler } from '../../../utils/ApiHandler'
import ExternalServiceSettingsPage, {
  type ExternalServiceFieldConfig,
} from '../ExternalServiceSettingsPage'

const fields: ExternalServiceFieldConfig[] = [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:3000',
    normalize: stripTrailingSlashes,
    required: true,
  },
  {
    name: 'api_key',
    label: 'API key',
    type: 'password',
    required: true,
    // The field is still being typed, so it is only a link once it parses as a
    // service URL. Anything else, a javascript: value included, stays text.
    helpText: (values) =>
      serviceUrlSchema.safeParse(values.url).success ? (
        <a
          className="underline"
          href={`${stripTrailingSlashes(values.url)}/settings`}
          target="_blank"
          rel="noreferrer"
        >
          Find it in Tracearr under Settings, General, API Key.
        </a>
      ) : (
        'Find it in Tracearr under Settings, General, API Key.'
      ),
  },
  // Only rendered when Tracearr has more than one server of the configured
  // media server's type, since that is the only case Maintainerr cannot
  // resolve on its own.
  {
    name: 'server_id',
    label: 'Tracearr server',
    type: 'select',
    loadOptions: async (values) => {
      if (!values.url || !values.api_key) {
        return []
      }

      const servers = await PostApiHandler<TracearrServer[]>(
        '/settings/tracearr/servers',
        { url: values.url, api_key: values.api_key },
      )
      return servers.map((server) => ({
        value: server.id,
        label: server.name,
      }))
    },
  },
]

const TracearrSettings = () => {
  return (
    <ExternalServiceSettingsPage
      scope="Tracearr settings"
      pageTitle="Tracearr settings - Maintainerr"
      heading="Tracearr Settings"
      description="Maintainerr picks the Tracearr media server backend automatically: the one tracking the media server configured in Maintainerr."
      docsPage="Configuration/#tracearr"
      settingsPath="/settings/tracearr"
      testPath="/settings/test/tracearr"
      schema={tracearrSettingSchema}
      fields={fields}
      testSuccessTitle="Tracearr"
      testFailureMessage="Failed to connect to Tracearr. Verify the URL and API key."
    />
  )
}

export default TracearrSettings
