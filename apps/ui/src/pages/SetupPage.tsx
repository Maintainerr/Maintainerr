import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '../api/settings'
import Alert from '../components/Common/Alert'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import { PlexSettingsForm } from '../components/Settings/Plex/PlexSettingsForm'
import GetApiHandler from '../utils/ApiHandler'

const SetupPage = () => {
  const navigate = useNavigate()
  const basePath = import.meta.env.VITE_BASE_PATH ?? ''
  const { data: settings, isLoading, error } = useSettings()

  useEffect(() => {
    GetApiHandler<boolean>('/settings/test/setup').then((setupDone) => {
      if (setupDone) {
        navigate('/overview', { replace: true })
      }
    })
  }, [navigate])

  if (error) {
    return (
      <div className="mt-10">
        <Alert type="error" title="There was a problem loading settings." />
      </div>
    )
  }

  if (isLoading || !settings) {
    return <LoadingSpinner />
  }

  return (
    <div className="flex min-h-screen min-w-0 items-center justify-center bg-zinc-900 px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="section h-full w-full">
          <img
            style={{ width: '300px', height: 'auto' }}
            src={`${basePath}/logo.svg`}
            alt="Maintainerr"
          />
        </div>
        <PlexSettingsForm
          settings={settings}
          variant="setup"
          onSave={() => navigate('/overview', { replace: true })}
        />
      </div>
    </div>
  )
}

export default SetupPage
