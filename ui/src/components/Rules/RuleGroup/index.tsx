import {
  PencilIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from '@heroicons/react/solid'
import { EPlexDataType } from '@maintainerr/contracts'
import { isAxiosError } from 'axios'
import clsx from 'clsx'
import { useState } from 'react'
import { toast } from 'react-toastify'
import { usePlexLibraries } from '../../../api/plex'
import {
  useExecuteRuleGroup,
  useStopRuleGroupExecution,
} from '../../../api/rules'
import { useTaskStatusContext } from '../../../contexts/taskstatus-context'
import { DeleteApiHandler } from '../../../utils/ApiHandler'
import { ICollection } from '../../Collection'
import DeleteButton from '../../Common/DeleteButton'
import EditButton from '../../Common/EditButton'
import { AgentConfiguration } from '../../Settings/Notifications/CreateNotificationModal'
import { IRuleJson } from '../Rule'

export interface IRuleGroup {
  id: number
  name: string
  description: string
  libraryId: number
  isActive: boolean
  collectionId: number
  rules: IRuleJson[]
  useRules: boolean
  dataType: EPlexDataType
  notifications?: AgentConfiguration[]
  collection?: ICollection
  ruleHandlerCronSchedule?: string | null
}

const RuleGroup = (props: {
  group: IRuleGroup
  onDelete: () => void
  onEdit: (group: IRuleGroup) => void
}) => {
  const [showsureDelete, setShowSureDelete] = useState<boolean>(false)
  const { data: plexLibraries } = usePlexLibraries()
  const { queueStatus } = useTaskStatusContext()
  const { mutate: executeRules } = useExecuteRuleGroup({
    onError(error) {
      if (isAxiosError(error) && error.response?.data?.message) {
        toast.error(
          error.response?.data?.message || 'Failed to start rule execution.',
        )
      } else {
        toast.error('Failed to start rule execution.')
      }
    },
  })
  const { mutate: stopExecution } = useStopRuleGroupExecution({
    onSuccess() {
      toast.success('Requested to stop rule execution.')
    },
    onError() {
      toast.error('Failed to request stop of rule execution.')
    },
  })

  const onRemove = () => {
    setShowSureDelete(true)
  }

  const onEdit = () => {
    props.onEdit(props.group)
  }

  const confirmedDelete = () => {
    DeleteApiHandler(`/rules/${props.group.id}`)
      .then((resp) => {
        if (resp.code === 1) props.onDelete()
        else console.log('Error while deleting Rulegroup')
      })
      .catch((err) => {
        console.log(err)
      })
  }

  const isQueued = queueStatus?.queue.includes(props.group.id)
  const ruleExecutingOrQueued =
    queueStatus?.executingRuleGroupId === props.group.id || isQueued

  return (
    <>
      <div className="inset-0 z-0 h-fit p-3">
        <div className="flex justify-between gap-4">
          <div className="truncate text-base font-bold text-white sm:text-lg">
            {props.group.name}
          </div>
          <button
            type="button"
            className="text-zinc-400 hover:text-zinc-300"
            onClick={() =>
              ruleExecutingOrQueued
                ? stopExecution(props.group.id)
                : executeRules(props.group.id)
            }
            title={
              ruleExecutingOrQueued
                ? 'Request stop execution'
                : 'Start execution'
            }
            aria-label={
              ruleExecutingOrQueued
                ? 'Request stop execution'
                : 'Start execution'
            }
          >
            {!ruleExecutingOrQueued ? (
              <PlayIcon className="m-auto h-7" />
            ) : (
              <StopIcon
                className={clsx('m-auto h-7', {
                  'animate-pulse': !isQueued,
                })}
              />
            )}
          </button>
        </div>
        <div className="h-12 max-h-12 overflow-y-hidden text-zinc-400 hover:overflow-y-scroll">
          {props.group.description}
        </div>
      </div>
      <div className="inset-0 z-0 h-fit p-3">
        <div className="mb-5 mt-5 grid grid-cols-3 gap-3">
          <div>
            <div className="flex justify-center font-bold">Status</div>
            <div>
              {props.group.isActive ? (
                <span className="flex justify-center text-green-500">
                  Active
                </span>
              ) : (
                <span className="flex justify-center text-red-500">
                  Inactive
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="m-auto mr-2 flex justify-center font-bold">
              Library
            </div>
            <div className="flex justify-center text-amber-500">
              {`${
                plexLibraries?.find((el) => +el.key === +props.group.libraryId)
                  ?.title ?? ''
              }`}
            </div>
          </div>
          <div>
            <div className="m-auto mr-2 flex justify-center font-bold">
              Rules
            </div>
            <div className="flex justify-center text-amber-500">
              {props.group.rules.length}
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-1 xl:grid-cols-2">
          <div>
            <EditButton
              onClick={onEdit}
              text="Edit"
              svgIcon={<PencilIcon className="m-auto h-5 text-zinc-200" />}
            />
          </div>
          <div>
            {showsureDelete ? (
              <DeleteButton onClick={confirmedDelete} text="Are you sure?" />
            ) : (
              <DeleteButton
                onClick={onRemove}
                text="Delete"
                svgIcon={<TrashIcon className="m-auto h-5 text-zinc-200" />}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default RuleGroup
