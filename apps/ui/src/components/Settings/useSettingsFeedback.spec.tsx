import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { renderHook } from '../../test-utils/render'
import { useSettingsFeedback } from './useSettingsFeedback'

describe('useSettingsFeedback', () => {
  it('resolves updated feedback against the current messages, not the ones captured by the caller', () => {
    // The submit handler that calls showUpdated closes over a pre-switch
    // render. Changing the messages between renders stands in for a language
    // switch that happens before the handler fires.
    const { result, rerender } = renderHook(
      ({ updated }: { updated: string }) =>
        useSettingsFeedback({ updated, updateError: 'save failed' }),
      { initialProps: { updated: 'Settings updated' } },
    )

    const showUpdatedBeforeSwitch = result.current.showUpdated
    rerender({ updated: 'Inställningarna uppdaterades' })

    act(() => {
      showUpdatedBeforeSwitch()
    })

    expect(result.current.feedback).toEqual({
      type: 'success',
      title: 'Inställningarna uppdaterades',
    })

    // And a later message change re-resolves the stored feedback too.
    rerender({ updated: 'Configuración actualizada' })
    expect(result.current.feedback?.title).toBe('Configuración actualizada')
  })

  it('keeps literal titles for the dynamic show* callbacks', () => {
    const { result, rerender } = renderHook(
      ({ updated }: { updated: string }) =>
        useSettingsFeedback({ updated, updateError: 'save failed' }),
      { initialProps: { updated: 'Settings updated' } },
    )

    act(() => {
      result.current.showError('the server said no')
    })
    rerender({ updated: 'Inställningarna uppdaterades' })

    expect(result.current.feedback).toEqual({
      type: 'error',
      title: 'the server said no',
    })

    act(() => {
      result.current.clearError()
    })
    expect(result.current.feedback).toBeNull()
  })
})
