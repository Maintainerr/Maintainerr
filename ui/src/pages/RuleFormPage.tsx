import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useParams } from 'react-router-dom'
import { ConstantsContextProvider } from '../contexts/constants-context'
import GetApiHandler from '../utils/ApiHandler'
import AddModal from '../components/Rules/RuleGroup/AddModal'
import { IRuleGroup } from '../components/Rules/RuleGroup'
import LoadingSpinner from '../components/Common/LoadingSpinner'

const RuleFormPage = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [editData, setEditData] = useState<IRuleGroup | undefined>()
  const [isLoading, setIsLoading] = useState(!!id)

  useEffect(() => {
    if (id) {
      GetApiHandler(`/rules/${id}`)
        .then((resp) => {
          setEditData(resp)
          setIsLoading(false)
        })
        .catch((err) => {
          console.error('Failed to load rule:', err)
          setIsLoading(false)
          navigate('/rules')
        })
    }
  }, [id, navigate])

  const handleSuccess = () => {
    navigate('/rules')
  }

  const handleCancel = () => {
    navigate('/rules')
  }

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Maintainerr - {id ? 'Edit' : 'New'} Rule</title>
        </Helmet>
        <LoadingSpinner />
      </>
    )
  }

  return (
    <>
      <Helmet>
        <title>Maintainerr - {id ? 'Edit' : 'New'} Rule</title>
      </Helmet>
      <ConstantsContextProvider>
        <AddModal
          onSuccess={handleSuccess}
          editData={editData}
          onCancel={handleCancel}
        />
      </ConstantsContextProvider>
    </>
  )
}

export default RuleFormPage
