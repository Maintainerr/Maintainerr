import { ArrowNarrowRightIcon, CheckCircleIcon } from '@heroicons/react/solid'
import {
  MediaServerSwitchPreview,
  MediaServerType,
} from '@maintainerr/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  usePreviewMediaServerSwitch,
  useSwitchMediaServer,
} from '../../../api/settings'
import Modal from '../../Common/Modal'

interface MediaServerSelectorProps {
  currentType: MediaServerType | null
  onSwitch?: () => void
}

const basePath = import.meta.env.VITE_BASE_PATH ?? ''

const serverOptions: {
  value: MediaServerType
  name: string
  description: string
  icon: string
}[] = [
  {
    value: MediaServerType.PLEX,
    name: 'Plex',
    description: 'Plex Media Server',
    icon: `${basePath}/icons_logos/plex_logo.svg`,
  },
  {
    value: MediaServerType.JELLYFIN,
    name: 'Jellyfin',
    description: 'Jellyfin Media Server',
    icon: `${basePath}/icons_logos/jellyfin.svg`,
  },
]

const MediaServerSelector = ({
  currentType,
  onSwitch,
}: MediaServerSelectorProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingType, setPendingType] = useState<MediaServerType | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [migrateRules, setMigrateRules] = useState(true)
  const [isSwitchComplete, setIsSwitchComplete] = useState(false)

  const { mutateAsync: previewSwitch, isPending: isPreviewPending } =
    usePreviewMediaServerSwitch()
  const { mutateAsync: switchServer, isPending: isSwitchPending } =
    useSwitchMediaServer()

  const [previewData, setPreviewData] =
    useState<MediaServerSwitchPreview | null>(null)

  const handleServerClick = async (type: MediaServerType) => {
    if (type === currentType) return

    setPendingType(type)

    // If no current type is set (initial setup), skip preview and just set the type
    if (!currentType) {
      try {
        await switchServer({
          targetServerType: type,
        })
        toast.success(
          `Selected ${type === MediaServerType.PLEX ? 'Plex' : 'Jellyfin'} as your media server`,
        )

        // Wait for settings to refetch before navigating
        await queryClient.invalidateQueries({ queryKey: ['settings'] })
        // Wait for the queries to actually refetch
        await queryClient.refetchQueries({ queryKey: ['settings'] })

        onSwitch?.()
        setPendingType(null)
        // Navigate to the new media server's settings page
        navigate(`/settings/${type}`, { replace: true })
      } catch (err) {
        console.error('Failed to set media server:', err)
        toast.error('Failed to set media server')
        setPendingType(null)
      }
      return
    }

    // For switching (when currentType exists), show preview modal
    try {
      const preview = await previewSwitch(type)
      setPreviewData(preview)
      setShowConfirmModal(true)
    } catch (err) {
      toast.error('Failed to preview switch')
      setPendingType(null)
    }
  }

  const handleConfirmSwitch = async () => {
    if (!pendingType) return

    try {
      await switchServer({
        targetServerType: pendingType,
        migrateRules,
      })

      setIsSwitchComplete(true)

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to switch media server'
      toast.error(message)
    }
  }

  const handleFinish = () => {
    setShowConfirmModal(false)
    onSwitch?.()
    const type = pendingType
    setPendingType(null)
    setIsSwitchComplete(false)
    navigate(`/settings/${type}`)
  }

  const handleCancelSwitch = () => {
    setShowConfirmModal(false)
    setPendingType(null)
    setPreviewData(null)
    setMigrateRules(true)
    setIsSwitchComplete(false)
  }

  const hasDataToDelete =
    previewData?.dataToBeCleared &&
    (previewData.dataToBeCleared.collections > 0 ||
      previewData.dataToBeCleared.collectionMedia > 0 ||
      previewData.dataToBeCleared.exclusions > 0 ||
      previewData.dataToBeCleared.collectionLogs > 0)

  const hasRulesToMigrate =
    previewData?.ruleMigration && previewData.ruleMigration.totalRules > 0

  return (
    <>
      <div className="section">
        <h3 className="heading">Media Server</h3>
        <p className="description">
          {currentType
            ? 'Select your media server type. Switching will reset media server-specific data.'
            : 'Select your media server to get started with Maintainerr.'}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {serverOptions.map((option) => {
            const isSelected = currentType === option.value
            const isPending =
              (isPreviewPending || isSwitchPending) &&
              pendingType === option.value

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleServerClick(option.value)}
                disabled={isPreviewPending || isSwitchPending}
                className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                } ${(isPreviewPending || isSwitchPending) && !isPending ? 'opacity-50' : ''}`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center">
                    <img
                      src={option.icon}
                      alt={option.name}
                      className="h-10 w-10 rounded"
                    />
                    <div className="ml-4 text-left">
                      <p className="font-medium text-zinc-100">{option.name}</p>
                      <p className="text-sm text-zinc-400">
                        {option.description}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="shrink-0 text-amber-500">
                      <CheckCircleIcon className="h-6 w-6" />
                    </div>
                  )}
                  {isPending && (
                    <div className="shrink-0">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-amber-500" />
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <Modal
          onCancel={isSwitchComplete ? undefined : handleCancelSwitch}
          onOk={isSwitchComplete ? handleFinish : handleConfirmSwitch}
          okText={
            isSwitchComplete
              ? 'Done'
              : isSwitchPending
                ? 'Switching...'
                : 'Switch'
          }
          okButtonType={isSwitchComplete ? 'primary' : 'danger'}
          okDisabled={isSwitchPending && !isSwitchComplete}
          cancelText={isSwitchComplete ? undefined : 'Cancel'}
          loading={isSwitchPending}
        >
          <div className="text-zinc-100">
            <div className="mb-6 flex items-start justify-center space-x-8">
              {!isSwitchComplete && (
                <>
                  <div className="flex flex-col items-center">
                    <div className="flex items-center justify-center">
                      <img
                        src={
                          serverOptions.find((o) => o.value === currentType)
                            ?.icon
                        }
                        alt={
                          currentType === MediaServerType.PLEX
                            ? 'Plex'
                            : 'Jellyfin'
                        }
                        className="h-16 w-auto object-contain"
                      />
                    </div>
                    <span className="mt-2 text-sm font-medium text-zinc-400">
                      {currentType === MediaServerType.PLEX
                        ? 'Plex'
                        : 'Jellyfin'}
                    </span>
                  </div>

                  <div className="flex h-16 items-center">
                    <ArrowNarrowRightIcon className="h-8 w-8 text-zinc-500" />
                  </div>
                </>
              )}

              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center">
                  <img
                    src={
                      serverOptions.find((o) => o.value === pendingType)?.icon
                    }
                    alt={
                      pendingType === MediaServerType.PLEX ? 'Plex' : 'Jellyfin'
                    }
                    className="h-16 w-auto object-contain"
                  />
                </div>
                <span className="mt-2 text-sm font-medium text-zinc-400">
                  {pendingType === MediaServerType.PLEX ? 'Plex' : 'Jellyfin'}
                </span>
              </div>
            </div>

            <p className="mb-2 text-lg font-medium text-zinc-100">
              {isSwitchComplete ? (
                <>
                  Successfully switched to{' '}
                  <strong className="text-zinc-100">
                    {pendingType === MediaServerType.PLEX ? 'Plex' : 'Jellyfin'}
                  </strong>
                  !
                </>
              ) : (
                <>
                  We will now switch from{' '}
                  <strong className="text-zinc-100">
                    {currentType === MediaServerType.PLEX ? 'Plex' : 'Jellyfin'}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-zinc-100">
                    {pendingType === MediaServerType.PLEX ? 'Plex' : 'Jellyfin'}
                  </strong>
                  .
                </>
              )}
            </p>

            {!isSwitchComplete &&
              (hasDataToDelete ? (
                <>
                  <p className="mb-3 text-zinc-100">
                    The following data will be permanently deleted:
                  </p>
                  <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-zinc-100">
                    {previewData!.dataToBeCleared.collections > 0 && (
                      <li>
                        {previewData!.dataToBeCleared.collections} collection(s)
                      </li>
                    )}
                    {previewData!.dataToBeCleared.collectionMedia > 0 && (
                      <li>
                        {previewData!.dataToBeCleared.collectionMedia}{' '}
                        collection media item(s)
                      </li>
                    )}
                    {previewData!.dataToBeCleared.exclusions > 0 && (
                      <li>
                        {previewData!.dataToBeCleared.exclusions} exclusion(s)
                      </li>
                    )}
                    {previewData!.dataToBeCleared.collectionLogs > 0 && (
                      <li>
                        {previewData!.dataToBeCleared.collectionLogs} log
                        entries
                      </li>
                    )}
                  </ul>
                </>
              ) : (
                <p className="mb-4 text-zinc-100">
                  No data will be deleted (no collections exist).
                </p>
              ))}

            {/* Progress Bar */}
            {(isSwitchPending || isSwitchComplete) && (
              <div className="relative mb-4 h-8 w-full overflow-hidden rounded bg-zinc-700">
                <div
                  className={`h-full bg-amber-500 transition-all duration-500 ${
                    isSwitchComplete ? 'w-full' : 'w-full animate-pulse'
                  }`}
                />
                <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white drop-shadow-md">
                  {isSwitchComplete ? '100% Completed' : 'Switching...'}
                </div>
              </div>
            )}

            {/* Rule Migration Section */}
            {hasRulesToMigrate && !isSwitchComplete && (
              <div className="mb-4 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="migrateRules"
                    checked={migrateRules}
                    onChange={(e) => setMigrateRules(e.target.checked)}
                    disabled={isSwitchPending || isSwitchComplete}
                    className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-amber-500 focus:ring-amber-500"
                  />
                  <label htmlFor="migrateRules" className="ml-3 cursor-pointer">
                    <span className="block font-medium text-zinc-100">
                      Migrate rules to{' '}
                      {pendingType === MediaServerType.PLEX
                        ? 'Plex'
                        : 'Jellyfin'}
                    </span>
                    <span className="block text-sm text-zinc-400">
                      {previewData!.ruleMigration!.migratableRules} of{' '}
                      {previewData!.ruleMigration!.totalRules} rules can be
                      migrated.
                      {previewData!.ruleMigration!.skippedRules > 0 && (
                        <span className="text-amber-400">
                          {' '}
                          {previewData!.ruleMigration!.skippedRules} rule(s) use
                          properties not available in{' '}
                          {pendingType === MediaServerType.PLEX
                            ? 'Plex'
                            : 'Jellyfin'}
                          .
                        </span>
                      )}
                    </span>
                  </label>
                </div>

                {/* Show skipped rules details if any */}
                {previewData!.ruleMigration!.skippedRules > 0 &&
                  previewData!.ruleMigration!.skippedDetails.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300">
                        Show incompatible rules (
                        {previewData!.ruleMigration!.skippedRules})
                      </summary>
                      <ul className="mt-1 space-y-1 pl-4 text-zinc-500">
                        {previewData!
                          .ruleMigration!.skippedDetails.slice(0, 5)
                          .map((detail, idx) => (
                            <li key={idx}>
                              <span className="text-zinc-400">
                                {detail.ruleGroupName}
                              </span>
                              {detail.propertyName && (
                                <span> - uses {detail.propertyName}</span>
                              )}
                            </li>
                          ))}
                        {previewData!.ruleMigration!.skippedDetails.length >
                          5 && (
                          <li className="text-zinc-400">
                            ...and{' '}
                            {previewData!.ruleMigration!.skippedDetails.length -
                              5}{' '}
                            more
                          </li>
                        )}
                      </ul>
                    </details>
                  )}
              </div>
            )}

            <p className="mb-4 text-amber-400">
              <span className="font-bold">Important:</span>{' '}
              <span className="text-zinc-100">
                After migration, you must manually assign a library to each rule
                group before rules can run.
              </span>
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}

export default MediaServerSelector
