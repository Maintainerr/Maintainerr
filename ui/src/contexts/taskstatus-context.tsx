import {
  CollectionHandlerFinishedEventDto,
  CollectionHandlerStartedEventDto,
  MaintainerrEvent,
  RuleExecuteStatusDto,
  RuleHandlerFinishedEventDto,
  RuleHandlerStartedEventDto,
  TaskStatusDto,
} from '@maintainerr/contracts'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import GetApiHandler from '../utils/ApiHandler'
import { useEvent } from './events-context'

export interface TaskStatusState {
  ruleHandlerRunning?: TaskStatusDto
  collectionHandlerRunning?: TaskStatusDto
}

export const TaskStatusContext = createContext<TaskStatusState | undefined>(
  undefined,
)

export const TaskStatusProvider = (props: any) => {
  const [ruleHandlerRunning, setRuleHandlerRunning] = useState<TaskStatusDto>()
  const [collectionHandlerRunning, setCollectionHandlerRunning] =
    useState<TaskStatusDto>()

  // Rule handler
  const ruleHandlerStatusQuery = useQuery({
    queryKey: ['rules', 'execute', 'status'],
    queryFn: async () => {
      return await GetApiHandler<RuleExecuteStatusDto>('/rules/execute/status')
    },
  })

  const updateRuleExecutorRunning = (value: boolean, date: Date) => {
    setRuleHandlerRunning((prev) => {
      if (prev?.time && prev?.time > date) {
        return prev
      } else {
        return {
          time: date,
          running: value,
        }
      }
    })
  }

  useEvent<RuleHandlerStartedEventDto>(
    MaintainerrEvent.RuleHandler_Started,
    (event) => {
      updateRuleExecutorRunning(true, event.time)
    },
  )

  useEvent<RuleHandlerFinishedEventDto>(
    MaintainerrEvent.RuleHandler_Finished,
    (event) => {
      updateRuleExecutorRunning(false, event.time)
    },
  )

  useEffect(() => {
    if (ruleHandlerStatusQuery.data) {
      updateRuleExecutorRunning(
        ruleHandlerStatusQuery.data.processingQueue,
        new Date(),
      )
    }
  }, [ruleHandlerStatusQuery.data])

  // Collection handler
  const collectionHandlerStatusQuery = useQuery({
    queryKey: ['taskstatus_collectionhandler'],
    queryFn: async () => {
      return await GetApiHandler<TaskStatusDto>(
        '/tasks/Collection Handler/status',
      )
    },
  })

  const updateCollectionExecutorRunning = (value: boolean, date: Date) => {
    setCollectionHandlerRunning((prev) => {
      if (prev?.time && prev?.time > date) {
        return prev
      } else {
        return {
          time: date,
          running: value,
        }
      }
    })
  }

  useEvent<CollectionHandlerStartedEventDto>(
    MaintainerrEvent.CollectionHandler_Started,
    (event) => {
      updateCollectionExecutorRunning(true, event.time)
    },
  )

  useEvent<CollectionHandlerFinishedEventDto>(
    MaintainerrEvent.CollectionHandler_Finished,
    (event) => {
      updateCollectionExecutorRunning(false, event.time)
    },
  )

  useEffect(() => {
    if (collectionHandlerStatusQuery.data) {
      updateCollectionExecutorRunning(
        collectionHandlerStatusQuery.data.running,
        collectionHandlerStatusQuery.data.time,
      )
    }
  }, [collectionHandlerStatusQuery.data])

  const contextValue = useMemo(() => {
    return {
      ruleHandlerRunning,
      collectionHandlerRunning,
    } satisfies TaskStatusState
  }, [ruleHandlerRunning, collectionHandlerRunning])

  return <TaskStatusContext.Provider value={contextValue} {...props} />
}

export type TaskStatusContext = {
  ruleHandlerRunning?: boolean
  collectionHandlerRunning?: boolean
}

export const useTaskStatusContext = (): TaskStatusContext => {
  const context = useContext(TaskStatusContext)

  if (!context) {
    throw new Error(
      'useTaskStatusContext must be used within a TaskStatusProvider',
    )
  }

  return {
    ruleHandlerRunning: context.ruleHandlerRunning?.running,
    collectionHandlerRunning: context.collectionHandlerRunning?.running,
  }
}
