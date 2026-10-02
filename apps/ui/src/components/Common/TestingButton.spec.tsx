import { render, screen } from '../../test-utils/render'
import { describe, expect, it } from 'vitest'
import TestingButton from './TestingButton'

describe('TestingButton', () => {
  it('uses a danger button type after a failed test for standard buttons', () => {
    render(
      <TestingButton type="button" isPending={false} feedbackStatus={false} />,
    )

    expect(screen.getByRole('button').className).toContain('bg-error-600')
  })
})
