import { TrashIcon } from '@heroicons/react/solid'
import { useState } from 'react'
import { DeleteApiHandler, PostApiHandler } from '../../../../utils/ApiHandler'
import Button from '../../../Common/Button'
import Modal from '../../../Common/Modal'

interface IRemoveFromCollectionBtn {
  plexId: number
  collectionId: number
  exclusionId?: number
  popup?: boolean
  onRemove: () => void
}
const RemoveFromCollectionBtn = (props: IRemoveFromCollectionBtn) => {
  const [sure, setSure] = useState<boolean>(false)
  const [popup, setppopup] = useState<boolean>(false)

  const handlePopup = (e?: React.MouseEvent<HTMLElement>) => {
    e?.stopPropagation()
    if (props.popup) {
      setppopup(!popup)
    }
  }

  const handle = (e?: React.MouseEvent<HTMLElement>) => {
    e?.stopPropagation()
    if (!props.exclusionId) {
      DeleteApiHandler(
        `/collections/media?mediaId=${props.plexId}&collectionId=${props.collectionId}`,
      )
      PostApiHandler('/rules/exclusion', {
        collectionId: props.collectionId,
        mediaId: props.plexId,
        action: 0,
      })
    } else {
      DeleteApiHandler(`/rules/exclusion/${props.exclusionId}`)
    }
    props.onRemove()
  }

  return (
    <div className="w-full">
      {!sure ? (
        <Button
          buttonType="primary"
          buttonSize="md"
          className="mb-1 mt-2 h-6 w-full text-zinc-200 shadow-md"
          onClick={(e) => {
            e.stopPropagation() // Stops the MediaModal from also showing when clicked.
            setSure(true)
          }}
        >
          {<TrashIcon className="m-auto ml-3 h-3" />}{' '}
          <p className="rules-button-text m-auto mr-2">{'Remove'}</p>
        </Button>
      ) : (
        <Button
          buttonType="primary"
          buttonSize="md"
          className="mb-1 mt-2 h-6 w-full text-zinc-200 shadow-md"
          onClick={(e) => {
            e.stopPropagation() // Stops the MediaModal from also showing when clicked.
            if (props.popup) {
              handlePopup()
            } else {
              handle()
            }
          }}
        >
          <p className="rules-button-text m-auto mr-2">{'Are you sure?'}</p>
        </Button>
      )}

      {popup ? (
        <Modal title="Warning" onOk={handle} onCancel={handlePopup}>
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
