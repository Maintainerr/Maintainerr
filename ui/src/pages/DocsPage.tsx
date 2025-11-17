import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const DocsPage = () => {
  const navigate = useNavigate()

  useEffect(() => {
    window.location.href = 'https://docs.maintainerr.info/latest/Introduction'
  }, [navigate])

  return <div className="text-white">Redirecting to documentation...</div>
}

export default DocsPage
