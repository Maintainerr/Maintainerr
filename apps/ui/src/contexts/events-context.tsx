import { MaintainerrEvent } from '@maintainerr/contracts'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import ReconnectingEventSource from 'reconnecting-eventsource'
import { API_BASE_PATH } from '../utils/ApiHandler'

const EventsContext = createContext<EventSource | undefined>(undefined)

export const EventsProvider = (props: any) => {
  const eventSource = useMemo(() => {
    const source = new ReconnectingEventSource(
      `${API_BASE_PATH}/api/events/stream`,
    )

    source.onerror = (e) => {
      console.error('EventSource failed:', e)
    }

    return source
  }, [])

  useEffect(() => {
    return () => {
      eventSource.close()
    }
  }, [eventSource])

  return <EventsContext.Provider value={eventSource} {...props} />
}

export const useEvent = <T,>(
  type: MaintainerrEvent,
  listener?: (event: T) => any,
) => {
  const context = useContext(EventsContext)
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
        console.error('Error parsing event data:', error)
      }
    }

    context.addEventListener(type, parserListener, options)

    return () => {
      context.removeEventListener(type, parserListener, options)
    }
  }, [context, type])

  return lastEvent
}
