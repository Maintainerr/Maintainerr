import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOG_STREAM_ERROR_DELAY_MS, Logs } from './index'

const logClientErrorMock = vi.fn((..._args: [string, unknown, string]) =>
  Promise.resolve(undefined),
)

class MockReconnectingEventSource {
  onopen?: () => void
  onerror?: (error: unknown) => void
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  close = vi.fn()

  constructor(public readonly url: string) {}

  addEventListener = vi.fn(
    (type: string, listener: (event: MessageEvent) => void) => {
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add(listener)
      this.listeners.set(type, listeners)
    },
  )

  removeEventListener = vi.fn(
    (type: string, listener: (event: MessageEvent) => void) => {
      this.listeners.get(type)?.delete(listener)
    },
  )

  emit(type: string, data: string) {
    const event = { data } as MessageEvent

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

let latestEventSource: MockReconnectingEventSource | undefined

vi.mock('reconnecting-eventsource', () => ({
  default: class {
    onopen?: () => void
    onerror?: (error: unknown) => void
    addEventListener: MockReconnectingEventSource['addEventListener']
    removeEventListener: MockReconnectingEventSource['removeEventListener']
    close: MockReconnectingEventSource['close']

    constructor(url: string) {
      latestEventSource = new MockReconnectingEventSource(url)
      this.onopen = latestEventSource.onopen
      this.onerror = latestEventSource.onerror
      this.addEventListener = latestEventSource.addEventListener
      this.removeEventListener = latestEventSource.removeEventListener
      this.close = latestEventSource.close
      return latestEventSource
    }
  },
}))

vi.mock('../../../utils/ClientLogger', () => ({
  logClientError: (message: string, error: unknown, context: string) =>
    logClientErrorMock(message, error, context),
}))

describe('Logs stream reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    logClientErrorMock.mockClear()
    latestEventSource = undefined
  })

  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('does not report a transient disconnect that recovers before the delay elapses', async () => {
    render(<Logs />)

    latestEventSource?.onerror?.(new Error('stream unavailable'))

    await act(async () => {
      vi.advanceTimersByTime(LOG_STREAM_ERROR_DELAY_MS - 1)
    })

    expect(logClientErrorMock).not.toHaveBeenCalled()

    latestEventSource?.onopen?.()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(logClientErrorMock).not.toHaveBeenCalled()
  })

  it('reports a sustained disconnect once after the delay elapses', async () => {
    render(<Logs />)

    const error = new Error('stream unavailable')
    latestEventSource?.onerror?.(error)
    latestEventSource?.onerror?.(new Error('still unavailable'))

    await act(async () => {
      vi.advanceTimersByTime(LOG_STREAM_ERROR_DELAY_MS)
    })

    expect(logClientErrorMock).toHaveBeenCalledTimes(1)
    expect(logClientErrorMock).toHaveBeenCalledWith(
      'Log stream connection failed',
      new Error('still unavailable'),
      'Settings.Logs.stream',
    )
  })
})
