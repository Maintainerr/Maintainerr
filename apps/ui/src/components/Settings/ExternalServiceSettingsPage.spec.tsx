import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../../test-utils/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import ExternalServiceSettingsPage, {
  type ExternalServiceFieldConfig,
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

const urlApiKeyFields: ExternalServiceFieldConfig[] = [
  {
    name: 'url',
    label: 'URL',
    placeholder: 'http://localhost:5055',
    required: true,
  },
  { name: 'api_key', label: 'API key', type: 'password' },
]

const urlApiKeySchema = z.object({
  url: z.string().min(1),
  api_key: z.string().min(1),
})

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

  it('still allows clearing a saved integration without running a connection test', async () => {
    deleteApiHandler.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Deleted',
    })

    render(
      <ExternalServiceSettingsPage
        updateErrorMessage="Seerr settings could not be updated"
        pageTitle="Seerr settings - Maintainerr"
        settingsPath="/settings/seerr"
        testPath="/settings/test/seerr"
        schema={urlApiKeySchema}
        fields={urlApiKeyFields}
        serviceName="Seerr"
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

  it('loads select options after connection fields are available', async () => {
    // The picker only renders when there is a real choice to make.
    postApiHandler.mockResolvedValue([
      {
        value: '11111111-1111-4111-8111-111111111111',
        label: 'Sample Plex',
      },
      {
        value: '22222222-2222-4222-8222-222222222222',
        label: 'Other Plex',
      },
    ])

    render(
      <ExternalServiceSettingsPage
        updateErrorMessage="Tracearr settings could not be updated"
        pageTitle="Tracearr settings - Maintainerr"
        settingsPath="/settings/tracearr"
        testPath="/settings/test/tracearr"
        schema={z.object({
          url: z.string().min(1),
          api_key: z.string().min(1),
          server_id: z.string().uuid(),
        })}
        fields={tracearrFields}
        serviceName="Tracearr"
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
        updateErrorMessage="Tracearr settings could not be updated"
        pageTitle="Tracearr settings - Maintainerr"
        settingsPath="/settings/tracearr"
        testPath="/settings/test/tracearr"
        schema={z.object({
          url: z.string().min(1),
          api_key: z.string().min(1),
          server_id: z.string().uuid(),
        })}
        fields={tracearrFields}
        serviceName="Tracearr"
        testFailureMessage="Failed to connect"
      />,
    )

    expect(
      await screen.findByText(
        'Could not load Tracearr servers. Verify URL and API key.',
      ),
    ).not.toBeNull()
  })

  // Most services answer a bare "Failed", which says less than the scoped
  // message the page shows by default.
  it('shows the test result, then the save result, beside the buttons', async () => {
    postApiHandler.mockImplementation((url: string) =>
      Promise.resolve({
        status: 'OK',
        code: 1,
        message: url === '/settings/test/seerr' ? '2.0.0' : 'OK',
      }),
    )

    render(
      <ExternalServiceSettingsPage
        updateErrorMessage="Seerr settings could not be updated"
        pageTitle="Seerr settings - Maintainerr"
        settingsPath="/settings/seerr"
        testPath="/settings/test/seerr"
        schema={urlApiKeySchema}
        fields={urlApiKeyFields}
        serviceName="Seerr"
        testFailureMessage="Failed to connect"
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Test Connection' }),
    )
    expect(await screen.findByText('Success! (2.0.0)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(screen.queryByText('Success! (2.0.0)')).toBeNull()
  })

  it('surfaces the server message when a save is rejected', async () => {
    postApiHandler.mockResolvedValue({
      status: 'NOK',
      code: 0,
      message: 'Pick the Tracearr server for this media server.',
    })

    render(
      <ExternalServiceSettingsPage
        updateErrorMessage="Seerr settings could not be updated"
        pageTitle="Seerr settings - Maintainerr"
        settingsPath="/settings/seerr"
        testPath="/settings/test/seerr"
        schema={urlApiKeySchema}
        fields={urlApiKeyFields}
        serviceName="Seerr"
        testFailureMessage="Failed to connect"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    expect(
      await screen.findByText(
        'Pick the Tracearr server for this media server.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Error (check logs)')).toBeTruthy()
    expect(screen.queryByText('Seerr settings could not be updated')).toBeNull()
  })

  it('clears an integration whose hidden select still holds a resolved value', async () => {
    getApiHandler.mockResolvedValue({
      url: 'http://tracearr.local',
      api_key: 'saved-key',
      server_id: '11111111-1111-4111-8111-111111111111',
    })
    postApiHandler.mockResolvedValue([
      {
        value: '11111111-1111-4111-8111-111111111111',
        label: 'Sample Plex',
      },
    ])
    deleteApiHandler.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Deleted',
    })

    render(
      <ExternalServiceSettingsPage
        updateErrorMessage="Tracearr settings could not be updated"
        pageTitle="Tracearr settings - Maintainerr"
        settingsPath="/settings/tracearr"
        testPath="/settings/test/tracearr"
        schema={z.object({
          url: z.string().min(1),
          api_key: z.string().min(1),
          server_id: z.string().uuid().optional(),
        })}
        fields={tracearrFields}
        serviceName="Tracearr"
        testFailureMessage="Failed to connect"
      />,
    )

    const saveButton = await screen.findByRole('button', {
      name: 'Save Changes',
    })

    fireEvent.change(screen.getByLabelText(/URL/), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: '' },
    })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(deleteApiHandler).toHaveBeenCalledWith('/settings/tracearr')
    })
  })
})
