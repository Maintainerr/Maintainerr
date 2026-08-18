import { Trans, useLingui } from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { downloadDatabase } from '../../../api/settings'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import Modal from '../../Common/Modal'
import { Input } from '../../Forms/Input'
import {
  createDateStampedFilename,
  normalizeDatabaseFilename,
} from './databaseBackupUtils'

interface DatabaseBackupModalProps {
  onClose: () => void
  onDownloaded: () => void
}

const DatabaseBackupModal = ({
  onClose,
  onDownloaded,
}: DatabaseBackupModalProps) => {
  const { t } = useLingui()
  const filenameRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState(() => createDateStampedFilename())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const input = filenameRef.current
    if (input) {
      input.focus()
      const valueLength = input.value.length
      input.setSelectionRange(valueLength, valueLength)
    }
  }, [])

  const onDownload = async () => {
    const normalizedFilename = normalizeDatabaseFilename(filename)

    if (!normalizedFilename) {
      setError(t`Please provide a valid file name`)
      return
    }

    try {
      setError(null)
      await downloadDatabase(normalizedFilename)
      onDownloaded()
      onClose()
    } catch {
      setError(t`Could not backup the database`)
    }
  }

  return (
    <Modal
      title={t`Backup Database`}
      onCancel={onClose}
      backgroundClickable={false}
      size="md"
      footerActions={
        <Button
          buttonType="primary"
          className="ml-3"
          onClick={() => void onDownload()}
        >
          <Trans>Backup</Trans>
        </Button>
      }
    >
      <div className="space-y-2">
        <p>
          <Trans>Choose the filename for your database backup.</Trans>
        </p>
        {error && <Alert type="error" title={error} />}
        <div className="form-row mb-0!">
          <label htmlFor="database-filename" className="text-label">
            <Trans>File name</Trans>
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <Input
                ref={filenameRef}
                id="database-filename"
                name="database-filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void onDownload()
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default DatabaseBackupModal
