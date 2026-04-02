import { SaveIcon } from '@heroicons/react/solid'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PendingButtonContent from './PendingButtonContent'

describe('PendingButtonContent', () => {
  afterEach(() => {
    cleanup()
  })

  it('reserves width for the pending label while idle', () => {
    const { container } = render(
      <PendingButtonContent
        idleLabel="Test Connection"
        pendingLabel="Test Connection"
        isPending={false}
      />,
    )

    expect(screen.getAllByText('Test Connection')).toHaveLength(2)
    expect(
      container.querySelector('[aria-hidden="true"]')?.textContent,
    ).toContain('Test Connection')
  })

  it('shows spinner and pending label while preserving icon space', () => {
    const { container } = render(
      <PendingButtonContent
        idleLabel="Save Changes"
        pendingLabel="Saving..."
        isPending
        idleIcon={<SaveIcon />}
        reserveLabel="Save Changes"
      />,
    )

    expect(screen.getByText('Saving...')).toBeTruthy()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('keeps the same label and shows a spinner in a fixed slot while pending', () => {
    const { container } = render(
      <PendingButtonContent
        idleLabel="Save Changes"
        pendingLabel="Save Changes"
        isPending
        idleIcon={<SaveIcon />}
      />,
    )

    expect(screen.getAllByText('Save Changes')).toHaveLength(2)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('uses tighter spacing and icon sizing in compact mode', () => {
    const { container } = render(
      <PendingButtonContent
        idleLabel="Save"
        pendingLabel="Saving"
        isPending={false}
        idleIcon={<SaveIcon />}
        contentSize="compact"
      />,
    )

    expect(container.querySelector('.gap-1')).toBeTruthy()
    expect(container.querySelector('.h-4.w-4')).toBeTruthy()
  })
})
