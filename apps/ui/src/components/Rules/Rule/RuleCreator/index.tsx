import { ClipboardListIcon, DocumentAddIcon } from '@heroicons/react/solid'
import { type MediaItemType, MediaType } from '@maintainerr/contracts'
import { useRef, useState } from 'react'
import Alert from '../../../Common/Alert'
import SectionHeading from '../../../Common/SectionHeading'
import RuleInput from './RuleInput'

interface IRulesToCreate {
  id: number
  rule: IRule
}

export interface IRule {
  operator: string | null
  firstVal: [string, string]
  lastVal?: [string, string]
  section?: number
  customVal?: { ruleTypeId: number; value: string | number }
  arrDiskPath?: string
  action: number
}

export interface ILoadedRule {
  uniqueID: number
  rules: IRule[]
}

interface iRuleCreator {
  mediaType?: MediaType
  dataType?: MediaItemType
  editData?: { rules: IRule[] }
  onUpdate: (rules: IRule[]) => void
  onCancel: () => void
  radarrSettingsId?: number | null
  sonarrSettingsId?: number | null
}

const calculateRuleAmount = (
  data: { rules: IRule[] } | undefined,
  sections: number,
): [number, number[]] => {
  const sectionAmounts = [] as number[]
  if (data) {
    data.rules.forEach((el) =>
      el.section !== undefined
        ? sectionAmounts[el.section]
          ? sectionAmounts[el.section]++
          : (sectionAmounts[el.section] = 1)
        : (sectionAmounts[0] = 1),
    )
  }

  return [
    sections,
    sectionAmounts.filter((el) => el !== undefined && el !== null),
  ]
}

const calculateRuleAmountArr = (ruleAmount: [number, number[]]) => {
  let s = 0,
    r = 0
  const lenS = ruleAmount[0]

  const worker: [number[], [number[]]] = [[], [[]]]

  while (++s <= lenS) {
    worker[0].push(s)
    if (s > 1) {
      worker[1].push([])
    }
  }

  for (const sec of worker[0]) {
    r = 0
    while (++r <= ruleAmount[1][sec - 1]) worker[1][sec - 1].push(r)
  }

  return worker
}

