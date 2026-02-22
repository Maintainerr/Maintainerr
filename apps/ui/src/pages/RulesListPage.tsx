import { AxiosError } from 'axios'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useStopAllRuleExecution } from '../api/rules'
import AddButton from '../components/Common/AddButton'
import ExecuteButton from '../components/Common/ExecuteButton'
import LibrarySwitcher from '../components/Common/LibrarySwitcher'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import RuleGroup, { IRuleGroup } from '../components/Rules/RuleGroup'
import { useTaskStatusContext } from '../contexts/taskstatus-context'
import GetApiHandler, { PostApiHandler } from '../utils/ApiHandler'

const RulesListPage = () => {
  const navigate = useNavigate()
  const [data, setData] = useState<IRuleGroup[]>()
  const [selectedLibrary, setSelectedLibrary] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const { ruleHandlerRunning } = useTaskStatusContext()
  const { mutate: stopAllExecution } = useStopAllRuleExecution({
    onSuccess() {
      toast.success('Requested to stop all rule executions.')
    },
    onError() {
      toast.error('Failed to request stop of all rule executions.')
    },
  })

  const fetchData = async () => {
    if (selectedLibrary === 'all') return await GetApiHandler('/rules')
    else return await GetApiHandler(`/rules?libraryId=${selectedLibrary}`)
  }

  useEffect(() => {
    fetchData().then((resp) => {
      setData(resp)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    refreshData()
  }, [selectedLibrary])

  const onSwitchLibrary = (libraryId: string) => {
    setSelectedLibrary(libraryId)
  }

  const refreshData = (): void => {
    fetchData().then((resp) => setData(resp))
  }

  const editHandler = (group: IRuleGroup): void => {
    navigate(`/rules/edit/${group.id}`)
  }

  const sync = async () => {
    try {
      await PostApiHandler(`/rules/execute`, {})
      toast.success('Rule execution started.')
    } catch (e) {
      if (e instanceof AxiosError && e.response?.data?.message) {
        toast.error(e.response.data.message)
        return
      }
      toast.error('Failed to initiate rule execution.')
    }
  }

  if (!data || isLoading) {
    return (
      <>
        <title>Rules - Maintainerr</title>
        <span>
          <LoadingSpinner />
        </span>
      </>
    )
  }

  return (
    <>
      <title>Rules - Maintainerr</title>
      <div className="w-full">
        <LibrarySwitcher onLibraryChange={onSwitchLibrary} />

        <div className="m-auto mb-3 flex">
          <div className="ml-auto sm:ml-0">
            <AddButton onClick={() => navigate('/rules/new')} text="New Rule" />
          </div>
          <div className="ml-2 mr-auto sm:mr-0">
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
          </div>
        </div>
        <h1 className="mb-3 text-lg font-bold text-zinc-200">{'Rules'}</h1>
        <ul className="xs:grid xs:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] xs:gap-4">
          {data.map((el) => (
            <li
              key={el.id}
              className="collection relative mb-5 flex h-fit transform-gpu flex-col rounded-xl bg-zinc-800 bg-cover bg-center p-4 text-zinc-400 shadow ring-1 ring-zinc-700 xs:w-full sm:mb-0 sm:mr-5"
            >
              <RuleGroup
                onDelete={refreshData}
                onEdit={editHandler}
                group={el}
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export default RulesListPage
