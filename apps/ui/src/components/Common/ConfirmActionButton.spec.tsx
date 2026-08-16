import { fireEvent, render, screen } from '../../test-utils/render'
import { describe, expect, it, vi } from 'vitest'
import { logClientError } from '../../utils/ClientLogger'
import ConfirmActionButton from './ConfirmActionButton'

vi.mock('../../utils/ClientLogger', () => ({
  logClientError: vi.fn(),
}))

const logClientErrorMock = vi.mocked(logClientError)

const renderButton = (
  onConfirm: () => Promise<void>,
  props?: { disabled?: boolean; confirmDisabled?: boolean },
) =>
  render(
    <ConfirmActionButton
      buttonLabel="Do it"
      buttonIcon={null}
      modalTitle="Are you sure?"
      confirmLabel="Confirm"
      pendingLabel="Working..."
      errorMessage="Den handlingen mislyktes."
      errorLogSummary="The action failed"
      errorContext="spec"
      onConfirm={onConfirm}
      {...props}
    >
      <p>Body copy</p>
    </ConfirmActionButton>,
  )

const openDialog = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Do it' }))

describe('ConfirmActionButton', () => {
  it('runs the action and closes the dialog once it resolves', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    renderButton(onConfirm)
    openDialog()
    expect(screen.getByText('Body copy')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await vi.waitFor(() => {
      expect(screen.queryByText('Are you sure?')).toBeNull()
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('keeps the dialog open and reports the failure when the action throws', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('nope'))

    renderButton(onConfirm)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('nope')).toBeTruthy()
    expect(screen.getByText('Are you sure?')).toBeTruthy()
  })

  it('logs the English summary, never the translated message shown on screen', async () => {
    logClientErrorMock.mockClear()
    const onConfirm = vi.fn().mockRejectedValue(new Error('nope'))

    renderButton(onConfirm)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await vi.waitFor(() => {
      expect(logClientErrorMock).toHaveBeenCalledTimes(1)
    })
    // A server log line is read by whoever is debugging the install, so it
    // must not follow the reader's language.
    expect(logClientErrorMock.mock.calls[0][0]).toBe('The action failed')
    expect(logClientErrorMock.mock.calls[0][0]).not.toBe(
      'Den handlingen mislyktes.',
    )
  })

  it('drops a previous failure when the dialog is cancelled and reopened', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('nope'))

    renderButton(onConfirm)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText('nope')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    openDialog()

    expect(screen.queryByText('nope')).toBeNull()
  })

  it('does not run a disabled action', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    renderButton(onConfirm, { confirmDisabled: true })
    openDialog()
    const confirm = screen.getByRole('button', { name: 'Confirm' })

    expect(confirm.hasAttribute('disabled')).toBe(true)
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not open the dialog when the action button is disabled', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    renderButton(onConfirm, { disabled: true })
    const button = screen.getByRole('button', { name: 'Do it' })

    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    expect(screen.queryByText('Are you sure?')).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows the pending label while the action is in flight', async () => {
    let resolveAction!: () => void
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve
        }),
    )

    renderButton(onConfirm)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    // PendingButtonContent also renders an invisible copy of the label to
    // reserve the button's width, so both spans carry the pending text.
    const confirm = await screen.findByRole('button', { name: /Working\.\.\./ })
    expect(confirm.hasAttribute('disabled')).toBe(true)

    resolveAction()
    await vi.waitFor(() => {
      expect(screen.queryByText('Are you sure?')).toBeNull()
    })
  })
})
