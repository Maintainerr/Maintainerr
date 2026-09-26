import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ServarrServerCard from './ServarrServerCard'

const postApiHandler = vi.fn()
const putApiHandler = vi.fn()

vi.mock('../../../utils/ApiHandler', () => ({
  PostApiHandler: (url: string, payload?: unknown) =>
    postApiHandler(url, payload),
  PutApiHandler: (url: string, payload?: unknown) =>
    putApiHandler(url, payload),
}))

type CardProps = ComponentProps<typeof ServarrServerCard>

const saved = {
  id: 42,
  serverName: 'Radarr',
  url: 'http://radarr.local:7878/api',
  apiKey: 'secret',
}

const Harness = (props: Partial<CardProps>) => (
  <ServarrServerCard
    title="Radarr"
    settingsPath="/settings/radarr"
    testPath="/settings/test/radarr"
    serviceName="Radarr"
    onSaved={vi.fn()}
    onDelete={vi.fn().mockResolvedValue(true)}
    {...props}
  />
)

const button = (name: RegExp) =>
  screen.getByRole('button', { name }) as HTMLButtonElement

describe('ServarrServerCard', () => {
  beforeEach(() => {
    postApiHandler.mockReset()
    putApiHandler.mockReset()
  })

  it('allows clearing an existing server and saving to remove it', async () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    const onSaved = vi.fn()
    render(<Harness settings={saved} onDelete={onDelete} onSaved={onSaved} />)

    for (const label of [
      'Server Name',
      'Hostname or IP',
      'Port',
      /Base URL/i,
      'API key',
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } })
    }

    expect(button(/Save Changes/i).disabled).toBe(false)
    expect(button(/Test Connection/i).disabled).toBe(true)

    fireEvent.click(button(/Save Changes/i))

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(42)
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(postApiHandler).not.toHaveBeenCalled()
    expect(putApiHandler).not.toHaveBeenCalled()
  })

  it('keeps Save Changes enabled when editing a saved server without a retest', () => {
    render(<Harness settings={saved} />)

    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: 'Radarr Backup' },
    })
    fireEvent.change(screen.getByLabelText('Hostname or IP'), {
      target: { value: 'radarr.internal' },
    })

    expect(button(/Save Changes/i).disabled).toBe(false)
  })

  it('enables saving a new server once the required fields are filled', () => {
    render(<Harness />)

    expect(button(/Save Changes/i).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: 'Radarr' },
    })
    fireEvent.change(screen.getByLabelText('Hostname or IP'), {
      target: { value: 'radarr.local' },
    })
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'secret' },
    })

    expect(button(/Save Changes/i).disabled).toBe(false)
  })

  it('posts a new server and hands the saved setting back', async () => {
    const onSaved = vi.fn()
    postApiHandler.mockResolvedValue({ code: 1, data: saved })
    render(<Harness onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: 'Radarr' },
    })
    fireEvent.change(screen.getByLabelText('Hostname or IP'), {
      target: { value: 'radarr.local' },
    })
    fireEvent.change(screen.getByLabelText('Port'), {
      target: { value: '7878' },
    })
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'secret' },
    })
    fireEvent.click(button(/Save Changes/i))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(saved)
    })
    expect(postApiHandler).toHaveBeenCalledWith('/settings/radarr', {
      url: 'http://radarr.local:7878',
      apiKey: 'secret',
      serverName: 'Radarr',
    })
  })

  it('puts an edited server to its own path', async () => {
    putApiHandler.mockResolvedValue({ code: 1, data: saved })
    render(<Harness settings={saved} />)

    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: 'Radarr Backup' },
    })
    fireEvent.click(button(/Save Changes/i))

    await waitFor(() => {
      expect(putApiHandler).toHaveBeenCalledWith('/settings/radarr/42', {
        url: 'http://radarr.local:7878/api',
        apiKey: 'secret',
        serverName: 'Radarr Backup',
        id: 42,
      })
    })
    expect(await screen.findByText('Saved')).toBeTruthy()
  })

  it('saves the exclusion tag with the server, and refuses an invalid label', async () => {
    putApiHandler.mockResolvedValue({ code: 1, data: saved })
    render(<Harness settings={saved} canTagExclusions />)

    fireEvent.click(screen.getByLabelText('Tag excluded content'))
    fireEvent.change(screen.getByLabelText('Tag label'), {
      target: { value: 'Not Valid' },
    })
    fireEvent.click(button(/Save Changes/i))

    expect(
      await screen.findByText(/"Not Valid" is not a valid Radarr tag/),
    ).toBeTruthy()
    expect(putApiHandler).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Tag label'), {
      target: { value: 'keep' },
    })
    fireEvent.click(screen.getByLabelText('Remove tag on un-exclude'))
    fireEvent.click(button(/Save Changes/i))

    await waitFor(() => {
      expect(putApiHandler).toHaveBeenCalledWith(
        '/settings/radarr/42',
        expect.objectContaining({
          tagExclusions: true,
          exclusionTag: 'keep',
          untagOnUnexclude: true,
        }),
      )
    })
  })

  it('shows the test result beside the buttons', async () => {
    postApiHandler.mockResolvedValue({ code: 1, message: '6.0.0.1234' })
    render(<Harness settings={saved} />)

    fireEvent.click(button(/Test Connection/i))

    expect(await screen.findByText('Success! (6.0.0)')).toBeTruthy()
    expect(postApiHandler).toHaveBeenCalledWith('/settings/test/radarr', {
      url: 'http://radarr.local:7878/api',
      apiKey: 'secret',
      serverName: 'Radarr',
    })
  })

  it('asks for confirmation before deleting, and cancels a new server', async () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    const onCancel = vi.fn()
    const { rerender } = render(
      <Harness settings={saved} onDelete={onDelete} />,
    )

    fireEvent.click(button(/^Delete$/))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(button(/Are you sure\?/))
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(42)
    })

    rerender(<Harness onCancel={onCancel} />)
    fireEvent.click(button(/Cancel/))
    expect(onCancel).toHaveBeenCalled()
  })

  it('says when a server could not be removed', async () => {
    render(
      <Harness settings={saved} onDelete={vi.fn().mockResolvedValue(false)} />,
    )

    fireEvent.click(button(/^Delete$/))
    fireEvent.click(button(/Are you sure\?/))

    expect(await screen.findByText('Error (check logs)')).toBeTruthy()
  })

  it('offers a metadata refresh only when a refresh path is given, and posts to it', async () => {
    // What the server really answers: the provider name, upper-cased.
    postApiHandler.mockResolvedValue({
      code: 1,
      message: 'SPORTARR metadata refresh started',
    })
    const sportarr = { ...saved, id: 7, serverName: 'Sportarr' }

    const { rerender } = render(
      <Harness serviceName="Sportarr" settings={sportarr} />,
    )
    expect(
      screen.queryByRole('button', { name: /Refresh metadata/i }),
    ).toBeNull()

    rerender(
      <Harness
        serviceName="Sportarr"
        settings={sportarr}
        metadataRefreshPath="/settings/metadata/refresh/sportarr"
      />,
    )
    fireEvent.click(button(/Refresh metadata/i))

    await waitFor(() => {
      expect(postApiHandler).toHaveBeenCalledWith(
        '/settings/metadata/refresh/sportarr',
        {},
      )
    })
    expect(await screen.findByText('Refreshing')).toBeTruthy()
  })

  it('does not offer a refresh on a server that has not been saved yet', () => {
    render(
      <Harness
        serviceName="Sportarr"
        metadataRefreshPath="/settings/metadata/refresh/sportarr"
      />,
    )

    expect(
      screen.queryByRole('button', { name: /Refresh metadata/i }),
    ).toBeNull()
  })
})
