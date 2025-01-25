import EditButton from '../../Common/EditButton'
import DeleteButton from '../../Common/DeleteButton'
import { IRuleJson } from '../Rule'
import { useContext, useState } from 'react'
import { DeleteApiHandler } from '../../../utils/ApiHandler'
import LibrariesContext from '../../../contexts/libraries-context'
import { PencilIcon, TrashIcon } from '@heroicons/react/solid'

export interface IRuleGroup {
  id: number
  name: string
  description: string
  libraryId: number
  isActive: boolean
  collectionId: number
  rules: IRuleJson[]
  useRules: boolean
  type?: number
  listExclusions?: boolean
}

const RuleGroup = (props: {
  group: IRuleGroup
  onDelete: () => void
  onEdit: (group: IRuleGroup) => void
}) => {
  const [showsureDelete, setShowSureDelete] = useState<boolean>(false)
  const LibrariesCtx = useContext(LibrariesContext)

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

  return (
    <>
      <div className="inset-0 z-0 h-fit p-3">
        <div className="overflow-hidden overflow-ellipsis whitespace-nowrap text-base font-bold text-white sm:text-lg">
          <div>{props.group.name}</div>
        </div>
        <div className="h-12 max-h-12 overflow-y-hidden whitespace-normal text-base text-zinc-400 hover:overflow-y-scroll">
          {props.group.description}
        </div>
      </div>
      <div className="inset-0 z-0 h-fit p-3">
        <div className="mb-5 mt-5 grid grid-cols-3 gap-3">
          <div>
            <div className="align-center flex justify-center font-bold">
              Status
            </div>
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
                LibrariesCtx.libraries.find(
                  (el) => +el.key === +props.group.libraryId,
                )?.title ?? ''
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
