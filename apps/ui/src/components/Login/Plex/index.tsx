import { LoginIcon } from '@heroicons/react/outline'
import { useLingui } from '@lingui/react/macro'
import React, { useState } from 'react'
import PlexOAuth from '../../../utils/PlexAuth'

const plexOAuth = new PlexOAuth()

interface PlexLoginButtonProps {
  onAuthToken: (authToken: string) => void
  clientIdentifier: string
  isProcessing?: boolean
  onError?: (message: string) => void
}

const PlexLoginButton: React.FC<PlexLoginButtonProps> = ({
  onAuthToken,
  onError,
  isProcessing,
  clientIdentifier,
}) => {
  const { t } = useLingui()
  const [loading, setLoading] = useState(false)

  const getPlexLogin = async () => {
    try {
      const authToken = await plexOAuth.login(clientIdentifier)
      onAuthToken(authToken)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t`Unknown error`)
    } finally {
      setLoading(false)
    }
  }

  const handleClick = () => {
    if (loading || isProcessing) return

    setLoading(true)
    plexOAuth.preparePopup()

    if (!plexOAuth.hasPopup()) {
      const message = t`Plex login popup was blocked. Please allow popups for this site.`
      onError?.(message)
      setLoading(false)
      return
    }

    void getPlexLogin()
  }

  return (
    <span className="block w-full rounded-md shadow-xs">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || isProcessing}
        className="plex-button"
      >
        <LoginIcon />
        <span>
          {loading
            ? t`Loading…`
            : isProcessing
              ? t`Authenticating…`
              : t`Authenticate with Plex`}
        </span>
      </button>
    </span>
  )
}

export default PlexLoginButton
