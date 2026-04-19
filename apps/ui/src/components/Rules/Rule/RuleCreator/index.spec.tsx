import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RuleCreator, { type IRule } from './index'

vi.mock('react-movable', () => {
  const arrayMove = <T,>(array: T[], from: number, to: number) => {
    const next = [...array]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  }

  const List = ({ values, onChange, renderList, renderItem }: any) => {
    const scope = values[0] && 'rules' in values[0] ? 'section' : 'rule'
    const children = values.map((value: unknown, index: number) => {
      const item = renderItem({
        value,
        index,
        isDragged: false,
        isSelected: false,
        isDisabled: false,
        isOutOfBounds: false,
        props: {
          key: index,
          style: {},
          tabIndex: 0,
          ref: null,
          onKeyDown: undefined,
        },
      })

      return (
        <div key={`${scope}-${index}`}>
          {item}
          {index > 0 ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  oldIndex: index,
                  newIndex: index - 1,
                  targetRect: {} as DOMRect,
                })
              }
            >
              {`Move ${scope} ${index + 1} up`}
            </button>
          ) : null}
        </div>
      )
    })

    return renderList({ children, props: { ref: null }, isDragged: false })
  }

  return { List, arrayMove }
})

vi.mock('./RuleInput', () => ({
  default: ({
    tagId,
    section,
    editData,
    onCommit,
    onIncomplete,
    onDelete,
  }: any) => (
    <div>
      <span>
        {editData?.rule ? `Rule ${tagId} ready` : `Rule ${tagId} empty`}
      </span>
      <button
        type="button"
        onClick={() =>
          onCommit(0, {
            operator: null,
            firstVal: ['1', String(tagId)],
            action: 1,
            section: (section ?? 1) - 1,
          })
        }
      >
        {`Commit rule ${tagId}`}
      </button>
      <button type="button" onClick={() => onIncomplete(0)}>
        {`Mark rule ${tagId} incomplete`}
      </button>
      <button type="button" onClick={() => onDelete(0, 0)}>
        {`Delete rule ${tagId}`}
      </button>
    </div>
  ),
}))

const createRule = (
  id: string,
  section: number,
  operator: string | null,
): IRule => ({
  operator,
  firstVal: ['1', id],
  action: 1,
  section,
})

describe('RuleCreator', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('hides add actions while the only rule slot is incomplete', () => {
    render(
      <RuleCreator
        onUpdate={vi.fn()}
        onCancel={vi.fn()}
        editData={{ rules: [] }}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Add Rule' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New Section' })).toBeNull()
    expect(
      screen.getByText("Some incomplete rules won't be saved"),
    ).toBeTruthy()
  })

  it('rehides add actions when a committed rule becomes incomplete', async () => {
    render(
      <RuleCreator
        onUpdate={vi.fn()}
        onCancel={vi.fn()}
        editData={{ rules: [createRule('100', 0, null)] }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add Rule' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New Section' })).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Mark rule 1 incomplete' }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Add Rule' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'New Section' })).toBeNull()
    })
  })

  it('emits reordered rules within a section', async () => {
    const onUpdate = vi.fn()

    render(
      <RuleCreator
        onUpdate={onUpdate}
        onCancel={vi.fn()}
        editData={{
          rules: [createRule('101', 0, null), createRule('102', 0, '1')],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Move rule 2 up' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled()
      expect(onUpdate.mock.lastCall?.[0]).toMatchObject([
        { firstVal: ['1', '102'], section: 0, operator: null },
        { firstVal: ['1', '101'], section: 0 },
      ])
    })
  })

  it('emits reordered sections with renumbered section indexes', async () => {
    const onUpdate = vi.fn()

    render(
      <RuleCreator
        onUpdate={onUpdate}
        onCancel={vi.fn()}
        editData={{
          rules: [createRule('201', 0, null), createRule('202', 1, '0')],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Move section 2 up' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled()
      expect(onUpdate.mock.lastCall?.[0]).toMatchObject([
        { firstVal: ['1', '202'], section: 0, operator: null },
        { firstVal: ['1', '201'], section: 1 },
      ])
    })
  })
})
