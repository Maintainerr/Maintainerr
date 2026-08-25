import { Trans, useLingui } from '@lingui/react/macro'
import { ICollection } from '../../Collection'
import Modal from '../../Common/Modal'

interface ServerInUseModalProps {
  collections: ICollection[]
  onClose: () => void
}

/**
 * Refuses a Servarr server deletion while rule groups still point at it.
 * Shared by the Radarr, Sonarr and Sportarr settings pages, which get the
 * same list back from their delete endpoint.
 */
const ServerInUseModal = ({ collections, onClose }: ServerInUseModalProps) => {
  const { t } = useLingui()

  return (
    <Modal
      title={t`Server in-use`}
      size="sm"
      onCancel={onClose}
      cancelText={t`Ok`}
      cancelButtonType="primary"
    >
      <p>
        <Trans>
          This server is currently being used by the following rules:
        </Trans>
      </p>
      <ul className="mb-4 list-inside list-disc">
        {collections.map((collection) => (
          <li key={collection.id}>{collection.title}</li>
        ))}
      </ul>
      <p>
        <Trans>
          You must re-assign these rules to a different server before deleting.
        </Trans>
      </p>
    </Modal>
  )
}

export default ServerInUseModal
