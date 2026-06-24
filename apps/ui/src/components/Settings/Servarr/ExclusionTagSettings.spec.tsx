import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISettings } from '../../../api/settings'
import ExclusionTagSettings from './ExclusionTagSettings'

const updateSettings = vi.fn()
let currentSettings: Partial<ISettings>

vi.mock('../../../api/settings', () => ({
  useSettings: () => ({ data: currentSettings }),
  usePatchSettings: () => ({
    mutateAsync: updateSettings,
    isPending: false,
  }),
}))

describe.each([
  {
    service: 'radarr' as const,
    name: 'Radarr',
    enabledKey: 'radarr_tag_exclusions' as const,
    tagKey: 'radarr_exclusion_tag' as const,
    untagKey: 'radarr_untag_on_unexclude' as const,
  },
  {
    service: 'sonarr' as const,
    name: 'Sonarr',
    enabledKey: 'sonarr_tag_exclusions' as const,
    tagKey: 'sonarr_exclusion_tag' as const,
    untagKey: 'sonarr_untag_on_unexclude' as const,
  },
])(
  'ExclusionTagSettings ($name)',
  ({ service, name, enabledKey, tagKey, untagKey }) => {
    beforeEach(() => {
      updateSettings.mockReset()
      updateSettings.mockResolvedValue({ status: 'OK', code: 1, message: 'ok' })
      currentSettings = {
        [enabledKey]: false,
        [tagKey]: 'dnd',
        [untagKey]: false,
      }
    })

    afterEach(() => {
      cleanup()
    })

    const enableToggle = () =>
      screen.getByLabelText(/Tag excluded content/i) as HTMLInputElement
    const labelInput = () =>
      screen.getByLabelText(/Tag label/i) as HTMLInputElement
    const untagToggle = () =>
      screen.getByLabelText(/Remove tag on un-exclude/i) as HTMLInputElement

    it(`names ${name} in the copy and never the other service`, () => {
      render(<ExclusionTagSettings service={service} />)
      const other = service === 'radarr' ? 'Sonarr' : 'Radarr'
      expect(document.body.textContent).toContain(name)
      expect(document.body.textContent).not.toContain(other)
    })

    it('disables the label and removal inputs until tagging is enabled', () => {
      render(<ExclusionTagSettings service={service} />)

      expect(enableToggle().checked).toBe(false)
      expect(labelInput().disabled).toBe(true)
      expect(untagToggle().disabled).toBe(true)
    })

    it('enables the dependent inputs once the toggle is on', () => {
      render(<ExclusionTagSettings service={service} />)

      fireEvent.click(enableToggle())

      expect(labelInput().disabled).toBe(false)
      expect(untagToggle().disabled).toBe(false)
    })

    it(`saves this service's settings fields`, async () => {
      render(<ExclusionTagSettings service={service} />)

      fireEvent.click(enableToggle())
      fireEvent.change(labelInput(), { target: { value: 'protected' } })
      fireEvent.click(untagToggle())
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(updateSettings).toHaveBeenCalledWith({
          [enabledKey]: true,
          [tagKey]: 'protected',
          [untagKey]: true,
        })
      })
    })

    it('blocks saving an empty label while enabled', async () => {
      render(<ExclusionTagSettings service={service} />)

      fireEvent.click(enableToggle())
      fireEvent.change(labelInput(), { target: { value: '   ' } })
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(screen.getByText(/tag label is required/i)).toBeTruthy()
      })
      expect(updateSettings).not.toHaveBeenCalled()
    })

    it('blocks saving a label outside the *arr tag charset', async () => {
      render(<ExclusionTagSettings service={service} />)

      fireEvent.click(enableToggle())
      // Uppercase + spaces are rejected by Radarr/Sonarr (^[a-z0-9-]+$).
      fireEvent.change(labelInput(), { target: { value: 'Do Not Delete' } })
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(screen.getByText(/is not a valid/i)).toBeTruthy()
      })
      expect(updateSettings).not.toHaveBeenCalled()
    })

    it('blocks a label the server would normalize away (hyphen-edge), so saved == applied', async () => {
      render(<ExclusionTagSettings service={service} />)

      fireEvent.click(enableToggle())
      // In charset, but the server collapses 'my--tag' -> 'my-tag' — reject up front.
      fireEvent.change(labelInput(), { target: { value: 'my--tag' } })
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(screen.getByText(/is not a valid/i)).toBeTruthy()
      })
      expect(updateSettings).not.toHaveBeenCalled()
    })
  },
)
