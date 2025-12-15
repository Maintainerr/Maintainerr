import { LoginIcon } from '@heroicons/react/outline'
import React, { useState } from 'react'
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
    setLoading(true)
    try {
      const authToken = await plexOAuth.login()
      setLoading(false)
      onAuthToken(authToken)
    } catch (e) {
      if (onError) {
        onError(e instanceof Error ? e.message : 'Unknown error')
      }
      setLoading(false)
    }
  }
  return (
    <span className="block w-full rounded-md shadow-sm">
      <button
        type="button"
        onClick={() => {
          plexOAuth.preparePopup()
          setTimeout(() => getPlexLogin(), 1500)
        }}
        disabled={loading || isProcessing}
        className="plex-button"
      >
        <LoginIcon />
        <span>
          {loading
            ? 'Loading'
            : isProcessing
              ? 'Authenticating..'
              : 'Authenticate with Plex'}
        </span>
      </button>
    </span>
  )
}

export default PlexLoginButton
