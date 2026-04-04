import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import SaveButton, { SaveButtonContent } from './SaveButton'

describe('SaveButtonContent', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the default save label while idle', () => {
    render(<SaveButtonContent isPending={false} />)

    expect(screen.getAllByText('Save Changes')).toHaveLength(2)
  })

  it('renders the pending label while saving', () => {
    render(<SaveButtonContent isPending />)

    expect(screen.getByText('Saving...')).toBeTruthy()
  })
})

describe('SaveButton', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders an enabled save button by default', () => {
    render(<SaveButton isPending={false} />)

    expect(
      (
        screen.getByRole('button', {
          name: 'Save Changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('forwards the disabled state when requested by the parent form', () => {
    render(<SaveButton isPending={false} disabled />)

    expect(
      (
        screen.getByRole('button', {
          name: 'Save Changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
})
