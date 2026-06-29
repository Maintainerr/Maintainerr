import { AxiosError } from 'axios'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useMediaServerLibraries } from '../api/media-server'
import { useRuleGroups, useStopAllRuleExecution } from '../api/rules'
import AddButton from '../components/Common/AddButton'
import ExecuteButton from '../components/Common/ExecuteButton'
import LibrarySwitcher from '../components/Common/LibrarySwitcher'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import PageControlRow from '../components/Common/PageControlRow'
import RuleGroup, { IRuleGroup } from '../components/Rules/RuleGroup'
import { useI18n } from '../contexts/i18n-context'
import { useTaskStatusContext } from '../contexts/taskstatus-context'
import { PostApiHandler } from '../utils/ApiHandler'

const RulesListPage = () => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [selectedLibrary, setSelectedLibrary] = useState<string>('all')
  const {
    data: libraries,
    error: librariesError,
    isLoading: librariesLoading,
  } = useMediaServerLibraries()
  const { ruleHandlerRunning } = useTaskStatusContext()
  const { mutate: stopAllExecution } = useStopAllRuleExecution({
    onSuccess() {
      toast.success(t('pages.rules.stopAllRequested'))
    },
    onError() {
      toast.error(t('pages.rules.stopAllFailed'))
    },
  })
  const { data = [], isLoading, refetch } = useRuleGroups(selectedLibrary)

  const onSwitchLibrary = (libraryId: string) => {
    setSelectedLibrary(libraryId)
  }

  const refreshData = (): void => {
    void refetch()
  }

  const editHandler = (group: IRuleGroup): void => {
    navigate(`/rules/edit/${group.id}`)
  }

  const sync = async () => {
    try {
      await PostApiHandler(`/rules/execute`, {})
      toast.success(t('pages.rules.executionStarted'))
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data?.message) {
        toast.error(error.response.data.message)
        return
      }
      toast.error(t('pages.rules.executionFailed'))
    }
  }

  return (
    <>
      <title>{`${t('pages.rules.title')} - Maintainerr`}</title>
      <div className="w-full px-4">
        <PageControlRow
          actions={
            <>
              <AddButton
                onClick={() => navigate('/rules/new')}
                text={t('pages.rules.newRule')}
              />
              <ExecuteButton
                onClick={() => {
                  if (ruleHandlerRunning) {
                    stopAllExecution()
                  } else {
                    sync()
                  }
                }}
                text={
                  ruleHandlerRunning
                    ? t('pages.rules.stopRules')
                    : t('pages.rules.runRules')
                }
                executing={ruleHandlerRunning}
              />
            </>
          }
          controls={
            <LibrarySwitcher
              containerClassName="mb-0"
              formClassName="max-w-none"
              onLibraryChange={onSwitchLibrary}
              selectedLibraryId={selectedLibrary}
              libraries={libraries}
              librariesLoading={librariesLoading}
              librariesError={!!librariesError}
            />
          }
        />
        <h1 className="mb-3 text-lg font-bold text-zinc-200">
          {t('pages.rules.heading')}
        </h1>
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
            {data.map((el) => (
              <li
                key={el.id}
                className="collection relative flex h-fit transform-gpu flex-col rounded-xl bg-zinc-800 bg-cover bg-center p-4 text-zinc-400 shadow-sm ring-1 ring-zinc-700"
              >
                <RuleGroup
                  onDelete={refreshData}
                  onEdit={editHandler}
                  group={el}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default RulesListPage
