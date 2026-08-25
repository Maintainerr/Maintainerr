import type { MessageDescriptor } from '@lingui/core'
import { msg, plural } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import {
  ArrowNarrowRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/solid'
import {
  MediaServerSwitchPreview,
  MediaServerType,
} from '@maintainerr/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  usePreviewMediaServerSwitch,
  useSwitchMediaServer,
} from '../../../api/settings'
import { logClientError } from '../../../utils/ClientLogger'
import PendingButton from '../../Common/PendingButton'
import Modal from '../../Common/Modal'

interface MediaServerSelectorProps {
  currentType: MediaServerType | null
  onSwitch?: () => void
  onClearFeedback?: () => void
  onInfo?: (message: string) => void
  onError?: (message: string) => void
}

const basePath = import.meta.env.VITE_BASE_PATH ?? ''

const serverOptions: {
  value: MediaServerType
  name: string
  description: MessageDescriptor
  icon: string
}[] = [
  {
    value: MediaServerType.PLEX,
    name: 'Plex',
    description: msg`Plex Media Server`,
    icon: `${basePath}/icons_logos/plex_logo.svg`,
  },
  {
    value: MediaServerType.JELLYFIN,
    name: 'Jellyfin',
    description: msg`Jellyfin Media Server`,
    icon: `${basePath}/icons_logos/jellyfin.svg`,
  },
  {
    value: MediaServerType.EMBY,
    name: 'Emby',
    description: msg`Emby Media Server`,
    icon: `${basePath}/icons_logos/emby.png`,
  },
]

const nameOf = (type: MediaServerType | null): string =>
  serverOptions.find((o) => o.value === type)?.name ?? ''

