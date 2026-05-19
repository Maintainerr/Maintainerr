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

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)

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
    fireEvent.change(screen.getByLabelText('API key'), {
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
})
