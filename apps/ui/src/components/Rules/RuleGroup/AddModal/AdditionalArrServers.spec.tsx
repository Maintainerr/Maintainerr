import { fireEvent, render, screen } from '../../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useServarrSettings } from '../../../../api/settings'
import type { IServarrSetting } from '../../../../api/settings'
import { buildQuerySuccessResult } from '../../../../test-utils/queryResults'
import AdditionalArrServers from './AdditionalArrServers'

vi.mock('../../../../api/settings', () => ({
  useServarrSettings: vi.fn(),
}))

const server = (id: number, serverName: string) =>
  ({ id, serverName, url: '', apiKey: '' }) as IServarrSetting

describe('AdditionalArrServers', () => {
  const useServarrSettingsMock = vi.mocked(useServarrSettings)

  beforeEach(() => {
    useServarrSettingsMock.mockReset()
  })

  // The primary server already takes the action, so it is never offered.
  it('offers only the other servers and reports the toggled selection', () => {
    useServarrSettingsMock.mockReturnValue(
      buildQuerySuccessResult([server(1, 'Radarr HD'), server(2, 'Radarr 4K')]),
    )
    const onChange = vi.fn()

    render(
      <AdditionalArrServers
        type="Radarr"
        primarySettingId={1}
        selectedIds={[]}
        onChange={onChange}
      />,
    )

    expect(screen.queryByLabelText('Radarr HD')).toBeNull()
    fireEvent.click(screen.getByLabelText('Radarr 4K'))
    expect(onChange).toHaveBeenCalledWith([2])
  })
})
