import { Application, MediaType, RulePossibility } from '@maintainerr/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RuleInput from './index'

const useRuleConstantsMock = vi.fn()
const useRadarrDiskspaceMock = vi.fn()
const useSonarrDiskspaceMock = vi.fn()

vi.mock('../../../../../api/rules', () => ({
  useRuleConstants: () => useRuleConstantsMock(),
  useRadarrDiskspace: (...args: unknown[]) => useRadarrDiskspaceMock(...args),
  useSonarrDiskspace: (...args: unknown[]) => useSonarrDiskspaceMock(...args),
}))

vi.mock('../../../../../hooks/useMediaServerType', () => ({
  useMediaServerType: () => ({
    isPlex: true,
    isJellyfin: false,
  }),
}))

vi.mock('../../../../Common/LoadingSpinner', () => ({
  default: () => <div>loading</div>,
}))

const onCommit = vi.fn()
const onIncomplete = vi.fn()
const onDelete = vi.fn()

const listPropertyId = 101

const ruleConstants = {
  applications: [
    {
      id: Application.RADARR,
      name: 'Radarr',
      mediaType: MediaType.BOTH,
      props: [
        {
          id: listPropertyId,
          name: 'tags',
          humanName: '[list] Tags',
          mediaType: MediaType.BOTH,
          type: {
            key: '4',
            possibilities: [RulePossibility.NOT_EQUALS],
          },
        },
      ],
    },
  ],
}

describe('RuleInput', () => {
  beforeEach(() => {
    onCommit.mockReset()
    onIncomplete.mockReset()
    onDelete.mockReset()
    useRuleConstantsMock.mockReset()
    useRadarrDiskspaceMock.mockReset()
    useSonarrDiskspaceMock.mockReset()

    useRuleConstantsMock.mockReturnValue({
      data: ruleConstants,
      isLoading: false,
    })
    useRadarrDiskspaceMock.mockReturnValue({ data: [], isLoading: false })
    useSonarrDiskspaceMock.mockReturnValue({ data: [], isLoading: false })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the single and multiple value placeholder when entering a custom text value for a list rule', async () => {
    render(
      <RuleInput
        id={1}
        mediaType={MediaType.MOVIE}
        radarrSettingsId={1}
        onCommit={onCommit}
        onIncomplete={onIncomplete}
        onDelete={onDelete}
      />,
    )

    fireEvent.change(screen.getByLabelText('First Value'), {
      target: { value: JSON.stringify([Application.RADARR, listPropertyId]) },
    })
    fireEvent.change(screen.getByLabelText('Action'), {
      target: { value: String(RulePossibility.NOT_EQUALS) },
    })
    fireEvent.change(screen.getByLabelText('Second Value'), {
      target: { value: 'custom_text' },
    })

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Custom Value') as HTMLInputElement).placeholder,
      ).toBe('Value1 or ["Value1", "Value2"]')
    })
  })

  it('keeps the single and multiple value placeholder when reopening an existing list rule saved as custom text', async () => {
    render(
      <RuleInput
        id={1}
        mediaType={MediaType.MOVIE}
        radarrSettingsId={1}
        editData={{
          rule: {
            operator: null,
            firstVal: [String(Application.RADARR), String(listPropertyId)],
            action: RulePossibility.NOT_EQUALS,
            customVal: {
              ruleTypeId: 2,
              value: 'Tag A',
            },
            section: 0,
          },
        }}
        onCommit={onCommit}
        onIncomplete={onIncomplete}
        onDelete={onDelete}
      />,
    )

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Custom Value') as HTMLInputElement).placeholder,
      ).toBe('Value1 or ["Value1", "Value2"]')
    })
  })
})
