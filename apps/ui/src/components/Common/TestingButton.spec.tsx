import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TestingButton, { getTestingButtonType } from './TestingButton'

describe('TestingButton', () => {
  it('uses a danger button type after a failed test for standard buttons', () => {
    render(
      <TestingButton type="button" isPending={false} feedbackStatus={false} />,
    )

    expect(screen.getByRole('button').className).toContain('bg-red-600')
  })

  it('keeps twin button styling when showing an error result', () => {
    expect(getTestingButtonType('twin-secondary-l', false)).toBe(
      'twin-secondary-l',
    )
  })
})
