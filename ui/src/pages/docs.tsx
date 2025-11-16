import { NextPage } from 'next'
import { useEffect } from 'react'

const DocsPage: NextPage = () => {
  useEffect(() => {
    window.location.href = 'https://docs.maintainerr.info/latest/Introduction'
  }, [])

  return <></>
}

export default DocsPage
