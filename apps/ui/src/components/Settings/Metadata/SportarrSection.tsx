import { Trans, useLingui } from '@lingui/react/macro'
import { BasicResponseDto } from '@maintainerr/contracts'
import { useState } from 'react'
import {
  useSportarrMetadataSetting,
  useUpdateSportarrMetadataSetting,
} from '../../../api/settings'
import { PostApiHandler } from '../../../utils/ApiHandler'
import BrandLink from '../../Common/BrandLink'
import Button from '../../Common/Button'
import { type SettingsFeedback } from '../useSettingsFeedback'

// The visible link text rides through the messages as a placeholder, so a
// translation cannot show a different domain than the href opens.
const sportarrDomain = 'sportarr.net'

/**
 * Sportarr league artwork has no key to configure and cannot be the primary
 * provider (it answers only for its own ids), so this card carries just the
 * refresh action and the one choice a user has: whether sportarr.net may be
 * read for a league none of the Sportarr connections tracks.
 */
function SportarrSection({
  onFeedback,
}: {
  onFeedback: (feedback: SettingsFeedback) => void
}) {
  const { t } = useLingui()
  const [refreshing, setRefreshing] = useState(false)
  const { data: setting, isLoading, isError } = useSportarrMetadataSetting()
  const { mutateAsync: saveSetting, isPending: saving } =
    useUpdateSportarrMetadataSetting()
  const useSportarrNet = setting?.use_sportarr_net ?? true

  const toggleSportarrNet = async () => {
    onFeedback(null)
    try {
      const response = await saveSetting({ use_sportarr_net: !useSportarrNet })
      if (response.code === 1) {
        onFeedback({ type: 'success', title: t`Sportarr settings updated` })
      } else {
        onFeedback({
          type: 'error',
          title: t`Sportarr settings could not be updated`,
        })
      }
    } catch {
      onFeedback({
        type: 'error',
        title: t`Sportarr settings could not be updated`,
      })
    }
  }

  const performRefresh = async () => {
    if (refreshing) return
    onFeedback(null)
    setRefreshing(true)
    await PostApiHandler<BasicResponseDto>(
      '/settings/metadata/refresh/sportarr',
      {},
    )
      .then((response) => {
        onFeedback({
          type: response.code === 1 ? 'success' : 'error',
          title:
            response.message ??
            (response.code === 1
              ? t`Sportarr metadata refresh started`
              : t`Failed to refresh Sportarr metadata`),
        })
      })
      .catch(() => {
        onFeedback({
          type: 'error',
          title: t`Failed to refresh Sportarr metadata`,
        })
      })
      .finally(() => {
        setRefreshing(false)
      })
  }

  return (
    <div className="flex h-full flex-col rounded-xl bg-zinc-800 px-4 pt-5 pb-4 text-zinc-400 shadow-sm ring-1 ring-zinc-700">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-base font-medium text-white sm:text-lg">
            Sportarr
          </div>
          <Button
            buttonType="ghost"
            buttonSize="sm"
            type="button"
            onClick={() => void performRefresh()}
            disabled={refreshing || isLoading || isError}
          >
            <span className="font-semibold">
              {refreshing ? t`Refreshing...` : t`Refresh metadata`}
            </span>
          </Button>
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="text-xs leading-5 text-zinc-400">
          <Trans>
            Posters, backdrops and descriptions for Sportarr leagues. No key is
            needed. They are read from your Sportarr connections first.
          </Trans>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <label
            htmlFor="sportarr-use-sportarr-net"
            className="text-sm font-medium text-zinc-300"
          >
            <Trans>
              Read from{' '}
              <BrandLink external href="https://sportarr.net">
                {sportarrDomain}
              </BrandLink>{' '}
              for a league your Sportarr connections do not track
            </Trans>
          </label>
          <button
            id="sportarr-use-sportarr-net"
            type="button"
            role="switch"
            aria-checked={useSportarrNet}
            aria-disabled={isLoading || isError || saving}
            disabled={isLoading || isError || saving}
            onClick={() => void toggleSportarrNet()}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
              useSportarrNet ? 'bg-maintainerr-600' : 'bg-zinc-600',
              isLoading || isError || saving
                ? 'cursor-not-allowed'
                : 'cursor-pointer',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-4 w-4 transform rounded-full bg-white transition duration-200',
                useSportarrNet ? 'translate-x-6' : 'translate-x-1',
              ].join(' ')}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

export default SportarrSection
