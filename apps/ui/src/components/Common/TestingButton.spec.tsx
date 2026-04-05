import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TestingButton, { getTestingButtonType } from './TestingButton'

describe('TestingButton', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps the committed success test button styling after a successful test', () => {
    render(
      <TestingButton type="button" isPending={false} feedbackStatus={true} />,
    )

    expect(screen.getByRole('button').className).toContain('bg-maintainerrdark')
  })

  it('uses a danger button type after a failed test for standard buttons', () => {
    render(
      <TestingButton type="button" isPending={false} feedbackStatus={false} />,
    )

    expect(screen.getByRole('button').className).toContain('bg-error-600')
  })

  it('keeps twin button styling when showing an error result', () => {
    expect(getTestingButtonType('twin-secondary-l', false)).toBe(
      'twin-secondary-l',
    )
  })
})
