import { MaintainerrEvent } from '@maintainerr/contracts'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import ReconnectingEventSource from 'reconnecting-eventsource'

const EventsContext = createContext<EventSource | undefined>(undefined)

export const EventsProvider = (props: any) => {
  const [eventSource, setEventSource] = useState<EventSource>()

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH
    const es = new ReconnectingEventSource(`${basePath}/api/events/stream`)

    es.onerror = (e) => {
      console.error('EventSource failed:', e)
    }

    setEventSource(es)

    return () => {
      es.close()
    }
  }, [])

  return <EventsContext.Provider value={eventSource} {...props} />
}

export const useEvent = <T,>(
  type: MaintainerrEvent,
  listener: (event: T) => any,
) => {
  const context = useContext(EventsContext)
  const listenerRef = useRef(listener)

  useEffect(() => {
    listenerRef.current = listener
  })

  useEffect(() => {
    if (!context) return

    const options: AddEventListenerOptions = {
      passive: true,
    }

    const parserListener = (ev: MessageEvent) => {
      try {
        listenerRef.current(JSON.parse(ev.data))
      } catch (error) {
        console.error('Error parsing event data:', error)
      }
    }

    context.addEventListener(type, parserListener, options)

    return () => {
      context.removeEventListener(type, parserListener, options)
    }
  }, [context])
}
