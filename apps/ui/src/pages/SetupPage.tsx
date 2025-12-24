import { useNavigate } from 'react-router-dom'
import { useSettings } from '../api/settings'
import Alert from '../components/Common/Alert'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import SetupWizard from '../components/Setup/Wizard'

const SetupPage = () => {
  const navigate = useNavigate()
  const basePath = import.meta.env.VITE_BASE_PATH ?? ''
  const { data: settings, isLoading, error } = useSettings()

  if (error) {
    return (
      <div className="mt-10">
        <Alert type="error" title="There was a problem loading settings." />
      </div>
    )
  }

  if (isLoading || !settings) return <LoadingSpinner />

  return (
    <SetupWizard
      basePath={basePath}
      settings={settings}
      onDone={() => navigate('/overview', { replace: true })}
    />
  )
}

export default SetupPage
