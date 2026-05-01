import { RefreshIcon } from '@heroicons/react/solid'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { processCollectionOverlays } from '../../../../api/overlays'
import { getApiErrorMessage } from '../../../../utils/ApiError'
import { logClientError } from '../../../../utils/ClientLogger'
import Alert from '../../../Common/Alert'
import Button from '../../../Common/Button'
import Modal from '../../../Common/Modal'
import PendingButton from '../../../Common/PendingButton'
import type { ICollection } from '../../index'

interface ReapplyOverlaysButtonProps {
  collection: ICollection
  buttonLabel?: string
}

const ReapplyOverlaysButton = ({
  collection,
  buttonLabel = 'Reapply This Collection',
}: ReapplyOverlaysButtonProps) => {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [success, setSuccess] = useState<string | undefined>()

  if (!collection.id || !collection.overlayEnabled) {
    return null
  }

  const collectionId = collection.id

  const handleReapply = async () => {
    if (executing) {
      return
    }

    setExecuting(true)
    setError(undefined)
    setSuccess(undefined)

    try {
      const result = await processCollectionOverlays(collectionId, {
        force: true,
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['collections'] }),
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['overlay-data'] }),
      ])

      setSuccess(
        `Processed: ${result.processed}, Reverted: ${result.reverted}, Errors: ${result.errors}`,
      )
    } catch (error) {
      void logClientError(
        'Failed to reapply overlays for this collection.',
        error,
        'ReapplyOverlaysButton.handleReapply',
      )

      setError(
        getApiErrorMessage(
          error,
          'Failed to reapply overlays for this collection.',
        ),
      )
    } finally {
      setExecuting(false)
    }
  }

  return (
    <>
      <Button buttonType="primary" onClick={() => setConfirmOpen(true)}>
        <RefreshIcon className="mr-2 h-4 w-4" />
        {buttonLabel}
      </Button>

      {confirmOpen ? (
        <Modal
          title="Reapply Collection Overlays"
          onCancel={() => {
            if (!executing) {
              setConfirmOpen(false)
              setError(undefined)
              setSuccess(undefined)
            }
          }}
          backgroundClickable={!executing}
          footerActions={
            success ? (
              <Button
                buttonType="primary"
                className="ml-3"
                onClick={() => {
                  setConfirmOpen(false)
                  setError(undefined)
                  setSuccess(undefined)
                }}
              >
                Close
              </Button>
            ) : (
              <PendingButton
                buttonType="primary"
                className="ml-3"
                disabled={executing}
                isPending={executing}
                idleLabel="Reapply now"
                pendingLabel="Reapplying..."
                onClick={() => {
                  void handleReapply()
                }}
              />
            )
          }
        >
          <p>
            This will rebuild overlays for only this collection using the
            current overlay template configuration.
          </p>
          <p className="mt-3">
            This is the collection-scoped version of Reapply All. It does not
            restore originals and it will not process unrelated collections.
          </p>
          {success ? (
            <div className="mt-3">
              <Alert type="success" title={success} />
            </div>
          ) : null}
          {error ? (
            <div className="mt-3">
              <Alert type="error" title={error} />
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  )
}

export default ReapplyOverlaysButton
