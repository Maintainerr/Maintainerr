import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import ExternalServiceSettingsPage, {
  type ExternalServiceFieldConfig,
  type ExternalServiceSelectOption,
} from './ExternalServiceSettingsPage'

const getApiHandler = vi.fn()
const postApiHandler = vi.fn()
const deleteApiHandler = vi.fn()

vi.mock('../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
  PostApiHandler: (url: string, payload?: unknown) =>
    postApiHandler(url, payload),
  DeleteApiHandler: (url: string) => deleteApiHandler(url),
}))

vi.mock('../Common/DocsButton', () => ({
  default: () => <button type="button">Docs</button>,
}))

const urlApiKeyFields: ExternalServiceFieldConfig[] = [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:5055',
    required: true,
  },
  { name: 'api_key', label: 'API key', type: 'password' },
]

const urlOnlyFields: ExternalServiceFieldConfig[] = [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:3000',
    required: true,
  },
]

const urlApiKeySchema = z.object({
  url: z.string().min(1),
  api_key: z.string().min(1),
})

const urlOnlySchema = z.object({ url: z.string().min(1) })

const tracearrFields: ExternalServiceFieldConfig[] = [
  ...urlApiKeyFields,
  {
    name: 'server_id',
    label: 'Tracearr server',
    type: 'select',
    required: true,
    loadOptions: async (values) =>
      await postApiHandler('/settings/tracearr/servers', {
        url: values.url,
        api_key: values.api_key,
      }),
  },
]

