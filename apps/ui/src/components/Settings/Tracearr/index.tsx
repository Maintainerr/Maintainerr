import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
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

// A function, so every label resolves in the locale active at render.
const buildFields = (): ExternalServiceFieldConfig[] => [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:3000',
    normalize: stripTrailingSlashes,
    required: true,
  },
  {
    name: 'api_key',
    label: globalT`API key`,
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
          <Trans>Find it in Tracearr under Settings, General, API Key.</Trans>
        </a>
      ) : (
        globalT`Find it in Tracearr under Settings, General, API Key.`
      ),
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
      updatedMessage={t`Tracearr settings updated`}
      updateErrorMessage={t`Tracearr settings could not be updated`}
      pageTitle={t`Tracearr settings - Maintainerr`}
      heading={t`Tracearr Settings`}
      description={t`Maintainerr picks the Tracearr media server backend automatically: the one tracking the media server configured in Maintainerr.`}
      docsPage="Configuration/#tracearr"
      settingsPath="/settings/tracearr"
      testPath="/settings/test/tracearr"
      schema={tracearrSettingSchema}
      fields={buildFields()}
      testSuccessTitle="Tracearr"
      testFailureMessage={t`Failed to connect to Tracearr. Verify the URL and API key.`}
    />
  )
}

export default TracearrSettings
