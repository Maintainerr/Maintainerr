import { ClipboardListIcon, DocumentAddIcon } from '@heroicons/react/solid'
import { useRef, useState } from 'react'
import { MediaType } from '../../../../contexts/constants-context'
import { EPlexDataType } from '../../../../utils/PlexDataType-enum'
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
  action: number
}

export interface ILoadedRule {
  uniqueID: number
  rules: IRule[]
}

interface iRuleCreator {
  mediaType?: MediaType
  dataType?: EPlexDataType
  editData?: { rules: IRule[] }
  onUpdate: (rules: IRule[]) => void
  onCancel: () => void
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
    props.editData && props.editData.rules.length > 0
      ? props.editData.rules[props.editData.rules.length - 1].section! + 1
      : undefined
  const initialRuleAmount: [number, number[]] = initialSections
    ? calculateRuleAmount(props.editData, initialSections)
    : [1, [1]]

  const [ruleAmount, setRuleAmount] =
    useState<[number, number[]]>(initialRuleAmount)
  const [editData, setEditData] = useState<{ rules: IRule[] } | undefined>(
    props.editData,
  )
  const [ruleAmountArr, setRuleAmountArr] = useState<[number[], [number[]]]>(
    calculateRuleAmountArr(initialRuleAmount),
  )
  const rulesCreated = useRef<IRulesToCreate[]>([])
  const deleted = useRef<number>(0)
  const added = useRef<number[]>(initialSections ? [] : [1])

  const ruleCommited = (id: number, rule: IRule) => {
    if (rulesCreated) {
      const rules = rulesCreated.current.filter((el) => el.id !== id)
      const toCommit = [...rules, { id: id, rule: rule }].sort(
        (a, b) => a.id - b.id,
      )
      rulesCreated.current = toCommit
      props.onUpdate(rulesCreated.current.map((el) => el.rule))
      added.current = added.current.filter((e) => e !== id)
    }
  }

  const ruleOmitted = (id: number) => {
    if (rulesCreated) {
      const rules = rulesCreated.current?.filter((el) => el.id !== id)
      rulesCreated.current = [...rules]
      props.onUpdate(rulesCreated.current.map((el) => el.rule))
    }
  }

  const ruleDeleted = (section = 0, id: number) => {
    if (rulesCreated.current.length > 0) {
      let rules = rulesCreated.current?.filter((el) => el.id !== id)
      const section1IsEmpty = !rules.some((r) => r.rule.section === 0)

      rules = rules.map((e) => {
        e.id = e.id > id ? e.id - 1 : e.id

        if (section1IsEmpty && section === 1 && e.rule.section) {
          e.rule.section -= 1
        }

        return e
      })
      rulesCreated.current = [...rules]
      props.onUpdate(rulesCreated.current.map((el) => el.rule))
    }

    added.current = added.current
      .filter((e) => e !== id)
      .map((e) => {
        return (e = e > id ? e - 1 : e)
      })
    setEditData({ rules: rulesCreated.current.map((el) => el.rule) })

    const rules = [...ruleAmount[1]]
    rules[section - 1] = rules[section - 1] - 1

    // Find sections that still contain rules
    const nonEmptySections = rules.filter((e) => e > 0)

    // Update the rule count while ensuring at least one section remains
    updateRuleAmount([
      nonEmptySections.length,
      nonEmptySections.length > 0 ? nonEmptySections : [1],
    ])

    deleted.current = deleted.current + 1
  }

  const RuleAdded = (section: number) => {
    const ruleId =
      ruleAmount[1].reduce((prev, cur, idx) =>
        idx + 1 <= section ? prev + cur : prev,
      ) + 1

    added.current = [...added.current, ruleId]

    rulesCreated.current.map((e) => {
      if (e.id >= ruleId) {
        e.id = e.id + 1
      }
      return e
    })

    const rules = [...ruleAmount[1]]
    rules[section - 1] = rules[section - 1] + 1

    updateRuleAmount([ruleAmount[0], rules])
  }

  const addSection = () => {
    const rules = [...ruleAmount[1]]
    rules.push(1)

    const ruleId =
      ruleAmount[1].reduce((prev, cur, idx) =>
        idx + 1 <= ruleAmount[0] + 1 ? prev + cur : prev,
      ) + 1
    added.current = [...added.current, ruleId]

    updateRuleAmount([ruleAmount[0] + 1, rules])
  }

  const updateRuleAmount = (ruleAmount: [number, number[]]) => {
    setRuleAmountArr(calculateRuleAmountArr(ruleAmount))
    setRuleAmount(ruleAmount)
  }

  return (
    <div className="text-zinc-100">
      {ruleAmountArr[0].map((sid) => {
        return (
          <div key={`${sid}-${deleted.current}`} className="mb-4">
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
                        newlyAdded={added.current}
                        mediaType={props.mediaType}
                        dataType={props.dataType}
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

              {added.current.length <= 0 ? (
                <div className="mb-2 flex w-full justify-end">
                  <button
                    type="button"
                    className="flex h-8 rounded bg-amber-600 text-zinc-200 shadow-md hover:bg-amber-500"
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

      {added.current.length <= 0 ? (
        <div className="mb-3 mt-3 flex w-full">
          <div className="m-auto xl:m-0">
            <button
              type="button"
              className="flex h-8 rounded bg-amber-600 text-zinc-200 shadow-md hover:bg-amber-500"
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

      {rulesCreated.current.length !==
      ruleAmount[1].reduce((pv, cv) => pv + cv) ? (
        <div className="max-width-form-head mt-5">
          <Alert>{`Some incomplete rules won't be saved`} </Alert>
        </div>
      ) : undefined}
    </div>
  )
}

export default RuleCreator
