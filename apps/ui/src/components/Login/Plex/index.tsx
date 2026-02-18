import { LoginIcon } from '@heroicons/react/outline'
import React, { useState } from 'react'
import { toast } from 'react-toastify'
import PlexOAuth from '../../../utils/PlexAuth'

const plexOAuth = new PlexOAuth()

interface PlexLoginButtonProps {
  onAuthToken: (authToken: string) => void
  isProcessing?: boolean
  onError?: (message: string) => void
}

const PlexLoginButton: React.FC<PlexLoginButtonProps> = ({
  onAuthToken,
  onError,
  isProcessing,
}) => {
  const [loading, setLoading] = useState(false)

  const getPlexLogin = async () => {
    try {
      const authToken = await plexOAuth.login()
      onAuthToken(authToken)
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleClick = () => {
    if (loading || isProcessing) return

    setLoading(true)
    plexOAuth.preparePopup()

    if (!plexOAuth.hasPopup()) {
      const message =
        'Plex login popup was blocked. Please allow popups for this site.'
      onError?.(message)
      toast.error(message)
      setLoading(false)
      return
    }

    void getPlexLogin()
  }

  return (
    <span className="block w-full rounded-md shadow-sm">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || isProcessing}
        className="plex-button"
      >
        <LoginIcon />
        <span>
          {loading
            ? 'Loading…'
            : isProcessing
              ? 'Authenticating…'
              : 'Authenticate with Plex'}
        </span>
      </button>
    </span>
  )
}

export default PlexLoginButton
