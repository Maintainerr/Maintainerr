import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import ExternalServiceSettingsPage from './ExternalServiceSettingsPage'

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
        schema={z.object({
          url: z.string().min(1),
          api_key: z.string().min(1),
        })}
        urlPlaceholder="http://localhost:5055"
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
        schema={z.object({
          url: z.string().min(1),
          api_key: z.string().min(1),
        })}
        urlPlaceholder="http://localhost:5055"
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
})
