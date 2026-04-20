import { DocumentRemoveIcon, TrashIcon } from '@heroicons/react/solid'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { DeleteApiHandler, PostApiHandler } from '../../../../utils/ApiHandler'
import Button from '../../../Common/Button'
import Modal from '../../../Common/Modal'

interface IRemoveFromCollectionBtn {
  mediaServerId: number | string
  collectionId: number
  exclusionId?: number
  popup?: boolean
  onRemove: () => void
}
const RemoveFromCollectionBtn = (props: IRemoveFromCollectionBtn) => {
  const queryClient = useQueryClient()
  const [sure, setSure] = useState<boolean>(false)
  const [popup, setppopup] = useState<boolean>(false)
  const [removing, setRemoving] = useState<boolean>(false)
  const isCreatingExclusion = !props.exclusionId
  const actionLabel = isCreatingExclusion ? 'Exclude' : 'Remove'
  const confirmLabel = isCreatingExclusion ? 'Exclude?' : 'Remove?'
  const inProgressLabel = isCreatingExclusion ? 'Excluding...' : 'Removing...'

  const handlePopup = (e?: React.MouseEvent<HTMLElement>) => {
    e?.stopPropagation()
    if (props.popup) {
      setppopup(!popup)
    }
  }

  const handle = async (e?: React.MouseEvent<HTMLElement>) => {
    e?.stopPropagation()
    if (removing) return
    setRemoving(true)

    try {
      if (!props.exclusionId) {
        await Promise.all([
          DeleteApiHandler(
            `/collections/media?mediaId=${props.mediaServerId}&collectionId=${props.collectionId}`,
          ),
          PostApiHandler('/rules/exclusion', {
            collectionId: props.collectionId,
            mediaId: props.mediaServerId,
            action: 0,
          }),
        ])

        await queryClient.invalidateQueries({
          queryKey: ['calendar', 'collections', 'overlay-data'],
        })
      } else {
        await DeleteApiHandler(`/rules/exclusion/${props.exclusionId}`)
      }
      props.onRemove()
    } catch {
      setRemoving(false)
      setSure(false)
    }
  }

  return (
    <div className="w-full">
      {!sure ? (
        <Button
          buttonType="primary"
          buttonSize="md"
          className="mb-1 mt-2 h-6 w-full text-zinc-200 shadow-md"
          title={
            isCreatingExclusion ? 'Exclude from collection' : 'Remove exclusion'
          }
          onClick={(e) => {
            e.stopPropagation() // Stops the MediaModal from also showing when clicked.
            setSure(true)
          }}
        >
          {isCreatingExclusion ? (
            <DocumentRemoveIcon className="m-auto ml-3 h-3" />
          ) : (
            <TrashIcon className="m-auto ml-3 h-3" />
          )}{' '}
          <p className="rules-button-text m-auto mr-2">{actionLabel}</p>
        </Button>
      ) : (
        <Button
          buttonType="primary"
          buttonSize="md"
          className="mb-1 mt-2 h-6 w-full text-zinc-200 shadow-md"
          disabled={removing}
          onClick={(e) => {
            if (props.popup) {
              handlePopup(e)
            } else {
              handle(e)
            }
          }}
        >
          <p className="rules-button-text m-auto mr-2">
            {removing ? inProgressLabel : confirmLabel}
          </p>
        </Button>
      )}

      {popup ? (
        <Modal
          title="Warning"
          onCancel={handlePopup}
          footerActions={
            <Button
              buttonType="primary"
              className="ml-3"
              disabled={removing}
              onClick={handle}
            >
              {removing ? 'Removing...' : 'Ok'}
            </Button>
          }
        >
          <p>
            This item is excluded <b>globally</b>. Removing this exclusion will
            apply the change to all collections
          </p>
        </Modal>
      ) : undefined}
    </div>
  )
}
export default RemoveFromCollectionBtn
