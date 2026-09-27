import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  stripTrailingSlashes,
  type TracearrServer,
  tracearrSettingSchema,
} from '@maintainerr/contracts'
import { ServiceApiKeyHelp } from '../../Forms/ServiceApiKeyHelp'
import { ServiceUrlExamples } from '../../Forms/ServiceUrlExamples'
import { PostApiHandler } from '../../../utils/ApiHandler'
import ExternalServiceSettingsPage, {
  type ExternalServiceFieldConfig,
} from '../ExternalServiceSettingsPage'

// A function, so every label resolves in the locale active at render.
const buildFields = (): ExternalServiceFieldConfig[] => [
  {
    name: 'url',
    fullWidth: true,
    label: 'URL',
    placeholder: 'http://localhost:3000',
    helpText: (
      <ServiceUrlExamples
        examples={['http://localhost:3000', 'https://tracearr.example.com']}
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
      <ServiceApiKeyHelp url={values.url} path="/settings/data/api">
        <Trans>Find it here: Settings → API → API Key</Trans>
      </ServiceApiKeyHelp>
    ),
    required: true,
  },
  // Only rendered when Tracearr has more than one server of the configured
  // media server's type, since that is the only case Maintainerr cannot
  // resolve on its own.
  {
    name: 'server_id',
    label: globalT`Tracearr server`,
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
  const { t } = useLingui()

  return (
    <ExternalServiceSettingsPage
      updateErrorMessage={t`Tracearr settings could not be updated`}
      pageTitle={t`Tracearr settings - Maintainerr`}
      settingsPath="/settings/tracearr"
      testPath="/settings/test/tracearr"
      schema={tracearrSettingSchema}
      fields={buildFields()}
      serviceName="Tracearr"
      testFailureMessage={t`Failed to connect to Tracearr. Verify the URL and API key.`}
    />
  )
}

export default TracearrSettings
