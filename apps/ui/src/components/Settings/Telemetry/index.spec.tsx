import { TelemetryPing } from '@maintainerr/contracts'
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

vi.mock('../../../api/settings', () => ({
  useTelemetryPreview: () => currentPreview,
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
    locale: 'en',
    usage: {
      ruleGroups: '2-4',
      activeRuleGroups: '1',
      collections: '1',
      manualCollections: '0',
      exclusions: '5-9',
      notifications: '1',
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
  it('shows the exact payload that would be sent', () => {
    const { container } = render(<TelemetrySettings />)

    const block = container.querySelector('pre')
    expect(block?.textContent).toBe(JSON.stringify(ping, null, 2))
  })

  it('links to the public collector source and its published numbers', () => {
    render(<TelemetrySettings />)

    expect(
      screen.getByRole('link', { name: 'source code' }).getAttribute('href'),
    ).toBe('https://github.com/Maintainerr/telemetry-collector')
    expect(
      screen
        .getByRole('link', { name: 'every number it publishes' })
        .getAttribute('href'),
    ).toBe('https://telemetry.maintainerr.info/')
  })

  it('falls back to a message when the preview cannot be loaded', () => {
    currentPreview = { data: undefined, isLoading: false, isError: true }

    render(<TelemetrySettings />)

    expect(screen.getByText('The preview could not be loaded.')).toBeTruthy()
    expect(document.querySelector('pre')).toBeNull()
  })
})
