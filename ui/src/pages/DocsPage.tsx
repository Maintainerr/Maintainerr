import { useEffect } from 'react'

const DocsPage = () => {
  useEffect(() => {
    window.location.href = 'https://docs.maintainerr.info/latest/Introduction'
  }, [])

  return <div className="text-white">Redirecting to documentation...</div>
}

export default DocsPage
