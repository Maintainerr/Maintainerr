import { Trans, useLingui } from '@lingui/react/macro'
import { BasicResponseDto } from '@maintainerr/contracts'
import { useState } from 'react'
import { PostApiHandler } from '../../../utils/ApiHandler'
import BrandLink from '../../Common/BrandLink'
import Button from '../../Common/Button'
import { type SettingsFeedback } from '../useSettingsFeedback'

// The visible link text rides through the message as a placeholder, so a
// translation cannot show a different domain than the href opens.
const sportarrDomain = 'sportarr.net'

/**
 * Sportarr league artwork has no key to configure and cannot be the primary
 * provider (it answers only for its own ids), so this card carries the
 * refresh action and says where the artwork comes from.
 */
function SportarrSection({
  onFeedback,
}: {
  onFeedback: (feedback: SettingsFeedback) => void
}) {
  const { t } = useLingui()
  const [refreshing, setRefreshing] = useState(false)

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
          type: response?.code === 1 ? 'success' : 'error',
          title:
            response?.message ??
            (response?.code === 1
              ? t`${{ providerTitle: 'Sportarr' }} metadata refresh started`
              : t`Failed to refresh ${{ providerTitle: 'Sportarr' }} metadata`),
        })
      })
      .catch(() => {
        onFeedback({
          type: 'error',
          title: t`Failed to refresh ${{ providerTitle: 'Sportarr' }} metadata`,
        })
      })
      .finally(() => setRefreshing(false))
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
            disabled={refreshing}
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
            needed. They are read from your Sportarr connections first, and from{' '}
            <BrandLink external href="https://sportarr.net">
              {sportarrDomain}
            </BrandLink>{' '}
            for a league none of them tracks. Set the SPORTARR_NET environment
            variable to off to stop the {sportarrDomain} read.
          </Trans>
        </div>
      </div>
    </div>
  )
}

export default SportarrSection
