import { MediaServerType } from '@maintainerr/contracts'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '../../test-utils/render'
import TelemetryConsentModal from './TelemetryConsentModal'

// The prompt links to the settings page, so it needs a router context.
const renderModal = () =>
  render(
    <MemoryRouter>
      <TelemetryConsentModal />
    </MemoryRouter>,
  )

const updateTelemetrySetting = vi.fn()

// The prompt waits for media server setup, so a settings object that would
// pass the guard is the baseline every case starts from.
const CONFIGURED = {
  media_server_type: MediaServerType.JELLYFIN,
  jellyfin_url: 'http://localhost:8096',
  jellyfin_api_key: 'key',
}
let currentSettings: Record<string, unknown> | undefined

vi.mock('../../api/settings', () => ({
  useSettings: () => ({ data: currentSettings }),
  useUpdateTelemetrySetting: () => ({
    mutateAsync: updateTelemetrySetting,
    isPending: false,
  }),
}))

describe('TelemetryConsentModal', () => {
  beforeEach(() => {
    updateTelemetrySetting.mockReset()
    updateTelemetrySetting.mockResolvedValue({ code: 1 })
    currentSettings = { ...CONFIGURED, telemetryEnabled: null }
  })

  it.each([
    ['already on', true],
    ['already off', false],
  ])('stays hidden when the install is %s', (_label, telemetryEnabled) => {
    currentSettings = { ...CONFIGURED, telemetryEnabled }

    renderModal()

    expect(screen.queryByText('Help shape Maintainerr?')).toBeNull()
  })

  it('stays hidden until settings have loaded', () => {
    currentSettings = undefined

    renderModal()

    expect(screen.queryByText('Help shape Maintainerr?')).toBeNull()
  })

  it('stays hidden until media server setup is complete', () => {
    currentSettings = { telemetryEnabled: null }

    renderModal()

    expect(screen.queryByText('Help shape Maintainerr?')).toBeNull()
  })

  it('asks an install that has not answered yet', () => {
    renderModal()

    expect(screen.getByText('Help shape Maintainerr?')).toBeTruthy()
  })

  it('records keeping it on so it is not asked again', async () => {
    renderModal()

    screen.getByRole('button', { name: 'Keep it on' }).click()

    await waitFor(() =>
      expect(updateTelemetrySetting).toHaveBeenCalledWith(true),
    )
  })

  it('turns telemetry off when opted out', async () => {
    renderModal()

    screen.getByRole('button', { name: 'Turn it off' }).click()

    await waitFor(() =>
      expect(updateTelemetrySetting).toHaveBeenCalledWith(false),
    )
  })
})
