import { UploadIcon } from '@heroicons/react/solid'
import { compareVersions } from 'compare-versions'
import { useEffect, useMemo, useState } from 'react'
import GetApiHandler, { PostApiHandler } from '../../../utils/ApiHandler'
import { logClientError } from '../../../utils/ClientLogger'
import { IRule } from '../../Rules/Rule/RuleCreator'
import CommunityRuleUpload from '../../Rules/Rule/RuleCreator/CommunityRuleUpload'
import Alert from '../Alert'
import CommunityRuleTableRow from '../CommunityRowTableRow'
import InfoButton from '../InfoButton'
import LoadingSpinner from '../LoadingSpinner'
import Modal from '../Modal'
import Pagination from '../Pagination'
import SearchBar from '../SearchBar'

interface ICommunityRuleModal {
  onUpdate: (rules: IRule[]) => void
  onCancel: () => void
  currentRules?: IRule[]
  type: 'movie' | 'show'
  level?: 'show' | 'season' | 'episode'
}

interface ICommunityRuleKarmaHistory {
  id: number
  community_rule_id: number
}

export interface ICommunityRule {
  id?: number
  karma?: number
  type: 'movie' | 'show'
  appVersion?: string
  name: string
  description: string
  hasRules: boolean
  uploadedBy: string
  JsonRules: IRule[]
}

