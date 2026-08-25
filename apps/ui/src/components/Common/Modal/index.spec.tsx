import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '../../../test-utils/render'
import Modal from '.'

describe('Modal', () => {
  it('closes with the shared footer button and nothing else', () => {
    const onCancel = vi.fn()

    render(
      <Modal title="Warning" onCancel={onCancel}>
        <p>body</p>
      </Modal>,
    )

    // One close control, in the footer - the top-right X is gone.
    const closes = screen.getAllByRole('button', { name: 'Cancel' })
    expect(closes).toHaveLength(1)

    fireEvent.click(closes[0])
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps the close reachable while loading, and holds back the actions', () => {
    const onCancel = vi.fn()

    render(
      <Modal
        title="Notification Agents"
        onCancel={onCancel}
        loading
        footerActions={<button type="button">OK</button>}
      >
        <p>body</p>
      </Modal>,
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'OK' })).toBe(null)
  })

  it('closes on Escape, unless the modal opted out of casual dismissal', () => {
    const dismissable = vi.fn()
    const { unmount } = render(
      <Modal title="Warning" onCancel={dismissable}>
        <p>body</p>
      </Modal>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dismissable).toHaveBeenCalledTimes(1)
    unmount()

    const guarded = vi.fn()
    render(
      <Modal title="Test Media" onCancel={guarded} backgroundClickable={false}>
        <p>body</p>
      </Modal>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(guarded).not.toHaveBeenCalled()
  })

  it('gives nested modals their own heading id and closes only the top one', () => {
    const outer = vi.fn()
    const inner = vi.fn()

    render(
      <Modal title="Add / Remove Media" onCancel={outer}>
        <Modal title="Confirm Global Exclusion" onCancel={inner}>
          <p>body</p>
        </Modal>
      </Modal>,
    )

    const [outerLabel, innerLabel] = screen
      .getAllByRole('dialog')
      .map((dialog) => dialog.getAttribute('aria-labelledby'))
    expect(outerLabel).not.toBe(innerLabel)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })
})