const RuleCreator = (props: iRuleCreator) => {
  const initialSections =
    props.editData &&
    Array.isArray(props.editData.rules) &&
    props.editData.rules.length > 0
      ? props.editData.rules[props.editData.rules.length - 1].section! + 1
      : undefined
  const initialRuleAmount: [number, number[]] = initialSections
    ? calculateRuleAmount(props.editData, initialSections)
    : [1, [1]]
  const initialRuleAmountArr = calculateRuleAmountArr(initialRuleAmount)
  const initialAddedIds = initialSections ? [] : [1]

  const ruleAmountRef = useRef<[number, number[]]>(initialRuleAmount)
  const [ruleAmount, setRuleAmount] =
    useState<[number, number[]]>(initialRuleAmount)
  const [editData, setEditData] = useState<{ rules: IRule[] } | undefined>(
    props.editData,
  )
  const [ruleAmountArr, setRuleAmountArr] =
    useState<[number[], [number[]]]>(initialRuleAmountArr)
  const rulesCreatedRef = useRef<IRulesToCreate[]>([])
  const [rulesCreated, setRulesCreated] = useState<IRulesToCreate[]>([])
  const deletedCountRef = useRef(0)
  const [deletedCount, setDeletedCount] = useState(0)
  const addedIdsRef = useRef<number[]>(initialAddedIds)
  const [addedIds, setAddedIds] = useState<number[]>(initialAddedIds)

  const updateRulesCreated = (rules: IRulesToCreate[]) => {
    rulesCreatedRef.current = rules
    setRulesCreated(rules)
    props.onUpdate(rules.map((entry) => entry.rule))
  }

  const updateAddedIds = (ids: number[]) => {
    addedIdsRef.current = ids
    setAddedIds(ids)
  }

  const updateDeletedCount = (count: number) => {
    deletedCountRef.current = count
    setDeletedCount(count)
  }

  const updateEditData = (data: { rules: IRule[] } | undefined) => {
    setEditData(data)
  }

  const ruleCommited = (id: number, rule: IRule) => {
    const rules = rulesCreatedRef.current.filter((el) => el.id !== id)
    const toCommit = [...rules, { id: id, rule: rule }].sort(
      (a, b) => a.id - b.id,
    )
    updateRulesCreated(toCommit)
    updateAddedIds(addedIdsRef.current.filter((e) => e !== id))
  }

  const ruleOmitted = (id: number) => {
    const rules = rulesCreatedRef.current.filter((el) => el.id !== id)
    updateRulesCreated(rules)
  }

  const ruleDeleted = (section = 0, id: number) => {
    let nextRules = rulesCreatedRef.current.filter((el) => el.id !== id)
    const section1IsEmpty = !nextRules.some((r) => r.rule.section === 0)

    nextRules = nextRules.map((entry) => {
      const nextEntry = {
        ...entry,
        id: entry.id > id ? entry.id - 1 : entry.id,
        rule: { ...entry.rule },
      }

      if (section1IsEmpty && section === 1 && nextEntry.rule.section) {
        nextEntry.rule.section -= 1
      }

      return nextEntry
    })

    updateRulesCreated(nextRules)

    updateAddedIds(
      addedIdsRef.current
        .filter((e) => e !== id)
        .map((e) => {
          return e > id ? e - 1 : e
        }),
    )
    updateEditData({ rules: nextRules.map((el) => el.rule) })

    const rules = [...ruleAmountRef.current[1]]
    rules[section - 1] = rules[section - 1] - 1

    // Find sections that still contain rules
    const nonEmptySections = rules.filter((e) => e > 0)

    // Update the rule count while ensuring at least one section remains
    updateRuleAmount([
      nonEmptySections.length,
      nonEmptySections.length > 0 ? nonEmptySections : [1],
    ])

    updateDeletedCount(deletedCountRef.current + 1)
  }

  const RuleAdded = (section: number) => {
    const ruleId =
      ruleAmountRef.current[1].reduce((prev, cur, idx) =>
        idx + 1 <= section ? prev + cur : prev,
      ) + 1

    updateAddedIds([...addedIdsRef.current, ruleId])

    updateRulesCreated(
      rulesCreatedRef.current.map((entry) => {
        if (entry.id >= ruleId) {
          return { ...entry, id: entry.id + 1 }
        }

        return entry
      }),
    )

    const rules = [...ruleAmountRef.current[1]]
    rules[section - 1] = rules[section - 1] + 1

    updateRuleAmount([ruleAmountRef.current[0], rules])
  }

  const addSection = () => {
    const rules = [...ruleAmountRef.current[1]]
    rules.push(1)

    const ruleId =
      ruleAmountRef.current[1].reduce((prev, cur, idx) =>
        idx + 1 <= ruleAmountRef.current[0] + 1 ? prev + cur : prev,
      ) + 1
    updateAddedIds([...addedIdsRef.current, ruleId])

    updateRuleAmount([ruleAmountRef.current[0] + 1, rules])
  }

  const updateRuleAmount = (ruleAmount: [number, number[]]) => {
    ruleAmountRef.current = ruleAmount
    setRuleAmountArr(calculateRuleAmountArr(ruleAmount))
    setRuleAmount(ruleAmount)
  }

  return (
    <div className="text-zinc-100">
      {ruleAmountArr[0].map((sid) => {
        return (
          <div key={`${sid}-${deletedCount}`} className="mb-4">
            <div className="rounded-lg bg-zinc-700 px-6 py-0.5 shadow-md">
              <SectionHeading id={sid} name={'Section'} />
              <div className="flex flex-col space-y-2">
                {ruleAmountArr[1][sid - 1].map((id) => (
                  <div
                    key={`${sid}-${id}`}
                    className="flex w-full flex-col items-start"
                  >
                    <div className="mb-4 w-full">
                      <RuleInput
                        key={`${sid}-${id}`}
                        id={
                          ruleAmount[1].length > 1
                            ? ruleAmount[1].reduce((pv, cv, idx) =>
                                sid === 1
                                  ? cv - (cv - id)
                                  : idx <= sid - 1
                                    ? idx === sid - 1
                                      ? cv - (cv - id) + pv
                                      : cv + pv
                                    : pv,
                              )
                            : ruleAmount[1][0] - (ruleAmount[1][0] - id)
                        }
                        tagId={id}
                        editData={
                          editData
                            ? {
                                rule: editData.rules[
                                  (ruleAmount[1].length > 1
                                    ? ruleAmount[1].reduce((pv, cv, idx) =>
                                        sid === 1
                                          ? cv - (cv - id)
                                          : idx <= sid - 1
                                            ? idx === sid - 1
                                              ? cv - (cv - id) + pv
                                              : cv + pv
                                            : pv,
                                      )
                                    : ruleAmount[1][0] -
                                      (ruleAmount[1][0] - id)) - 1
                                ],
                              }
                            : undefined
                        }
                        section={sid}
                        newlyAdded={addedIds}
                        mediaType={props.mediaType}
                        dataType={props.dataType}
                        radarrSettingsId={props.radarrSettingsId}
                        sonarrSettingsId={props.sonarrSettingsId}
                        onCommit={ruleCommited}
                        onIncomplete={ruleOmitted}
                        onDelete={ruleDeleted}
                        allowDelete={
                          ruleAmount[0] > 1 || ruleAmount[1][sid - 1] > 1
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              {addedIds.length <= 0 ? (
                <div className="mb-2 flex w-full justify-end">
                  <button
                    type="button"
                    className="flex h-8 rounded bg-maintainerr-600 text-zinc-200 shadow-md hover:bg-maintainerr"
                    onClick={() => RuleAdded(sid)}
                    title={`Add a new rule to Section ${sid}`}
                  >
                    <DocumentAddIcon className="m-auto ml-5 h-5" />
                    <p className="button-text m-auto ml-1 mr-5 text-zinc-200">
                      Add Rule
                    </p>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )
      })}

      {addedIds.length <= 0 ? (
        <div className="mb-3 mt-3 flex w-full">
          <div className="m-auto xl:m-0">
            <button
              type="button"
              className="flex h-8 rounded bg-maintainerr-600 text-zinc-200 shadow-md hover:bg-maintainerr"
              onClick={addSection}
              title={`Add a new section`}
            >
              <ClipboardListIcon className="m-auto ml-5 h-5" />
              <p className="button-text m-auto ml-1 mr-5 text-zinc-200">
                New Section
              </p>
            </button>
          </div>
        </div>
      ) : undefined}

      {rulesCreated.length !== ruleAmount[1].reduce((pv, cv) => pv + cv) ? (
        <div className="mt-5">
          <Alert type="error">{`Some incomplete rules won't be saved`} </Alert>
        </div>
      ) : undefined}
    </div>
  )
}

export default RuleCreator
