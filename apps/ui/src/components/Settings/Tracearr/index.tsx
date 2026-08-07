import {
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
  },
  {
    name: 'server_id',
    label: 'Tracearr server',
    type: 'select',
    required: true,
    loadOptions: async (values) => {
      if (!values.url || !values.api_key) {
        return []
      }

      const servers = await PostApiHandler<TracearrServer[]>(
        '/settings/tracearr/servers',
        {
          url: values.url,
          api_key: values.api_key,
        },
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
      description="Tracearr configuration"
      docsPage="Configuration/#tracearr"
      settingsPath="/settings/tracearr"
      testPath="/settings/test/tracearr"
      schema={tracearrSettingSchema}
      fields={fields}
      testSuccessTitle="Tracearr"
      testFailureMessage="Failed to connect to Tracearr. Verify URL, API key, and server ID."
    />
  )
}

export default TracearrSettings
