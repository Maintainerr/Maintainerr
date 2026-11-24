import { ServarrAction } from '@maintainerr/contracts'
import { render, screen, waitFor } from '../../../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useServarrSettings } from '../../../../../api/settings'
import {
  buildQueryLoadingResult,
  buildQuerySuccessResult,
} from '../../../../../test-utils/queryResults'
import type { IServarrSetting } from '../../../../../api/settings'
import ArrAction from './index'

vi.mock('../../../../../api/settings', () => ({
  useServarrSettings: vi.fn(),
}))

describe('ArrAction', () => {
  const useServarrSettingsMock = vi.mocked(useServarrSettings)

  beforeEach(() => {
    useServarrSettingsMock.mockReset()
    useServarrSettingsMock.mockReturnValue(
      buildQuerySuccessResult<IServarrSetting[]>([]),
    )
  })

  it('does not clear the saved server before Servarr settings finish loading', async () => {
    const onUpdate = vi.fn()

    useServarrSettingsMock.mockReturnValue(
      buildQueryLoadingResult<IServarrSetting[]>(),
    )

    render(
      <ArrAction
        type="Sonarr"
        mediaServerName="Plex"
        arrAction={ServarrAction.DELETE}
        settingId={12}
        onUpdate={onUpdate}
        options={[
          { id: ServarrAction.DELETE, name: 'Delete entire show' },
          { id: ServarrAction.DO_NOTHING, name: 'Do nothing' },
        ]}
      />,
    )

    await waitFor(() => {
      expect(useServarrSettingsMock).toHaveBeenCalledWith('sonarr')
    })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('Loading servers...')).toBeTruthy()
  })

  it('clears the saved server after settings load when it no longer exists', async () => {
    const onUpdate = vi.fn()

    useServarrSettingsMock.mockReturnValue(
      buildQuerySuccessResult<IServarrSetting[]>([]),
    )

    render(
      <ArrAction
        type="Sonarr"
        mediaServerName="Plex"
        arrAction={ServarrAction.DELETE}
        settingId={12}
        onUpdate={onUpdate}
        options={[
          { id: ServarrAction.DELETE, name: 'Delete entire show' },
          { id: ServarrAction.DO_NOTHING, name: 'Do nothing' },
        ]}
      />,
    )

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(0, undefined)
    })
  })

  it('shows the media server actions until a Sonarr server is selected', async () => {
    render(
      <ArrAction
        type="Sonarr"
        mediaServerName="Plex"
        arrAction={ServarrAction.DELETE}
        settingId={undefined}
        onUpdate={vi.fn()}
        options={[
          { id: ServarrAction.DELETE, name: 'Delete entire show' },
          { id: ServarrAction.DO_NOTHING, name: 'Do nothing' },
          {
            id: ServarrAction.CHANGE_QUALITY_PROFILE,
            name: 'Change quality profile and search',
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(useServarrSettingsMock).toHaveBeenCalledWith('sonarr')
    })

    const actionSelect = screen.getByLabelText('Plex action')
    const actionOptions = Array.from(
      (actionSelect as HTMLSelectElement).options,
    ).map((option) => option.text)

    expect(actionOptions).toEqual(['Delete', 'Do nothing'])
    expect(actionOptions).not.toContain('Change quality profile and search')
  })

  it('shows quality profile action after a Sonarr server is selected', async () => {
    const sonarrSettings: IServarrSetting[] = [
      {
        id: 12,
        serverName: 'Primary Sonarr',
        url: 'http://sonarr.example',
        apiKey: 'test-api-key',
      },
    ]

    useServarrSettingsMock.mockReturnValue(
      buildQuerySuccessResult(sonarrSettings),
    )

    render(
      <ArrAction
        type="Sonarr"
        mediaServerName="Plex"
        arrAction={ServarrAction.DELETE}
        settingId={12}
        onUpdate={vi.fn()}
        options={[
          { id: ServarrAction.DELETE, name: 'Delete entire show' },
          { id: ServarrAction.DO_NOTHING, name: 'Do nothing' },
          {
            id: ServarrAction.CHANGE_QUALITY_PROFILE,
            name: 'Change quality profile and search',
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(useServarrSettingsMock).toHaveBeenCalledWith('sonarr')
    })

    const actionSelect = screen.getByLabelText('Sonarr action')
    const actionOptions = Array.from(
      (actionSelect as HTMLSelectElement).options,
    ).map((option) => option.text)

    expect(actionOptions).toContain('Change quality profile and search')
  })

  // The browser would show the first option for it, and Save kept it (#4137).
  it('shows a stored action the server cannot take as unsupported', () => {
    useServarrSettingsMock.mockReturnValue(
      buildQuerySuccessResult<IServarrSetting[]>([
        {
          id: 12,
          serverName: 'Primary Sonarr',
          url: 'http://sonarr.example',
          apiKey: 'test-api-key',
        },
      ]),
    )

    render(
      <ArrAction
        type="Sonarr"
        mediaServerName="Plex"
        arrAction={ServarrAction.UNMONITOR_DELETE_EXISTING}
        settingId={12}
        onUpdate={vi.fn()}
        options={[
          { id: ServarrAction.DO_NOTHING, name: 'Do nothing' },
          { id: ServarrAction.DELETE, name: 'Unmonitor and delete episode' },
          { id: ServarrAction.UNMONITOR, name: 'Unmonitor and keep file' },
        ]}
      />,
    )

    const actionSelect = screen.getByLabelText(
      'Sonarr action',
    ) as HTMLSelectElement

    expect(actionSelect.selectedOptions[0].text).toBe(
      'Stored action (unsupported)',
    )
  })

  // A Radarr server on a show collection supports no action, not even Delete.
  it('shows an action the caller flags as unsupported, even one of its options', () => {
    render(
      <ArrAction
        type="Sonarr"
        mediaServerName="Plex"
        arrAction={ServarrAction.DELETE}
        settingId={undefined}
        onUpdate={vi.fn()}
        options={[]}
        actionUnsupported
      />,
    )

    expect(
      (screen.getByLabelText('Plex action') as HTMLSelectElement)
        .selectedOptions[0].text,
    ).toBe('Stored action (unsupported)')
  })

  // A cached list may predate the saved server, and a failed refresh keeps it:
  // resetting on it chose Delete, and the select showed None while Save kept it.
  it('keeps the saved server, shown as loading, until a refresh lists it', () => {
    const onUpdate = vi.fn()
    const cached = buildQuerySuccessResult<IServarrSetting[]>([], {
      isFetching: true,
    })
    // A new element each time, or React skips the rerender.
    const arrAction = () => (
      <ArrAction
        type="Sonarr"
        mediaServerName="Plex"
        arrAction={ServarrAction.DELETE}
        settingId={12}
        onUpdate={onUpdate}
        options={[{ id: ServarrAction.DELETE, name: 'Delete' }]}
      />
    )
    const serverShown = () =>
      (screen.getByLabelText('Sonarr server *') as HTMLSelectElement)
        .selectedOptions[0].text

    useServarrSettingsMock.mockReturnValue(cached)
    const { rerender } = render(arrAction())
    expect(serverShown()).toBe('Loading servers...')

    useServarrSettingsMock.mockReturnValue({
      ...cached,
      isFetching: false,
      error: new Error('refresh failed'),
      isError: true,
      isRefetchError: true,
      isSuccess: false,
      status: 'error',
    })
    rerender(arrAction())
    expect(serverShown()).toBe('Loading servers...')

    expect(onUpdate).not.toHaveBeenCalled()
  })
})
