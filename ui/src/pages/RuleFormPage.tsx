import { useMatch, useNavigate, useParams } from 'react-router-dom'
import { useRuleGroup } from '../api/rules'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import AddModal from '../components/Rules/RuleGroup/AddModal'

const RuleFormPage = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isCloneMode = !!useMatch('/rules/clone/:id')
  const { data, isLoading, error } = useRuleGroup(id)

  const handleSuccess = () => {
    navigate('/rules')
  }

  const handleCancel = () => {
    navigate('/rules')
  }

  if (id && error) {
    return (
      <>
        <title>{isCloneMode ? 'Clone' : 'Edit'} rule - Maintainerr</title>
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
        <title>{isCloneMode ? 'Clone' : 'Edit'} rule - Maintainerr</title>
        <LoadingSpinner />
      </>
    )
  }

  const pageTitle = `${id ? (isCloneMode ? 'Clone' : 'Edit') : 'New'} rule - Maintainerr`

  return (
    <>
      <title>{pageTitle}</title>
      <AddModal
        onSuccess={handleSuccess}
        editData={data}
        isCloneMode={isCloneMode}
        onCancel={handleCancel}
      />
    </>
  )
}

export default RuleFormPage
