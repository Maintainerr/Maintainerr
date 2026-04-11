import { ServarrAction } from '@maintainerr/contracts'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArrAction from './index'

const getApiHandlerMock = vi.fn()

vi.mock('../../../../../utils/ApiHandler', () => ({
  default: (...args: unknown[]) => getApiHandlerMock(...args),
}))

describe('ArrAction', () => {
  beforeEach(() => {
    getApiHandlerMock.mockReset()
    getApiHandlerMock.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
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
      expect(getApiHandlerMock).toHaveBeenCalledWith('/settings/sonarr')
    })

    const actionSelect = screen.getByLabelText('Media server action')
    const actionOptions = Array.from(
      (actionSelect as HTMLSelectElement).options,
    ).map((option) => option.text)

    expect(actionOptions).toEqual(['Delete', 'Do nothing'])
    expect(actionOptions).not.toContain('Change quality profile and search')
  })

  it('shows quality profile action after a Sonarr server is selected', async () => {
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
      expect(getApiHandlerMock).toHaveBeenCalledWith('/settings/sonarr')
    })

    const actionSelect = screen.getByLabelText('Sonarr action')
    const actionOptions = Array.from(
      (actionSelect as HTMLSelectElement).options,
    ).map((option) => option.text)

    expect(actionOptions).toContain('Change quality profile and search')
  })
})
