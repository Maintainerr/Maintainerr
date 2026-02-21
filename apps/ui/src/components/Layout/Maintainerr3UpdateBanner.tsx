import { ExclamationIcon, XIcon } from '@heroicons/react/solid'
import { useState } from 'react'
import Button from '../Common/Button'
import Maintainerr3UpdateModal from '../Settings/Main/Maintainerr3UpdateModal'

const BANNER_DISMISSED_KEY = 'maintainerr_3_update_banner_dismissed'

const readBannerDismissed = () => {
  try {
    return window.localStorage.getItem(BANNER_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

const writeBannerDismissed = () => {
  try {
    window.localStorage.setItem(BANNER_DISMISSED_KEY, 'true')
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

const Maintainerr3UpdateBanner = () => {
  const [isVisible, setIsVisible] = useState(() => !readBannerDismissed())
  const [showPrepModal, setShowPrepModal] = useState(false)

  const dismissBanner = () => {
    setIsVisible(false)
    writeBannerDismissed()
  }

  if (!isVisible) {
    return null
  }

  return (
    <>
      {showPrepModal && (
        <Maintainerr3UpdateModal onClose={() => setShowPrepModal(false)} />
      )}
      <div className="mb-3 rounded-md border border-amber-500/50 bg-amber-600/90 px-3 py-2 text-zinc-900 shadow-md">
        <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap sm:items-center">
          <div className="flex w-full items-start justify-center gap-2 sm:min-w-0 sm:flex-1 sm:items-center sm:justify-start">
            <ExclamationIcon className="mt-0.5 h-4 w-4 flex-shrink-0 sm:mt-0" />
            <p className="text-center text-xs font-semibold sm:text-left sm:text-sm">
              View Maintainerr 3.0 preparation information.
            </p>
          </div>
          <div className="relative mt-1 flex min-h-[2.25rem] w-full items-center sm:mt-0 sm:min-h-0 sm:w-auto sm:flex-nowrap sm:items-center sm:gap-2">
            <Button
              buttonType="primary"
              className="absolute left-1/2 -translate-x-1/2 !border-zinc-900 !bg-zinc-900 hover:!border-zinc-800 hover:!bg-zinc-800 sm:static sm:translate-x-0"
              onClick={() => setShowPrepModal(true)}
            >
              View 3.0 Prep
            </Button>
            <button
              aria-label="Dismiss banner"
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-900/90 transition hover:bg-zinc-900/10 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/40 sm:static sm:translate-y-0"
              onClick={dismissBanner}
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default Maintainerr3UpdateBanner
