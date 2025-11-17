import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

const SettingsLander = () => {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Maintainerr - Settings'
    navigate('/settings/main')
  }, [navigate])

  return <></>
}
export default SettingsLander
