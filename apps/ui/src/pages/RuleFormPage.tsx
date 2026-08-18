import { Trans, useLingui } from '@lingui/react/macro'
import { useMatch, useNavigate, useParams } from 'react-router-dom'
import { useRuleGroup } from '../api/rules'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import AddModal from '../components/Rules/RuleGroup/AddModal'

const RuleFormPage = () => {
  const { t } = useLingui()
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

  // Spelled out per mode, so the whole title is one translatable sentence.
  const pageTitle = !id
    ? t`New rule - Maintainerr`
    : isCloneMode
      ? t`Clone rule - Maintainerr`
      : t`Edit rule - Maintainerr`

  if (id && error) {
    return (
      <>
        <title>{pageTitle}</title>
        <div className="m-4 rounded-md bg-error-500/10 p-4 text-error-300">
          <h2 className="mb-2 text-lg font-bold">
            <Trans>Error loading rule data</Trans>
          </h2>
          <p>{error.message}</p>
        </div>
      </>
    )
  }

  if (id && (!data || isLoading)) {
    return (
      <>
        <title>{pageTitle}</title>
        <LoadingSpinner />
      </>
    )
  }

  return (
    <>
      <title>{pageTitle}</title>
      <AddModal
        key={id}
        onSuccess={handleSuccess}
        editData={data}
        isCloneMode={isCloneMode}
        onCancel={handleCancel}
      />
    </>
  )
}

export default RuleFormPage