const MediaServerSelector = ({
  currentType,
  onSwitch,
  onClearFeedback,
  onInfo,
  onError,
}: MediaServerSelectorProps) => {
  const { t } = useLingui()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingType, setPendingType] = useState<MediaServerType | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [migrateRules, setMigrateRules] = useState(true)
  const [isSwitchComplete, setIsSwitchComplete] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  const { mutateAsync: previewSwitch, isPending: isPreviewPending } =
    usePreviewMediaServerSwitch()
  const { mutateAsync: switchServer, isPending: isSwitchPending } =
    useSwitchMediaServer()

  const [previewData, setPreviewData] =
    useState<MediaServerSwitchPreview | null>(null)

  const handleServerClick = async (type: MediaServerType) => {
    if (type === currentType) return

    onClearFeedback?.()
    setPendingType(type)

    // If no current type is set (initial setup), skip preview and just set the type
    if (!currentType) {
      try {
        await switchServer({
          targetServerType: type,
        })
        onInfo?.(
          t`Selected ${{ serverName: nameOf(type) }} as your media server`,
        )

        // Wait for settings to refetch before navigating
        await queryClient.invalidateQueries({ queryKey: ['settings'] })
        // Wait for the queries to actually refetch
        await queryClient.refetchQueries({ queryKey: ['settings'] })

        onSwitch?.()
        setPendingType(null)
        // Navigate to the new media server's settings page
        navigate(`/settings/${type}`, { replace: true })
      } catch (error) {
        void logClientError(
          'Failed to set media server',
          error,
          'Settings.MediaServerSelector.handleServerChange',
        )
        onError?.(t`Failed to set media server. Check logs for details.`)
        setPendingType(null)
      }
      return
    }

    // For switching (when currentType exists), show preview modal
    try {
      const preview = await previewSwitch(type)
      setPreviewData(preview)
      setShowConfirmModal(true)
    } catch (error) {
      onError?.(t`Failed to preview switch`)
      setPendingType(null)
    }
  }

  const handleConfirmSwitch = async () => {
    if (!pendingType) return

    setSwitchError(null)

    try {
      const result = await switchServer({
        targetServerType: pendingType,
        migrateRules,
      })

      if (result.status === 'NOK') {
        setSwitchError(result.message || t`Failed to switch media server`)
      } else {
        setIsSwitchComplete(true)
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        t`Failed to switch media server`
      setSwitchError(message)
    }
  }

  const handleFinish = async () => {
    setShowConfirmModal(false)
    onSwitch?.()
    const type = pendingType
    setPendingType(null)
    setIsSwitchComplete(false)

    // Invalidate queries only when the user dismisses the modal
    // to prevent the parent from re-rendering while the modal is still open
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['settings'] }),
      queryClient.invalidateQueries({ queryKey: ['collections'] }),
      queryClient.invalidateQueries({ queryKey: ['rules'] }),
    ])

    navigate(`/settings/${type}`)
  }

  const handleCancelSwitch = () => {
    setShowConfirmModal(false)
    setPendingType(null)
    setPreviewData(null)
    setMigrateRules(true)
    setIsSwitchComplete(false)
    setSwitchError(null)
  }

  const hasDataToDelete =
    previewData?.dataToBeCleared &&
    (previewData.dataToBeCleared.collections > 0 ||
      previewData.dataToBeCleared.collectionMedia > 0 ||
      previewData.dataToBeCleared.exclusions > 0 ||
      previewData.dataToBeCleared.collectionLogs > 0)

  const hasRulesToMigrate =
    previewData?.ruleMigration && previewData.ruleMigration.totalRules > 0

  // Named locals so the extracted messages read with real placeholder names.
  const currentName = nameOf(currentType)
  const pendingName = nameOf(pendingType)
  const migratableRules = previewData?.ruleMigration?.migratableRules
  const totalRules = previewData?.ruleMigration?.totalRules
  const skippedRules = previewData?.ruleMigration?.skippedRules
  const skippedRuleCount = skippedRules ?? 0
  const clearedCollections = previewData?.dataToBeCleared.collections ?? 0
  const clearedCollectionMedia =
    previewData?.dataToBeCleared.collectionMedia ?? 0
  const clearedExclusions = previewData?.dataToBeCleared.exclusions ?? 0
  const clearedCollectionLogs = previewData?.dataToBeCleared.collectionLogs ?? 0
  const furtherSkippedRules =
    (previewData?.ruleMigration?.skippedDetails.length ?? 0) - 5
  // plural() rather than <Plural>, so the server name stays a bound ICU
  // argument inside each plural form instead of literal text.
  const skippedRulesNotice = plural(skippedRuleCount, {
    one: `# rule uses properties not available in ${{ pendingName }}.`,
    other: `# rules use properties not available in ${{ pendingName }}.`,
  })

  return (
    <>
      <div className="section">
        <h3 className="heading">
          <Trans>Media Server</Trans>
        </h3>
        <p className="description">
          {currentType
            ? t`Select your media server type. Switching will reset media server-specific data.`
            : t`Select your media server to get started with Maintainerr.`}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                className={`relative flex cursor-pointer rounded-lg border p-4 shadow-xs transition-colors duration-150 focus:ring-2 focus:ring-maintainerr focus:outline-hidden ${
                  isSelected
                    ? 'border-maintainerr bg-maintainerr/10'
                    : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                } ${(isPreviewPending || isSwitchPending) && !isPending ? 'opacity-50' : ''}`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center">
                    <img
                      src={option.icon}
                      alt={option.name}
                      className="h-10 w-10 rounded-sm object-contain"
                    />
                    <div className="ml-4 text-left">
                      <p className="font-medium text-zinc-100">{option.name}</p>
                      <p className="text-sm text-zinc-400">
                        {t(option.description)}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="shrink-0 text-maintainerr">
                      <CheckCircleIcon className="h-6 w-6" />
                    </div>
                  )}
                  {isPending && (
                    <div className="shrink-0">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-maintainerr" />
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
          // No close while the switch runs: the request cannot be cancelled,
          // and closing here left the finish step, which reloads settings,
          // unreachable.
          onCancel={
            isSwitchPending
              ? undefined
              : isSwitchComplete
                ? handleFinish
                : handleCancelSwitch
          }
          cancelText={isSwitchComplete ? t`Done` : t`Cancel`}
          cancelButtonType={isSwitchComplete ? 'primary' : 'default'}
          footerActions={
            isSwitchComplete ? undefined : (
              <PendingButton
                buttonType="danger"
                className="ml-3"
                isPending={isSwitchPending}
                idleLabel={t`Switch`}
                pendingLabel={t`Switching...`}
                disabled={isSwitchPending}
                onClick={() => void handleConfirmSwitch()}
              />
            )
          }
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
                        alt={nameOf(currentType)}
                        className="h-16 w-auto object-contain"
                      />
                    </div>
                    <span className="mt-2 text-sm font-medium text-zinc-400">
                      {nameOf(currentType)}
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
                    alt={nameOf(pendingType)}
                    className="h-16 w-auto object-contain"
                  />
                </div>
                <span className="mt-2 text-sm font-medium text-zinc-400">
                  {nameOf(pendingType)}
                </span>
              </div>
            </div>

            <p className="mb-2 text-lg font-medium text-zinc-100">
              {isSwitchComplete ? (
                <Trans>
                  Successfully switched to{' '}
                  <strong className="text-zinc-100">{pendingName}</strong>!
                </Trans>
              ) : (
                <Trans>
                  We will now switch from{' '}
                  <strong className="text-zinc-100">{currentName}</strong> to{' '}
                  <strong className="text-zinc-100">{pendingName}</strong>.
                </Trans>
              )}
            </p>

            {!isSwitchComplete &&
              (hasDataToDelete ? (
                <>
                  <p className="mb-3 text-zinc-100">
                    {migrateRules
                      ? t`The following data will be cleared or reset:`
                      : t`The following data will be permanently deleted:`}
                  </p>
                  <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-zinc-100">
                    {previewData!.dataToBeCleared.collections > 0 &&
                      (migrateRules ? (
                        <li>
                          <Plural
                            value={clearedCollections}
                            one="# collection will be preserved (media server references reset)"
                            other="# collections will be preserved (media server references reset)"
                          />
                        </li>
                      ) : (
                        <li>
                          <Plural
                            value={clearedCollections}
                            one="# collection"
                            other="# collections"
                          />
                        </li>
                      ))}
                    {previewData!.dataToBeCleared.collectionMedia > 0 && (
                      <li>
                        <Plural
                          value={clearedCollectionMedia}
                          one="# collection media item"
                          other="# collection media items"
                        />
                      </li>
                    )}
                    {previewData!.dataToBeCleared.exclusions > 0 && (
                      <li>
                        <Plural
                          value={clearedExclusions}
                          one="# exclusion"
                          other="# exclusions"
                        />
                      </li>
                    )}
                    {previewData!.dataToBeCleared.collectionLogs > 0 && (
                      <li>
                        <Plural
                          value={clearedCollectionLogs}
                          one="# log entry"
                          other="# log entries"
                        />
                      </li>
                    )}
                  </ul>
                </>
              ) : (
                <p className="mb-4 text-zinc-100">
                  <Trans>No data will be deleted (no collections exist).</Trans>
                </p>
              ))}

            {/* Result indicator */}
            {isSwitchComplete && (
              <div className="mb-4 flex items-center justify-center space-x-2 rounded-sm bg-success-900/30 p-3 text-success-400">
                <CheckCircleIcon className="h-5 w-5" />
                <span className="text-sm font-medium">
                  <Trans>Success</Trans>
                </span>
              </div>
            )}
            {switchError && (
              <div className="mb-4 rounded-sm bg-error-900/30 p-3 text-error-400">
                <div className="flex items-center space-x-2">
                  <XCircleIcon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">
                    <Trans>
                      Media server switch could not be completed: {switchError}
                    </Trans>
                  </span>
                </div>
                <p className="mt-1 pl-7 text-xs text-error-400/70">
                  <Trans>Close this dialog and try again.</Trans>
                </p>
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
                    className="checkbox mt-1"
                  />
                  <label htmlFor="migrateRules" className="ml-3 cursor-pointer">
                    <span className="block font-medium text-zinc-100">
                      <Trans>Migrate rules to {pendingName}</Trans>
                    </span>
                    <span className="block text-sm text-zinc-400">
                      <Trans>
                        {migratableRules} of {totalRules} rules can be migrated.
                      </Trans>
                      {previewData!.ruleMigration!.skippedRules > 0 && (
                        <span className="text-maintainerr-400">
                          {' '}
                          {skippedRulesNotice}
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
                        <Trans>Show incompatible rules ({skippedRules})</Trans>
                      </summary>
                      <ul className="mt-1 space-y-1 pl-4 text-zinc-500">
                        {previewData!
                          .ruleMigration!.skippedDetails.slice(0, 5)
                          .map((detail, idx) => {
                            // Named so the message carries {propertyName}
                            // rather than an opaque {0}.
                            const propertyName = detail.propertyName
                            return (
                              <li key={idx}>
                                <span className="text-zinc-400">
                                  {detail.ruleGroupName}
                                </span>
                                {propertyName && (
                                  <span>
                                    {' '}
                                    <Trans>- uses {propertyName}</Trans>
                                  </span>
                                )}
                              </li>
                            )
                          })}
                        {previewData!.ruleMigration!.skippedDetails.length >
                          5 && (
                          <li className="text-zinc-400">
                            <Plural
                              value={furtherSkippedRules}
                              one="...and # more"
                              other="...and # more"
                            />
                          </li>
                        )}
                      </ul>
                    </details>
                  )}
              </div>
            )}

            <p className="mb-4 text-maintainerr-400">
              <span className="font-bold">
                <Trans>Important:</Trans>
              </span>{' '}
              <span className="text-zinc-100">
                <Trans>
                  After migration, you must manually assign a library to each
                  rule group before rules can run.
                </Trans>
              </span>
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}

export default MediaServerSelector
