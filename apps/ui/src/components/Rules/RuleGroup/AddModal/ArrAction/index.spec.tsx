import { ServarrAction } from '@maintainerr/contracts'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useServarrSettings } from '../../../../../api/settings'
import ArrAction from './index'

vi.mock('../../../../../api/settings', () => ({
  useServarrSettings: vi.fn(),
}))

describe('ArrAction', () => {
  const useServarrSettingsMock = vi.mocked(useServarrSettings)

  beforeEach(() => {
    useServarrSettingsMock.mockReset()
    useServarrSettingsMock.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useServarrSettings>)
  })

  afterEach(() => {
    cleanup()
  })

  it('does not clear the saved server before Servarr settings finish loading', async () => {
    const onUpdate = vi.fn()

    useServarrSettingsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    } as unknown as ReturnType<typeof useServarrSettings>)

    render(
      <ArrAction
        type="Sonarr"
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

    useServarrSettingsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
    } as unknown as ReturnType<typeof useServarrSettings>)

    render(
      <ArrAction
        type="Sonarr"
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

  it('shows fallback media server actions until a Sonarr server is selected', async () => {
    render(
      <ArrAction
        type="Sonarr"
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

    const actionSelect = screen.getByLabelText('Media server action')
    const actionOptions = Array.from(
      (actionSelect as HTMLSelectElement).options,
    ).map((option) => option.text)

    expect(actionOptions).toEqual(['Delete', 'Do nothing'])
    expect(actionOptions).not.toContain('Change quality profile and search')
  })

  it('shows quality profile action after a Sonarr server is selected', async () => {
    useServarrSettingsMock.mockReturnValue({
      data: [{ id: 12, serverName: 'Primary Sonarr' }],
      isLoading: false,
      isFetching: false,
    } as ReturnType<typeof useServarrSettings>)

    render(
      <ArrAction
        type="Sonarr"
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
})
