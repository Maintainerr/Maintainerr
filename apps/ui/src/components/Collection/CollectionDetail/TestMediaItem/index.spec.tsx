import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRuleGroupForCollection } from '../../../../api/rules'
import type { IRuleGroup } from '../../../Rules/RuleGroup'
import { createDeferred } from '../../../../test-utils/createDeferred'
import { buildQuerySuccessResult } from '../../../../test-utils/queryResults'
import { PostApiHandler } from '../../../../utils/ApiHandler'
import TestMediaItem from './index'

vi.mock('../../../../api/rules', () => ({
  useRuleGroupForCollection: vi.fn(),
}))

vi.mock('../../../../utils/ApiHandler', () => ({
  default: vi.fn(),
  PostApiHandler: vi.fn(),
}))

vi.mock('../../../Common/LazyMonacoEditor', () => ({
  default: () => <div data-testid="output-editor" />,
}))

vi.mock('../../../Common/SearchMediaITem', () => ({
  default: ({ onChange }: { onChange: (item: unknown) => void }) => (
    <button onClick={() => onChange({ id: 'movie-1' })}>pick media</button>
  ),
}))

const ruleGroup = {
  id: 1,
  dataType: 'movie',
  libraryId: 'library-1',
} as IRuleGroup

describe('TestMediaItem', () => {
  beforeEach(() => {
    vi.mocked(useRuleGroupForCollection).mockReturnValue(
      buildQuerySuccessResult(ruleGroup),
    )
    vi.mocked(PostApiHandler).mockReset()
  })

  it('locks the test button until the result arrives', async () => {
    const deferred = createDeferred<unknown>()
    vi.mocked(PostApiHandler).mockReturnValue(deferred.promise)

    render(
      <TestMediaItem collectionId={42} onCancel={vi.fn()} onSubmit={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('pick media'))
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    const pending = await screen.findByRole('button', { name: 'Testing...' })
    expect((pending as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(pending)
    expect(PostApiHandler).toHaveBeenCalledTimes(1)

    deferred.resolve({ code: 1, result: [] })

    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Test' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false)
    })
  })

  it('unlocks the test button when the request fails', async () => {
    vi.mocked(PostApiHandler).mockRejectedValue(new Error('boom'))

    render(
      <TestMediaItem collectionId={42} onCancel={vi.fn()} onSubmit={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('pick media'))
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Test' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false)
    })
  })
})
