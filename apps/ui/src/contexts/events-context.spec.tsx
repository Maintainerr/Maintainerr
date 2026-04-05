import { MaintainerrEvent } from '@maintainerr/contracts'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventsProvider, useEvent } from './events-context'

const logClientErrorMock = vi.fn((..._args: [string, unknown, string]) =>
  Promise.resolve(undefined),
)
const consoleWarnMock = vi
  .spyOn(console, 'warn')
  .mockImplementation(() => undefined)

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

vi.mock('../utils/ClientLogger', () => ({
  logClientError: (message: string, error: unknown, context: string) =>
    logClientErrorMock(message, error, context),
}))

const EventConsumer = () => {
  useEvent(MaintainerrEvent.RuleHandler_Started)

  return <div />
}

describe('EventsProvider', () => {
  beforeEach(() => {
    logClientErrorMock.mockClear()
    consoleWarnMock.mockClear()
    latestEventSource = undefined
  })

  afterEach(() => {
    consoleWarnMock.mockClear()
  })

  it('warns on reconnect churn without forwarding it to server logs, while still reporting payload parsing failures', () => {
    render(
      <EventsProvider>
        <EventConsumer />
      </EventsProvider>,
    )

    latestEventSource?.onopen?.()
    latestEventSource?.onerror?.(new Error('stream unavailable'))
    latestEventSource?.onerror?.(new Error('stream unavailable'))

    expect(consoleWarnMock).toHaveBeenCalledTimes(1)
    expect(logClientErrorMock).not.toHaveBeenCalled()

    latestEventSource?.emit(MaintainerrEvent.RuleHandler_Started, 'not-json')

    expect(logClientErrorMock).toHaveBeenCalledTimes(1)
    expect(logClientErrorMock).toHaveBeenCalledWith(
      'Error parsing event stream data',
      expect.any(SyntaxError),
      `useEvent.${MaintainerrEvent.RuleHandler_Started}`,
    )
  })
})
