import { Transition } from '@headlessui/react'
import {
  BaseEventDto,
  CollectionHandlerFinishedEventDto,
  CollectionHandlerProgressedEventDto,
  CollectionHandlerStartedEventDto,
  MaintainerrEvent,
  RuleHandlerFinishedEventDto,
  RuleHandlerProgressedEventDto,
  RuleHandlerStartedEventDto,
} from '@maintainerr/contracts'
import { useRef, useState } from 'react'
import { useEvent } from '../../contexts/events-context'
import { SmallLoadingSpinner } from '../Common/LoadingSpinner'

const isStartedOrFinishedEvent = (
  event: BaseEventDto,
): event is
  | CollectionHandlerStartedEventDto
  | CollectionHandlerFinishedEventDto
  | RuleHandlerStartedEventDto
  | RuleHandlerFinishedEventDto => {
  return (
    event.type == MaintainerrEvent.CollectionHandler_Started ||
    event.type == MaintainerrEvent.RuleHandler_Started ||
    event.type == MaintainerrEvent.CollectionHandler_Finished ||
    event.type == MaintainerrEvent.RuleHandler_Finished
  )
}

const isRuleHandlerProgressedEvent = (
  event: BaseEventDto,
): event is RuleHandlerProgressedEventDto => {
  return event.type == MaintainerrEvent.RuleHandler_Progressed
}

const isCollectionHandlerProgressedEvent = (
  event: BaseEventDto,
): event is CollectionHandlerProgressedEventDto => {
  return event.type == MaintainerrEvent.CollectionHandler_Progressed
}

const Messages = () => {
  return (
    <div className="flex flex-col gap-y-4">
      <RuleHandlerMessages />
      <CollectionHandlerMessages />
    </div>
  )
}

const RuleHandlerMessages = () => {
  const finishedTimer = useRef<NodeJS.Timeout>(undefined)
  const [show, setShow] = useState<boolean>(false)

  const [event, setEvent] = useState<
    | RuleHandlerStartedEventDto
    | RuleHandlerProgressedEventDto
    | RuleHandlerFinishedEventDto
  >()

  useEvent<RuleHandlerStartedEventDto>(
    MaintainerrEvent.RuleHandler_Started,
    (event) => {
      setEvent(event)
      setShow(true)
      clearTimeout(finishedTimer.current)
    },
  )

  useEvent<RuleHandlerProgressedEventDto>(
    MaintainerrEvent.RuleHandler_Progressed,
    (event) => {
      setEvent(event)
      setShow(true)
      clearTimeout(finishedTimer.current)
    },
  )

  useEvent<RuleHandlerFinishedEventDto>(
    MaintainerrEvent.RuleHandler_Finished,
    (event) => {
      setEvent(event)
      setShow(true)
      finishedTimer.current = setTimeout(() => setShow(false), 5000)
    },
  )

  return (
    <Transition
      as="div"
      show={show}
      className="transition duration-1000"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div
        className={
          'mx-2 flex flex-col rounded-lg bg-zinc-900 py-2 pl-2 pr-4 text-xs font-bold text-zinc-300 ring-1 ring-zinc-700'
        }
      >
        <div className="flex items-center gap-2">
          <div>
            <SmallLoadingSpinner className="m-auto h-4 px-0.5" />
          </div>
          {event && isStartedOrFinishedEvent(event) && <>{event.message}</>}
          {event &&
            isRuleHandlerProgressedEvent(event) &&
            event.processingRuleGroup && (
              <div>Processing: {event.processingRuleGroup.name}</div>
            )}
        </div>
        {event && isRuleHandlerProgressedEvent(event) && (
          <div className="ml-8 mt-2 bg-zinc-800">
            {event.totalRuleGroups > 1 && (
              <div
                className={`h-1.5 bg-amber-500 transition-width ease-in-out ${event.processingRuleGroup?.processedEvaluations === 0 ? 'duration-0' : 'duration-150'}`}
                style={{
                  width: `${(event.processingRuleGroup ? event.processingRuleGroup?.processedEvaluations / event.processingRuleGroup?.totalEvaluations : 0) * 100}%`,
                }}
              />
            )}
            <div
              className="h-1.5 bg-amber-700 transition-width duration-150 ease-in-out"
              style={{
                width: `${(event.processedEvaluations / event.totalEvaluations) * 100}%`,
              }}
            />
          </div>
        )}
      </div>
    </Transition>
  )
}

const CollectionHandlerMessages = () => {
  const finishedTimer = useRef<NodeJS.Timeout>(undefined)
  const [show, setShow] = useState<boolean>(false)

  const [event, setEvent] = useState<
    | CollectionHandlerStartedEventDto
    | CollectionHandlerProgressedEventDto
    | CollectionHandlerFinishedEventDto
  >()

  useEvent<CollectionHandlerStartedEventDto>(
    MaintainerrEvent.CollectionHandler_Started,
    (event) => {
      setEvent(event)
      setShow(true)
      clearTimeout(finishedTimer.current)
    },
  )

  useEvent<CollectionHandlerProgressedEventDto>(
    MaintainerrEvent.CollectionHandler_Progressed,
    (event) => {
      setEvent(event)
      setShow(true)
      clearTimeout(finishedTimer.current)
    },
  )

  useEvent<CollectionHandlerFinishedEventDto>(
    MaintainerrEvent.CollectionHandler_Finished,
    (event) => {
      setEvent(event)
      setShow(true)
      finishedTimer.current = setTimeout(() => setShow(false), 5000)
    },
  )

  return (
    <Transition
      as="div"
      show={show}
      className="mx-2 flex flex-col rounded-lg bg-zinc-900 py-2 pl-2 pr-4 text-xs font-bold text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800"
      enter="transition opacity-0 duration-1000"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition opacity-100 duration-1000"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div className="flex items-center gap-2">
        <div>
          <SmallLoadingSpinner className="m-auto h-4 px-0.5" />
        </div>
        {event && isStartedOrFinishedEvent(event) && <>{event.message}</>}
        {event &&
          isCollectionHandlerProgressedEvent(event) &&
          event.processingCollection && (
            <div>Processing: {event.processingCollection.name}</div>
          )}
      </div>
      {event && isCollectionHandlerProgressedEvent(event) && (
        <div className="ml-8 mt-2 bg-zinc-800">
          {event.totalCollections > 1 && (
            <div
              className={`h-1.5 bg-amber-500 transition-width ease-in-out ${event.processingCollection?.processedMedias === 0 ? 'duration-0' : 'duration-150'}`}
              style={{
                width: `${(event.processingCollection ? event.processingCollection?.processedMedias / event.processingCollection?.totalMedias : 0) * 100}%`,
              }}
            />
          )}
          <div
            className="h-1.5 bg-amber-700 transition-width duration-150 ease-in-out"
            style={{
              width: `${(event.processedMedias / event.totalMediaToHandle) * 100}%`,
            }}
          />
        </div>
      )}
    </Transition>
  )
}

export default Messages
