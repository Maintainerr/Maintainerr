import { MediaServerType, TelemetryPing } from '@maintainerr/contracts'
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
let currentStatus: { forcedOff: boolean } | undefined

// The prompt shows the weekly block, so the preview has to resolve.
const preview: TelemetryPing = {
  version: '3.24.0',
  versionTag: 'latest',
  isDocker: true,
  nodeMajor: 26,
  arch: 'x64',
  platform: 'linux',
  mediaServer: 'jellyfin',
}

// Monaco does not render under jsdom, so the payload is captured from the
// props instead of read back out of the DOM.
let editorValue: string | undefined
vi.mock('../Common/PayloadViewer', () => ({
  default: ({ value }: { value: unknown }) => {
    editorValue = JSON.stringify(value, null, 2)
    return <pre>{editorValue}</pre>
  },
}))

let isPending = false

vi.mock('../../api/settings', () => ({
  useSettings: () => ({ data: currentSettings }),
  useTelemetryPreview: () => ({ data: preview }),
  useTelemetryStatus: () => ({ data: currentStatus }),
  useUpdateTelemetrySetting: () => ({
    mutateAsync: updateTelemetrySetting,
    isPending,
  }),
}))

describe('TelemetryConsentModal', () => {
  beforeEach(() => {
    updateTelemetrySetting.mockReset()
    updateTelemetrySetting.mockResolvedValue({ code: 1 })
    currentSettings = { ...CONFIGURED, telemetryEnabled: null }
    currentStatus = { forcedOff: false }
    isPending = false
  })

  it.each([
    { state: 'already on', telemetryEnabled: true },
    { state: 'already off', telemetryEnabled: false },
  ])('stays hidden when the install is $state', ({ telemetryEnabled }) => {
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

  // TELEMETRY=off cannot be answered away: the server refuses the write, so
  // asking would repeat forever (#3605). Unknown is the same case until it
  // resolves, or the prompt flashes up and vanishes.
  it.each([
    { state: 'the environment turned it off', status: { forcedOff: true } },
    { state: 'the status has not resolved', status: undefined },
  ])('stays hidden when $state', ({ status }) => {
    currentStatus = status

    renderModal()

    expect(screen.queryByText('Help shape Maintainerr?')).toBeNull()
  })

  it('asks an install that has not answered yet', () => {
    renderModal()

    expect(screen.getByText('Help shape Maintainerr?')).toBeTruthy()
  })

  /**
   * The prompt is the only place many people will look, so it has to show the
   * payload itself rather than describe it.
   */
  it('shows the weekly payload, without the sampled block', () => {
    renderModal()

    expect(editorValue).toBe(JSON.stringify(preview, null, 2))
    expect(editorValue).not.toContain('sample')
  })

  // A write in flight must not blank the prompt and leave the opt-out as the
  // only button, which is what a shared-Modal `loading` does.
  it('keeps the payload and both buttons while the answer is saving', () => {
    isPending = true

    renderModal()

    expect(screen.getByRole('button', { name: 'Keep it on' })).toBeTruthy()
    expect(editorValue).toBe(JSON.stringify(preview, null, 2))
  })

  it('records keeping it on so it is not asked again', async () => {
    renderModal()

    screen.getByRole('button', { name: 'Keep it on' }).click()

    await waitFor(() =>
      expect(updateTelemetrySetting).toHaveBeenCalledWith(true),
    )
  })

  /**
   * Opting out goes through the settings page rather than ending here, so this
   * button must record nothing: an install that walks away is unanswered, not
   * opted out, and gets asked again.
   */
  it('sends the user to settings without recording an answer', async () => {
    renderModal()

    screen.getByRole('button', { name: 'Turn it off in settings' }).click()

    await waitFor(() =>
      expect(screen.queryByText('Help shape Maintainerr?')).toBeNull(),
    )
    expect(updateTelemetrySetting).not.toHaveBeenCalled()
  })
})
