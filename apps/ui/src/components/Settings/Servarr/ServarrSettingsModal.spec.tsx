import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ServarrSettingsModal from './ServarrSettingsModal'

const postApiHandler = vi.fn()
const putApiHandler = vi.fn()

vi.mock('../../../utils/ApiHandler', () => ({
  PostApiHandler: (url: string, payload?: unknown) =>
    postApiHandler(url, payload),
  PutApiHandler: (url: string, payload?: unknown) =>
    putApiHandler(url, payload),
}))

vi.mock('../../Common/DocsButton', () => ({
  default: () => <button type="button">Docs</button>,
}))

vi.mock('../../Common/Modal', () => ({
  default: ({
    title,
    children,
    footerActions,
    onCancel,
  }: {
    title: string
    children: React.ReactNode
    footerActions?: React.ReactNode
    onCancel?: () => void
  }) => (
    <div>
      <h1>{title}</h1>
      <div>{children}</div>
      {footerActions}
      {onCancel ? (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
    </div>
  ),
}))

describe('ServarrSettingsModal', () => {
  beforeEach(() => {
    postApiHandler.mockReset()
    putApiHandler.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('allows clearing an existing server and saving to remove it', async () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    const onUpdate = vi.fn()

    render(
      <ServarrSettingsModal
        title="Radarr Settings"
        docsPage="Configuration/#radarr"
        settingsPath="/settings/radarr"
        testPath="/settings/test/radarr"
        serviceName="Radarr"
        settings={{
          id: 42,
          serverName: 'Radarr',
          url: 'http://radarr.local:7878/api',
          apiKey: 'secret',
        }}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCancel={() => undefined}
      />,
    )

    const saveButton = screen.getByRole('button', { name: /Save Changes/i })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Hostname or IP'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Port'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText(/Base URL/i), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: '' },
    })

    expect(
      (
        screen.getByRole('button', {
          name: /Save Changes/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
    expect(
      (
        screen.getByRole('button', {
          name: /Test Connection/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(42)
    })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(postApiHandler).not.toHaveBeenCalled()
    expect(putApiHandler).not.toHaveBeenCalled()
  })

  it('keeps Save Changes enabled when editing an existing server connection', async () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    const onUpdate = vi.fn()

    render(
      <ServarrSettingsModal
        title="Radarr Settings"
        docsPage="Configuration/#radarr"
        settingsPath="/settings/radarr"
        testPath="/settings/test/radarr"
        serviceName="Radarr"
        settings={{
          id: 42,
          serverName: 'Radarr',
          url: 'http://radarr.local:7878/api',
          apiKey: 'secret',
        }}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('Hostname or IP'), {
      target: { value: 'radarr.internal' },
    })

    expect(
      (
        screen.getByRole('button', {
          name: /Save Changes/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('allows saving a new server without a prior connection test once required fields are filled', () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    const onUpdate = vi.fn()

    render(
      <ServarrSettingsModal
        title="Radarr Settings"
        docsPage="Configuration/#radarr"
        settingsPath="/settings/radarr"
        testPath="/settings/test/radarr"
        serviceName="Radarr"
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCancel={() => undefined}
      />,
    )

    expect(
      (
        screen.getByRole('button', {
          name: /Save Changes/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: 'Radarr' },
    })
    fireEvent.change(screen.getByLabelText('Hostname or IP'), {
      target: { value: 'radarr.local' },
    })
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'secret' },
    })

    expect(
      (
        screen.getByRole('button', {
          name: /Save Changes/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('does not require a connection retest when only the server name changes', () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    const onUpdate = vi.fn()

    render(
      <ServarrSettingsModal
        title="Radarr Settings"
        docsPage="Configuration/#radarr"
        settingsPath="/settings/radarr"
        testPath="/settings/test/radarr"
        serviceName="Radarr"
        settings={{
          id: 42,
          serverName: 'Radarr',
          url: 'http://radarr.local:7878/api',
          apiKey: 'secret',
        }}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: 'Radarr Backup' },
    })

    expect(
      (
        screen.getByRole('button', {
          name: /Save Changes/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })
})
