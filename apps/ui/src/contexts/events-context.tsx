import { MaintainerrEvent } from '@maintainerr/contracts'
import { createContext, use, useEffect, useRef, useState } from 'react'
import ReconnectingEventSource from 'reconnecting-eventsource'
import { API_BASE_PATH } from '../utils/ApiHandler'
import { logClientError } from '../utils/ClientLogger'

const EventsContext = createContext<EventSource | undefined>(undefined)
EventsContext.displayName = 'EventsContext'

// One stream serves the whole app for as long as the page lives, so it is owned
// at module scope like the query client, not by a component. Two things follow
// from that, and both used to be broken: nothing can hand out a second
// connection, and nothing can close the only one there is -
// ReconnectingEventSource does not reconnect after close(), so a component
// lifecycle closing it left every consumer permanently deaf.
let sharedEventSource: EventSource | undefined
let hasConnectedOnce = false
let hasWarnedStreamError = false

const getEventSource = (): EventSource => {
  if (sharedEventSource) {
    return sharedEventSource
  }

  const source = new ReconnectingEventSource(
    `${API_BASE_PATH}/api/events/stream`,
  )

  source.onopen = () => {
    hasConnectedOnce = true
    hasWarnedStreamError = false
  }

  source.onerror = (error) => {
    if (!hasConnectedOnce || hasWarnedStreamError) {
      return
    }

    hasWarnedStreamError = true
    console.warn(
      'Event stream disconnected. Reconnecting automatically.',
      error,
    )
  }

  sharedEventSource = source
  return source
}

export const EventsProvider = (props: any) => (
  <EventsContext value={getEventSource()} {...props} />
)

export const useEvent = <T,>(
  type: MaintainerrEvent,
  listener?: (event: T) => any,
) => {
  const context = use(EventsContext)
  const listenerRef = useRef(listener)
  const [lastEvent, setLastEvent] = useState<T>()

  useEffect(() => {
    listenerRef.current = listener
  }, [listener])

  useEffect(() => {
    if (!context) return

    const options: AddEventListenerOptions = {
      passive: true,
    }

    const parserListener = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as T
        setLastEvent(parsed)
        listenerRef.current?.(parsed)
      } catch (error) {
        void logClientError(
          'Error parsing event stream data',
          error,
          `useEvent.${type}`,
        )
      }
    }

    context.addEventListener(type, parserListener, options)

    return () => {
      context.removeEventListener(type, parserListener, options)
    }
  }, [context, type])

  return lastEvent
}
