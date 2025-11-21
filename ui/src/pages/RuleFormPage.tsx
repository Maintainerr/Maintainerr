import { Helmet } from 'react-helmet-async'
import { useNavigate, useParams } from 'react-router-dom'
import { useRuleGroup } from '../api/rules'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import AddModal from '../components/Rules/RuleGroup/AddModal'

const RuleFormPage = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error } = useRuleGroup(id)

  const handleSuccess = () => {
    navigate('/rules')
  }

  const handleCancel = () => {
    navigate('/rules')
  }

  if (error) {
    return (
      <>
        <Helmet>
          <title>Maintainerr - {id ? 'Edit' : 'New'} Rule</title>
        </Helmet>
        <div className="m-4 rounded-md bg-red-500/10 p-4 text-red-300">
          <h2 className="mb-2 text-lg font-bold">Error loading rule data</h2>
          <p>{error.message}</p>
        </div>
      </>
    )
  }

  if (id && (!data || isLoading)) {
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
      <AddModal
        onSuccess={handleSuccess}
        editData={data}
        onCancel={handleCancel}
      />
    </>
  )
}

export default RuleFormPage