const CommunityRuleModal = (props: ICommunityRuleModal) => {
  const [communityRules, setCommunityRules] = useState<ICommunityRule[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [selectedRule, setSelectedRule] = useState<number | undefined>()
  const [history, setHistory] = useState<ICommunityRuleKarmaHistory[]>([])
  const [showInfo, setInfo] = useState<boolean>(false)
  const [uploadMyRules, setUploadMyRules] = useState<boolean>(false)
  const [appVersion, setAppVersion] = useState<string>('0.0.0')
  const [searchText, setSearchText] = useState<string>('')
  const itemsPerPage = 5

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(false)

      const apiVersionPromise = getAppVersion()

      const communityRulesPromise = GetApiHandler<ICommunityRule[]>(
        '/rules/community',
      ).then((resp) => {
        if (Array.isArray(resp)) {
          setCommunityRules(resp)
        } else {
          throw new Error(`Couldn't fetch community rules.`)
        }
      })

      const karmaPromise = getKarmaHistory()

      await Promise.all([
        apiVersionPromise,
        communityRulesPromise,
        karmaPromise,
      ])
        .catch((e) => {
          setError(true)
          void logClientError(
            'Failed to fetch community rules modal data',
            e,
            'Common.CommunityRuleModal.fetchData',
          )
        })
        .finally(() => {
          setLoading(false)
        })
    }

    fetchData()
  }, [])

  const getAppVersion = async () => {
    return GetApiHandler('/settings/version').then((resp: string) => {
      if (resp) {
        setAppVersion(resp)
      } else {
        throw new Error(`Couldn't fetch app version.`)
      }
    })
  }

  const getKarmaHistory = async () => {
    return GetApiHandler('/rules/community/karma/history').then(
      (resp: ICommunityRuleKarmaHistory[]) => {
        if (resp) {
          setHistory(resp)
        } else {
          throw new Error(`Couldn't fetch community rule Karma history.`)
        }
      },
    )
  }

  const applicableCommunityRules = useMemo(() => {
    return communityRules
      .filter((rule) => {
        const versionCheck =
          compareVersions(rule.appVersion || '0.0.0', appVersion) <= 0
        const typeCheck = rule.type === props.type

        return versionCheck && typeCheck
      })
      .sort((a, b) => b.karma! - a.karma!)
  }, [communityRules, appVersion, props.type])

  const filteredCommunityRules = useMemo(() => {
    return applicableCommunityRules.filter((rule) => {
      const searchCheck =
        searchText !== ''
          ? rule.name.toLowerCase().includes(searchText.trim().toLowerCase()) ||
            rule.description
              .toLowerCase()
              .includes(searchText.trim().toLowerCase()) ||
            rule.uploadedBy
              ?.toLowerCase()
              .includes(searchText.trim().toLowerCase())
          : true

      return searchCheck
    })
  }, [applicableCommunityRules, searchText])

  const shownRules = useMemo(() => {
    return filteredCommunityRules.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage,
    )
  }, [filteredCommunityRules, currentPage, itemsPerPage])

  const lastPage = Math.max(
    1,
    Math.ceil(filteredCommunityRules.length / itemsPerPage),
  )
  if (currentPage > lastPage) {
    setCurrentPage(lastPage)
  }

  const paginate = (page: number) => {
    setCurrentPage(page)
  }

  const handleUpload = () => {
    setUploadMyRules(false)
    props.onCancel()
  }

  const handleClick = (id: number) => {
    if (selectedRule !== id) {
      setSelectedRule(id)
    } else {
      setSelectedRule(undefined)
    }
  }

  const handleSubmit = () => {
    if (props.onUpdate !== undefined && selectedRule != null) {
      const rule = communityRules.find((r) => r.id === selectedRule)
      if (rule !== undefined) {
        props.onUpdate(rule.JsonRules)
      }
    }
  }

  const updateKarma = async (id: number, karmaAdjustment: number) => {
    const rule = communityRules.find((e) => e.id === id)
    if (rule?.karma == null) {
      return
    }

    const result = await PostApiHandler('/rules/community/karma', {
      id: id,
      karma: rule.karma + karmaAdjustment,
    })
      .then((resp: { code: 0 | 1; result: string }) => {
        if (resp.code !== 0) {
          return 1
        } else {
          return 0
        }
      })
      .catch(() => {
        return 0
      })

    if (result === 1) {
      setCommunityRules(
        communityRules.map((e) => {
          const newRule = { ...e }
          if (newRule.id === id && newRule.karma !== undefined) {
            newRule.karma += karmaAdjustment
          }
          return newRule
        }),
      )
      setHistory([{ id: history.length, community_rule_id: id }, ...history])
    }
  }

  return (
    <div>
      <Modal
        loading={false}
        backgroundClickable={false}
        onCancel={props.onCancel}
        size="5xl"
        okDisabled={selectedRule == null}
        onOk={handleSubmit}
        okText="Import"
        okButtonType="primary"
        title="Community Rules"
        iconSvg=""
      >
        <div>
          <Alert type="info">
            {`Import rules made by the community. This will override your current rules.`}
          </Alert>
        </div>
        <SearchBar onSearch={(input) => setSearchText(input)} />
        {!loading ? (
          <div className="flex flex-col">
            <div className="-mx-4 overflow-x-auto md:mx-0 lg:mx-0">
              <div className="inline-block min-w-full py-2 align-middle">
                <div className="overflow-hidden shadow md:mx-0 lg:mx-0">
                  <table className="ml-2 mr-2 min-w-full table-fixed">
                    <tbody className="divide-y divide-zinc-600 bg-zinc-800">
                      <tr>
                        <th className="w-60 truncate bg-gray-500 px-4 py-3 text-xs font-medium uppercase text-gray-200 md:w-80">
                          <span>Name</span>
                        </th>
                        <th className="truncate bg-gray-500 text-center text-xs font-medium uppercase text-gray-200">
                          <span>Karma</span>
                        </th>
                        <th className="truncate bg-gray-500 px-3 text-center text-xs font-medium uppercase text-gray-200">
                          <span>Uploaded By</span>
                        </th>
                        <th className="truncate bg-gray-500 px-3 text-center text-xs font-medium uppercase text-gray-200">
                          <span>Made with Version</span>
                        </th>
                      </tr>
                      {error ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-4 text-center font-semibold text-amber-500"
                          >
                            An error occurred fetching community rules. Please
                            try again later.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {applicableCommunityRules.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-4 text-center text-white"
                              >
                                No community rules found for this type &
                                Maintainerr version.
                              </td>
                            </tr>
                          ) : (
                            <>
                              {shownRules.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={4}
                                    className="px-4 py-4 text-center text-white"
                                  >
                                    No community rules found for this search.
                                  </td>
                                </tr>
                              ) : (
                                <>
                                  {shownRules.map((cr, index) => {
                                    return (
                                      <CommunityRuleTableRow
                                        key={index}
                                        clicked={selectedRule === cr.id}
                                        onClick={handleClick}
                                        onDoubleClick={() => setInfo(true)}
                                        thumbsActive={
                                          history.find(
                                            (e) =>
                                              e.community_rule_id === cr.id,
                                          ) === undefined
                                        }
                                        onThumbsUp={(id) => updateKarma(id, 10)}
                                        onThumbsDown={(id) =>
                                          updateKarma(id, -10)
                                        }
                                        rule={cr}
                                      />
                                    )
                                  })}
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="">
              <span className="float-left">
                <InfoButton
                  text="Info"
                  enabled={selectedRule != null}
                  onClick={() => setInfo(true)}
                />
              </span>
              <span className="float-right">
                <button
                  disabled={false}
                  className="mb-2 flex h-9 w-fit rounded bg-zinc-900 text-zinc-200 shadow-md hover:bg-zinc-800 disabled:opacity-50 md:ml-2"
                  onClick={() => {
                    setUploadMyRules(true)
                  }}
                >
                  {<UploadIcon className="m-auto ml-5 h-5" />}{' '}
                  <p className="rules-button-text m-auto ml-1 mr-5">
                    Upload my rules
                  </p>
                </button>
              </span>
            </div>
            <Pagination
              totalItems={filteredCommunityRules.length}
              currentPage={currentPage}
              pageSize={itemsPerPage}
              handleForward={() => paginate(currentPage + 1)}
              handleBackward={() => paginate(currentPage - 1)}
            />
          </div>
        ) : (
          <LoadingSpinner />
        )}

        {showInfo ? (
          <Modal
            loading={false}
            onCancel={() => setInfo(false)}
            cancelText="Close"
            title="Community Rule Description"
            iconSvg=""
          >
            <div className="block max-h-full w-full max-w-full overflow-auto bg-zinc-600 p-3 text-zinc-200">
              {communityRules.find((r) => r.id === selectedRule)?.description}
            </div>
          </Modal>
        ) : undefined}

        {uploadMyRules ? (
          <CommunityRuleUpload
            onCancel={() => setUploadMyRules(false)}
            onSubmit={handleUpload}
            type={props.type}
            rules={props.currentRules ? props.currentRules : []}
            level={props.type === 'show' ? props.level : undefined}
          />
        ) : undefined}
      </Modal>
    </div>
  )
}
export default CommunityRuleModal