describe('ExternalServiceSettingsPage', () => {
  beforeEach(() => {
    cleanup()
    getApiHandler.mockReset()
    postApiHandler.mockReset()
    deleteApiHandler.mockReset()
    getApiHandler.mockResolvedValue({
      url: 'http://seerr.local',
      api_key: 'saved-key',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps Save Changes enabled regardless of whether connection values have changed', async () => {
    render(
      <ExternalServiceSettingsPage
        scope="Seerr settings"
        pageTitle="Seerr settings - Maintainerr"
        heading="Seerr Settings"
        description="Seerr configuration"
        docsPage="Configuration/#seerr"
        settingsPath="/settings/seerr"
        testPath="/settings/test/seerr"
        schema={urlApiKeySchema}
        fields={urlApiKeyFields}
        testSuccessTitle="Seerr"
        testFailureMessage="Failed to connect"
      />,
    )

    const saveButton = await screen.findByRole('button', {
      name: 'Save Changes',
    })

    await waitFor(() => {
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.change(screen.getByLabelText(/URL/), {
      target: { value: 'http://seerr.internal' },
    })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('still allows clearing a saved integration without running a connection test', async () => {
    deleteApiHandler.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Deleted',
    })

    render(
      <ExternalServiceSettingsPage
        scope="Seerr settings"
        pageTitle="Seerr settings - Maintainerr"
        heading="Seerr Settings"
        description="Seerr configuration"
        docsPage="Configuration/#seerr"
        settingsPath="/settings/seerr"
        testPath="/settings/test/seerr"
        schema={urlApiKeySchema}
        fields={urlApiKeyFields}
        testSuccessTitle="Seerr"
        testFailureMessage="Failed to connect"
      />,
    )

    const saveButton = await screen.findByRole('button', {
      name: 'Save Changes',
    })

    fireEvent.change(screen.getByLabelText(/URL/), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText(/API key/), {
      target: { value: '' },
    })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    expect(
      (
        screen.getByRole('button', {
          name: 'Test Connection',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(deleteApiHandler).toHaveBeenCalledWith('/settings/seerr')
    })
  })

  it('renders only the configured fields (URL-only mode)', async () => {
    getApiHandler.mockResolvedValue({ url: 'http://streamystats.local' })
    deleteApiHandler.mockResolvedValue({ status: 'OK', code: 1, message: 'OK' })

    render(
      <ExternalServiceSettingsPage
        scope="Streamystats settings"
        pageTitle="Streamystats settings - Maintainerr"
        heading="Streamystats Settings"
        description="Streamystats configuration"
        docsPage="Configuration/#streamystats"
        settingsPath="/settings/streamystats"
        testPath="/settings/test/streamystats"
        schema={urlOnlySchema}
        fields={urlOnlyFields}
        testSuccessTitle="Streamystats"
        testFailureMessage="Failed to connect"
      />,
    )

    await screen.findByLabelText(/URL/)
    expect(screen.queryByLabelText(/API key/)).toBeNull()

    fireEvent.change(screen.getByLabelText(/URL/), {
      target: { value: '' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement,
    )

    await waitFor(() => {
      expect(deleteApiHandler).toHaveBeenCalledWith('/settings/streamystats')
    })
  })

  it('shows a warning only when an integration is not configured', async () => {
    getApiHandler.mockResolvedValue({ url: '', api_key: '' })

    render(
      <ExternalServiceSettingsPage
        scope="Tracearr settings"
        pageTitle="Tracearr settings - Maintainerr"
        heading="Tracearr Settings"
        description="Tracearr configuration"
        warning="Tracearr is not configured"
        docsPage="Configuration/#tracearr"
        settingsPath="/settings/tracearr"
        testPath="/settings/test/tracearr"
        schema={urlApiKeySchema}
        fields={urlApiKeyFields}
        testSuccessTitle="Tracearr"
        testFailureMessage="Failed to connect"
      />,
    )

    expect(await screen.findByText('Tracearr is not configured')).not.toBeNull()
  })

  it('hides the setup warning for configured integrations', async () => {
    render(
      <ExternalServiceSettingsPage
        scope="Tracearr settings"
        pageTitle="Tracearr settings - Maintainerr"
        heading="Tracearr Settings"
        description="Tracearr configuration"
        warning="Tracearr is not configured"
        docsPage="Configuration/#tracearr"
        settingsPath="/settings/tracearr"
        testPath="/settings/test/tracearr"
        schema={urlApiKeySchema}
        fields={urlApiKeyFields}
        testSuccessTitle="Tracearr"
        testFailureMessage="Failed to connect"
      />,
    )

    await screen.findByDisplayValue('http://seerr.local')

    expect(screen.queryByText('Tracearr is not configured')).toBeNull()
  })

  it('loads select options after connection fields are available', async () => {
    postApiHandler.mockResolvedValue([
      {
        value: '11111111-1111-4111-8111-111111111111',
        label: 'Sample Plex',
      },
    ])

    render(
      <ExternalServiceSettingsPage
        scope="Tracearr settings"
        pageTitle="Tracearr settings - Maintainerr"
        heading="Tracearr Settings"
        description="Tracearr configuration"
        docsPage="Configuration/#tracearr"
        settingsPath="/settings/tracearr"
        testPath="/settings/test/tracearr"
        schema={z.object({
          url: z.string().min(1),
          api_key: z.string().min(1),
          server_id: z.string().uuid(),
        })}
        fields={tracearrFields}
        testSuccessTitle="Tracearr"
        testFailureMessage="Failed to connect"
      />,
    )

    const serverSelect = await screen.findByLabelText('Tracearr server *')

    await waitFor(() => {
      expect(postApiHandler).toHaveBeenCalledWith(
        '/settings/tracearr/servers',
        {
          url: 'http://seerr.local',
          api_key: 'saved-key',
        },
      )
    })
    expect(
      await screen.findByRole('option', { name: 'Sample Plex' }),
    ).not.toBeNull()

    fireEvent.focus(serverSelect)

    expect(postApiHandler).toHaveBeenCalledTimes(1)

    fireEvent.change(serverSelect, {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    })

    expect((serverSelect as HTMLSelectElement).selectedOptions[0]?.text).toBe(
      'Sample Plex',
    )
  })

  it('shows a select error when options cannot be loaded', async () => {
    postApiHandler.mockRejectedValue(
      new Error('Could not load Tracearr servers. Verify URL and API key.'),
    )

    render(
      <ExternalServiceSettingsPage
        scope="Tracearr settings"
        pageTitle="Tracearr settings - Maintainerr"
        heading="Tracearr Settings"
        description="Tracearr configuration"
        docsPage="Configuration/#tracearr"
        settingsPath="/settings/tracearr"
        testPath="/settings/test/tracearr"
        schema={z.object({
          url: z.string().min(1),
          api_key: z.string().min(1),
          server_id: z.string().uuid(),
        })}
        fields={tracearrFields}
        testSuccessTitle="Tracearr"
        testFailureMessage="Failed to connect"
      />,
    )

    expect(
      await screen.findByText(
        'Could not load Tracearr servers. Verify URL and API key.',
      ),
    ).not.toBeNull()
  })

  it('does not start duplicate option loads when a connection field blurs into the select', async () => {
    let resolveOptions:
      ((options: ExternalServiceSelectOption[]) => void) | undefined
    postApiHandler.mockImplementation(
      () =>
        new Promise<ExternalServiceSelectOption[]>((resolve) => {
          resolveOptions = resolve
        }),
    )

    render(
      <ExternalServiceSettingsPage
        scope="Tracearr settings"
        pageTitle="Tracearr settings - Maintainerr"
        heading="Tracearr Settings"
        description="Tracearr configuration"
        docsPage="Configuration/#tracearr"
        settingsPath="/settings/tracearr"
        testPath="/settings/test/tracearr"
        schema={z.object({
          url: z.string().min(1),
          api_key: z.string().min(1),
          server_id: z.string().uuid(),
        })}
        fields={tracearrFields}
        testSuccessTitle="Tracearr"
        testFailureMessage="Failed to connect"
      />,
    )

    const apiKey = await screen.findByLabelText('API key')
    const serverSelect = screen.getByLabelText('Tracearr server *')
    await waitFor(() => {
      expect(postApiHandler).toHaveBeenCalledTimes(1)
    })
    resolveOptions?.([])
    await waitFor(() => {
      expect((serverSelect as HTMLSelectElement).disabled).toBe(false)
    })

    fireEvent.change(apiKey, { target: { value: 'new-key' } })
    fireEvent.blur(apiKey)
    fireEvent.focus(serverSelect)

    expect(postApiHandler).toHaveBeenCalledTimes(2)
  })
})
