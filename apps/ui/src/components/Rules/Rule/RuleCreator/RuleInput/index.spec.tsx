import { Application, MediaType, RulePossibility } from '@maintainerr/contracts'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../../../../../test-utils/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RuleInput from './index'

const useRuleConstantsMock = vi.fn()
const useRadarrDiskspaceMock = vi.fn()
const useSonarrDiskspaceMock = vi.fn()
const useRuleUsernamesMock = vi.fn()

vi.mock('../../../../../api/rules', () => ({
  useRuleConstants: () => useRuleConstantsMock(),
  useRadarrDiskspace: (...args: unknown[]) => useRadarrDiskspaceMock(...args),
  useSonarrDiskspace: (...args: unknown[]) => useSonarrDiskspaceMock(...args),
  useRuleUsernames: (...args: unknown[]) => useRuleUsernamesMock(...args),
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
const numberPropertyId = 102
const perUserPropertyId = 9

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
            possibilities: [RulePossibility.NOT_EQUALS, RulePossibility.EXISTS],
          },
        },
        {
          id: numberPropertyId,
          name: 'viewCount',
          humanName: 'Times viewed',
          mediaType: MediaType.BOTH,
          type: {
            key: '0',
            possibilities: [RulePossibility.BIGGER, RulePossibility.EXISTS],
          },
        },
      ],
    },
    {
      id: Application.TAUTULLI,
      name: 'Tautulli',
      mediaType: MediaType.BOTH,
      props: [
        {
          id: perUserPropertyId,
          name: 'viewCountByUser',
          humanName: 'Times viewed by user',
          mediaType: MediaType.BOTH,
          type: {
            key: '0',
            possibilities: [RulePossibility.BIGGER, RulePossibility.EXISTS],
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
    useRuleUsernamesMock.mockReset()
    useRuleUsernamesMock.mockReturnValue({
      data: ['alice', 'bob'],
      isLoading: false,
    })
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

  it('commits unary exists rules without a second value input', async () => {
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
      target: { value: String(RulePossibility.EXISTS) },
    })

    await waitFor(() => {
      expect(screen.queryByLabelText('Second Value')).toBeNull()
    })

    await waitFor(() => {
      const committedRule = onCommit.mock.calls.at(-1)?.[0]
      expect(committedRule).toMatchObject({
        firstVal: [Application.RADARR, listPropertyId],
        action: RulePossibility.EXISTS,
      })
      expect(committedRule.lastVal).toBeUndefined()
      expect(committedRule.customVal).toBeUndefined()
    })
  })

  it('does not commit a non-first rule until its operator is chosen', async () => {
    render(
      <RuleInput
        id={2}
        tagId={1}
        section={2}
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
      target: { value: String(RulePossibility.EXISTS) },
    })

    // First value and action are complete, but the (required) section operator
    // is still empty, so the rule must be reported incomplete, not committed.
    await waitFor(() => {
      expect(onIncomplete).toHaveBeenCalled()
    })
    expect(onCommit).not.toHaveBeenCalled()
  })

  describe('per-user properties', () => {
    const renderPerUserRule = () => {
      render(
        <RuleInput
          id={1}
          mediaType={MediaType.MOVIE}
          onCommit={onCommit}
          onIncomplete={onIncomplete}
          onDelete={onDelete}
        />,
      )

      fireEvent.change(screen.getByLabelText('First Value'), {
        target: {
          value: JSON.stringify([Application.TAUTULLI, perUserPropertyId]),
        },
      })
      fireEvent.change(screen.getByLabelText('Action'), {
        target: { value: String(RulePossibility.EXISTS) },
      })
    }

    it('asks for a user and reports the rule incomplete until one is picked', async () => {
      renderPerUserRule()

      expect(screen.getByLabelText('User')).toBeTruthy()
      await waitFor(() => {
        expect(onIncomplete).toHaveBeenCalled()
      })
      expect(onCommit).not.toHaveBeenCalled()
    })

    it('commits the picked user with the rule', async () => {
      renderPerUserRule()

      fireEvent.change(screen.getByLabelText('User'), {
        target: { value: 'alice' },
      })

      await waitFor(() => {
        expect(onCommit.mock.calls.at(-1)?.[0]).toMatchObject({
          firstVal: [Application.TAUTULLI, perUserPropertyId],
          username: 'alice',
        })
      })
    })

    // The field takes typed input, so a name the media server does not report
    // must not save a rule that would then skip every item.
    it('stays incomplete for a user the media server does not report', async () => {
      renderPerUserRule()

      fireEvent.change(screen.getByLabelText('User'), {
        target: { value: 'alicia' },
      })

      await waitFor(() => {
        expect(onIncomplete).toHaveBeenCalled()
      })
      expect(onCommit).not.toHaveBeenCalled()
    })

    it('keeps a saved user that the media server no longer reports', async () => {
      render(
        <RuleInput
          id={1}
          mediaType={MediaType.MOVIE}
          editData={{
            rule: {
              operator: null,
              firstVal: [Application.TAUTULLI, perUserPropertyId],
              action: RulePossibility.EXISTS,
              username: 'carol',
            } as never,
          }}
          onCommit={onCommit}
          onIncomplete={onIncomplete}
          onDelete={onDelete}
        />,
      )

      await waitFor(() => {
        expect(onCommit.mock.calls.at(-1)?.[0]).toMatchObject({
          username: 'carol',
        })
      })
    })

    // The rule's user applies to whichever side holds the property, so the
    // second value has to raise the field too.
    it('asks for a user when only the second value is scoped to one', () => {
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
        target: {
          value: JSON.stringify([Application.RADARR, numberPropertyId]),
        },
      })

      fireEvent.change(screen.getByLabelText('Action'), {
        target: { value: String(RulePossibility.BIGGER) },
      })

      expect(screen.queryByLabelText('User')).toBeNull()

      fireEvent.change(screen.getByLabelText('Second Value'), {
        target: {
          value: JSON.stringify([Application.TAUTULLI, perUserPropertyId]),
        },
      })

      expect(screen.getByLabelText('User')).toBeTruthy()
    })

    it('offers no user for a property that is not scoped to one', () => {
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

      expect(screen.queryByLabelText('User')).toBeNull()
    })
  })

  describe('application filtering', () => {
    // The rule builder must only offer an arr's properties when the collection
    // has a server of that arr selected; an entry for an unbound arr saves
    // into a hard validation failure on the server.
    const showConstants = {
      applications: [
        {
          id: Application.SONARR,
          name: 'Sonarr',
          mediaType: MediaType.SHOW,
          props: [
            {
              id: 0,
              name: 'addDate',
              humanName: 'Date added',
              mediaType: MediaType.SHOW,
              type: {
                key: '0',
                possibilities: [RulePossibility.EXISTS],
              },
            },
          ],
        },
        {
          id: Application.SPORTARR,
          name: 'Sportarr',
          mediaType: MediaType.SHOW,
          props: [
            {
              id: 0,
              name: 'addDate',
              humanName: 'Date added',
              mediaType: MediaType.SHOW,
              type: {
                key: '0',
                possibilities: [RulePossibility.EXISTS],
              },
            },
          ],
        },
      ],
    }

    const renderShowRuleInput = (settings: {
      sonarrSettingsId?: number | null
      sportarrSettingsId?: number | null
    }) => {
      useRuleConstantsMock.mockReturnValue({
        data: showConstants,
        isLoading: false,
      })
      return render(
        <RuleInput
          id={1}
          mediaType={MediaType.SHOW}
          dataType="show"
          sonarrSettingsId={settings.sonarrSettingsId}
          sportarrSettingsId={settings.sportarrSettingsId}
          onCommit={onCommit}
          onIncomplete={onIncomplete}
          onDelete={onDelete}
        />,
      )
    }

    it('hides Sportarr properties when no Sportarr server is selected', () => {
      renderShowRuleInput({ sonarrSettingsId: 1, sportarrSettingsId: null })

      expect(screen.getByText('Sonarr - Date added')).toBeDefined()
      expect(screen.queryByText('Sportarr - Date added')).toBeNull()
    })

    it('offers Sportarr and hides Sonarr for a Sportarr-managed collection', () => {
      renderShowRuleInput({ sonarrSettingsId: null, sportarrSettingsId: 1 })

      expect(screen.getByText('Sportarr - Date added')).toBeDefined()
      expect(screen.queryByText('Sonarr - Date added')).toBeNull()
    })
  })

  it('commits a non-first rule once an operator is selected', async () => {
    render(
      <RuleInput
        id={2}
        tagId={1}
        section={2}
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
      target: { value: String(RulePossibility.EXISTS) },
    })
    // "1" is the OR operator value emitted by the operator dropdown.
    fireEvent.change(screen.getByLabelText('Section Operator'), {
      target: { value: '1' },
    })

    await waitFor(() => {
      const committedRule = onCommit.mock.calls.at(-1)?.[0]
      expect(committedRule).toMatchObject({
        firstVal: [Application.RADARR, listPropertyId],
        action: RulePossibility.EXISTS,
        operator: '1',
      })
    })
  })
})
