import { TelemetryPing, TelemetryStatus } from '@maintainerr/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../test-utils/render'
import TelemetrySettings from './index'

const updateTelemetrySetting = vi.fn()

let currentSettings: { telemetryEnabled?: boolean | null } = {}
let currentPreview: {
  data?: TelemetryPing
  isLoading: boolean
  isError: boolean
} = { data: undefined, isLoading: true, isError: false }
let currentStatus: TelemetryStatus | undefined

// Monaco does not render under jsdom, so the viewer is stood in for by the
// plain element the payload assertions read back out of.
vi.mock('../../Common/PayloadViewer', () => ({
  default: ({ value }: { value: unknown }) => (
    <pre>{JSON.stringify(value, null, 2)}</pre>
  ),
}))

vi.mock('../../../api/settings', () => ({
  useTelemetryPreview: () => currentPreview,
  useTelemetryStatus: () => ({ data: currentStatus }),
  useUpdateTelemetrySetting: () => ({ mutateAsync: updateTelemetrySetting }),
}))

vi.mock('..', () => ({
  useSettingsOutletContext: () => ({ settings: currentSettings }),
}))

const ping: TelemetryPing = {
  version: '3.24.0',
  versionTag: 'latest',
  isDocker: true,
  nodeMajor: 26,
  arch: 'x64',
  platform: 'linux',
  mediaServer: 'plex',
  sample: {
    usage: {
      ruleGroups: '2-4',
      activeRuleGroups: '1',
      collections: '1',
      manualCollections: '0',
      exclusions: '5-9',
      notifications: '1',
      collectionItems: '500-2k',
    },
    rulesApps: ['plex', 'radarr'],
    ruleProperties: ['plex.seenBy', 'radarr.monitored'],
    mediaTypes: ['movie'],
    arrActions: ['UNMONITOR'],
    notificationAgents: ['discord'],
    integrations: ['radarr'],
    features: ['overlays'],
  },
}

describe('TelemetrySettings', () => {
  beforeEach(() => {
    updateTelemetrySetting.mockReset()
    updateTelemetrySetting.mockResolvedValue({ code: 1 })
    currentSettings = { telemetryEnabled: true }
    currentPreview = { data: ping, isLoading: false, isError: false }
    currentStatus = {
      forcedOff: false,
      nextSendAtWeekly: '2026-08-25T07:33:00.000Z',
      nextSendAtRich: '2026-09-22T07:33:00.000Z',
    }
  })

  const toggle = () =>
    screen.getByLabelText(/Send anonymous usage data/) as HTMLInputElement

  it('reflects the stored setting', () => {
    render(<TelemetrySettings />)

    expect(toggle().checked).toBe(true)
  })

  it('reflects the setting when telemetry is off', () => {
    currentSettings = { telemetryEnabled: false }

    render(<TelemetrySettings />)

    expect(toggle().checked).toBe(false)
  })

  it('shows on for an install that has not answered yet', () => {
    currentSettings = { telemetryEnabled: null }

    render(<TelemetrySettings />)

    expect(toggle().checked).toBe(true)
  })

  it('saves the new value and confirms it', async () => {
    render(<TelemetrySettings />)

    fireEvent.click(toggle())
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(updateTelemetrySetting).toHaveBeenCalledWith(false)
    })
    expect(await screen.findByText('Telemetry settings updated')).toBeTruthy()
  })

  it('reports a failed save', async () => {
    updateTelemetrySetting.mockRejectedValue(new Error('nope'))

    render(<TelemetrySettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(
      await screen.findByText('Telemetry settings could not be updated'),
    ).toBeTruthy()
  })

  /**
   * The preview is the verification mechanism, so it has to show the payload
   * whole rather than a summary a reader would have to trust.
   */
  it('shows the exact payload that would be sent, split by cadence', () => {
    const { container } = render(<TelemetrySettings />)

    const [weekly, sampled] = Array.from(container.querySelectorAll('pre'))
    const { sample, ...census } = ping

    expect(weekly?.textContent).toBe(JSON.stringify(census, null, 2))
    expect(sampled?.textContent).toBe(JSON.stringify(sample, null, 2))
    // Reassembled from what is on screen, so a field dropped by either panel
    // fails here rather than passing on a fixture identity.
    expect({
      ...JSON.parse(weekly!.textContent!),
      sample: JSON.parse(sampled!.textContent!),
    }).toEqual(ping)
  })

  it('links to the public collector source', () => {
    render(<TelemetrySettings />)

    expect(
      screen
        .getByRole('link', { name: 'Collector source code' })
        .getAttribute('href'),
    ).toBe(
      'https://github.com/Maintainerr/telemetry-collector/blob/development/README.md',
    )
  })

  /**
   * TELEMETRY=off decides the outcome on the server, so the control must not
   * invite a save that would change nothing.
   */
  it('disables the control when the environment overrides it', () => {
    currentStatus = {
      forcedOff: true,
      nextSendAtWeekly: null,
      nextSendAtRich: null,
    }

    render(<TelemetrySettings />)

    expect(toggle().disabled).toBe(true)
    expect(toggle().checked).toBe(false)
    expect(screen.getByRole('button', { name: 'Save Changes' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('shows the next run for each cadence', () => {
    render(<TelemetrySettings />)

    // Two panels, each captioned with its own next run.
    expect(screen.getAllByText(/^\(Next: /)).toHaveLength(2)
  })

  it('falls back to a message when the preview cannot be loaded', () => {
    currentPreview = { data: undefined, isLoading: false, isError: true }

    render(<TelemetrySettings />)

    // One message per panel: both boxes keep their place and both report the
    // failure, rather than the section collapsing and moving the controls.
    expect(
      screen.getAllByText('The preview could not be loaded.'),
    ).toHaveLength(2)
    expect(document.querySelector('pre')).toBeNull()
  })
})
