import { AxiosError } from 'axios'
import { useEffect, useEffectEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useMediaServerLibraries } from '../api/media-server'
import { useStopAllRuleExecution } from '../api/rules'
import AddButton from '../components/Common/AddButton'
import ExecuteButton from '../components/Common/ExecuteButton'
import LibrarySwitcher from '../components/Common/LibrarySwitcher'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import PageControlRow from '../components/Common/PageControlRow'
import RuleGroup, { IRuleGroup } from '../components/Rules/RuleGroup'
import { useTaskStatusContext } from '../contexts/taskstatus-context'
import { useRequestGeneration } from '../hooks/useRequestGeneration'
import GetApiHandler, { PostApiHandler } from '../utils/ApiHandler'

const RulesListPage = () => {
  const navigate = useNavigate()
  const [data, setData] = useState<IRuleGroup[]>([])
  const [selectedLibrary, setSelectedLibrary] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const {
    data: libraries,
    error: librariesError,
    isLoading: librariesLoading,
  } = useMediaServerLibraries()
  const { invalidate, guardedFetch } = useRequestGeneration()
  const { ruleHandlerRunning } = useTaskStatusContext()
  const { mutate: stopAllExecution } = useStopAllRuleExecution({
    onSuccess() {
      toast.success('Requested to stop all rule executions.')
    },
    onError() {
      toast.error('Failed to request stop of all rule executions.')
    },
  })

  const fetchData = async (libraryId: string) => {
    try {
      const result = await guardedFetch<IRuleGroup[]>(() =>
        libraryId === 'all'
          ? GetApiHandler('/rules')
          : GetApiHandler(`/rules?libraryId=${libraryId}`),
      )

      if (result.status === 'success') {
        setData(result.data)
        setIsLoading(false)
      }
    } catch {
      setIsLoading(false)
    }
  }

  const syncRulesForLibrary = useEffectEvent((libraryId: string) => {
    void fetchData(libraryId)
  })

  useEffect(() => {
    syncRulesForLibrary(selectedLibrary)
  }, [selectedLibrary])

  const onSwitchLibrary = (libraryId: string) => {
    invalidate()
    setSelectedLibrary(libraryId)
    setIsLoading(true)
    setData([])
  }

  const refreshData = (): void => {
    invalidate()
    void fetchData(selectedLibrary)
  }

  const editHandler = (group: IRuleGroup): void => {
    navigate(`/rules/edit/${group.id}`)
  }

  const sync = async () => {
    try {
      await PostApiHandler(`/rules/execute`, {})
      toast.success('Rule execution started.')
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data?.message) {
        toast.error(error.response.data.message)
        return
      }
      toast.error('Failed to initiate rule execution.')
    }
  }

  return (
    <>
      <title>Rules - Maintainerr</title>
      <div className="w-full px-4">
        <PageControlRow
          actions={
            <>
              <AddButton
                onClick={() => navigate('/rules/new')}
                text="New Rule"
              />
              <ExecuteButton
                onClick={() => {
                  if (ruleHandlerRunning) {
                    stopAllExecution()
                  } else {
                    sync()
                  }
                }}
                text={ruleHandlerRunning ? 'Stop Rules' : 'Run Rules'}
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
        <h1 className="mb-3 text-lg font-bold text-zinc-200">Rules</h1>
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
            {data.map((el) => (
              <li
                key={el.id}
                className="collection relative flex h-fit transform-gpu flex-col rounded-xl bg-zinc-800 bg-cover bg-center p-4 text-zinc-400 shadow ring-1 ring-zinc-700"
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
