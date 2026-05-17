import { LoginIcon } from '@heroicons/react/outline'
import { useState } from 'react'
import { type EmbyLoginResult, useLoginEmby } from '../../../api/settings'
import { getApiErrorMessage } from '../../../utils/ApiError'
import Button from '../../Common/Button'
import Modal from '../../Common/Modal'
import { InputGroup } from '../../Forms/Input'

export interface EmbyLoginButtonProps {
  /**
   * Resolved Emby base URL the credentials should authenticate against.
   * Required — the button is disabled while empty.
   */
  embyUrl: string | undefined
  /**
   * Called on successful authentication with the access token, admin user id,
   * and the post-login server snapshot (libraries + users + serverName).
   */
  onAuthenticated: (result: Required<Pick<EmbyLoginResult, 'token' | 'userId'>> & EmbyLoginResult) => void
}

/**
 * Opens a small modal to collect Emby admin username/password and POST them
 * to `/api/settings/emby/login`. Mirrors the Plex Login button pattern
 * ([apps/ui/src/components/Login/Plex](apps/ui/src/components/Login/Plex)) so
 * server-specific auth UX lives outside the settings page.
 *
 * Emby's auth endpoint is `POST /Users/AuthenticateByName` — verified against
 * Emby Server 4.9 and consistent with the Jellyseerr/Seerr Jellyfin client.
 */
const EmbyLoginButton: React.FC<EmbyLoginButtonProps> = ({
  embyUrl,
  onAuthenticated,
}) => {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { mutateAsync: login, isPending } = useLoginEmby()

  const reset = () => {
    setUsername('')
    setPassword('')
    setError(null)
  }

  const handleClose = () => {
    setOpen(false)
    reset()
  }

  const handleSubmit = async () => {
    if (!embyUrl) {
      setError('Enter your Emby server URL first.')
      return
    }
    setError(null)
    try {
      const result = await login({
        emby_url: embyUrl,
        username,
        password,
      })
      if (result.code !== 1 || !result.token || !result.userId) {
        setError(result.message || 'Authentication failed')
        return
      }
      onAuthenticated({
        ...result,
        token: result.token,
        userId: result.userId,
      })
      handleClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Authentication failed'))
    }
  }

  return (
    <>
      <Button
        type="button"
        buttonType="primary"
        onClick={() => setOpen(true)}
        disabled={!embyUrl}
      >
        <LoginIcon className="mr-1 h-5 w-5" />
        Sign in with Emby
      </Button>

      {open ? (
        <Modal
          onCancel={handleClose}
          cancelText="Close"
          loading={isPending}
          footerActions={
            <Button
              buttonType="primary"
              className="ml-3"
              onClick={() => void handleSubmit()}
              disabled={isPending || !username || !password}
            >
              {isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          }
        >
          <div className="text-zinc-100">
            <h3 className="mb-2 text-lg font-medium">Sign in with Emby</h3>
            <p className="mb-4 text-sm text-zinc-400">
              Authenticates against{' '}
              <strong className="text-zinc-200">{embyUrl}</strong> with an
              admin username and password. The resulting access token is
              stored as the API key.
            </p>
            <div className="space-y-3">
              <InputGroup
                label="Username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <InputGroup
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <div className="mt-4 rounded bg-error-900/30 p-3 text-sm text-error-400">
                {error}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}

export default EmbyLoginButton
