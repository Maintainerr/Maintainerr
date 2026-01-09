import { TrashIcon } from '@heroicons/react/solid'
import {
  Application,
  type MediaItemType,
  MediaType,
  RulePossibility,
  RulePossibilityTranslations,
} from '@maintainerr/contracts'
import { cloneDeep } from 'lodash-es'
import { FormEvent, useEffect, useState } from 'react'
import { IRule } from '../'
import { useRuleConstants } from '../../../../../api/rules'
import { IProperty } from '../../../../../contexts/constants-context'
import LoadingSpinner from '../../../../Common/LoadingSpinner'

enum RuleType {
  NUMBER,
  DATE,
  TEXT,
  BOOL,
  TEXT_LIST,
}
enum RuleOperators {
  AND,
  OR,
}

enum CustomParams {
  CUSTOM_NUMBER = 'custom_number',
  CUSTOM_DAYS = 'custom_days',
  CUSTOM_DATE = 'custom_date',
  CUSTOM_TEXT = 'custom_text',
  CUSTOM_TEXT_LIST = 'custom_text_list',
  CUSTOM_BOOLEAN = 'custom_boolean',
}

interface IRuleInput {
  id?: number
  tagId?: number
  mediaType?: MediaType
  dataType?: MediaItemType
  section?: number
  newlyAdded?: number[]
  editData?: { rule: IRule }
  onCommit: (id: number, rule: IRule) => void
  onIncomplete: (id: number) => void
  onDelete: (section: number, id: number) => void
  allowDelete?: boolean
  radarrSettingsId?: number | null
  sonarrSettingsId?: number | null
}

/**
 * Helper function to determine if an application should be filtered out
 * based on server selection
 */
const shouldFilterApplication = (
  appId: number,
  radarrSettingsId: number | null | undefined,
  sonarrSettingsId: number | null | undefined,
): boolean => {
  // Filter out Radarr if no Radarr server is selected
  if (
    appId === Application.RADARR &&
    (radarrSettingsId === undefined || radarrSettingsId === null)
  ) {
    return true
  }
  // Filter out Sonarr if no Sonarr server is selected
  if (
    appId === Application.SONARR &&
    (sonarrSettingsId === undefined || sonarrSettingsId === null)
  ) {
    return true
  }
  return false
}

const RuleInput = (props: IRuleInput) => {
  const [operator, setOperator] = useState<string>()
  const [firstval, setFirstVal] = useState<string>()
  const [action, setAction] = useState<RulePossibility>()
  const [secondVal, setSecondVal] = useState<string>()

  const [customValType, setCustomValType] = useState<RuleType>()
  const [customVal, setCustomVal] = useState<string>()
  const [customValActive, setCustomValActive] = useState<boolean>(true)

  const [possibilities, setPossibilities] = useState<RulePossibility[]>([])
  const [ruleType, setRuleType] = useState<RuleType>(RuleType.NUMBER)

  const { data: constants, isLoading: constantsLoading } = useRuleConstants()

  useEffect(() => {
    if (props.editData?.rule) {
      setOperator(props.editData.rule.operator?.toString())
      setFirstVal(JSON.stringify(props.editData.rule.firstVal))
      setAction(props.editData.rule.action)

      if (props.editData.rule.customVal) {
        switch (props.editData.rule.customVal.ruleTypeId) {
          case 0:
            // TODO: improve this.. Currently this is a hack to determine if param is amount of days or really a number
            if (
              (props.editData.rule.customVal.value as number) % 86400 === 0 &&
              (props.editData.rule.customVal.value as number) != 0
            ) {
              setSecondVal(CustomParams.CUSTOM_DAYS)
              setRuleType(RuleType.NUMBER)
            } else {
              setSecondVal(CustomParams.CUSTOM_NUMBER)
              setRuleType(RuleType.NUMBER)
            }
            break
          case 1:
            setSecondVal(CustomParams.CUSTOM_DATE)
            setRuleType(RuleType.DATE)
            break
          case 2:
            setSecondVal(CustomParams.CUSTOM_TEXT)
            setRuleType(RuleType.TEXT)
            break
          case 3:
            setSecondVal(CustomParams.CUSTOM_BOOLEAN)
            setRuleType(RuleType.BOOL)
            break
          case 4:
            setSecondVal(CustomParams.CUSTOM_TEXT_LIST)
            setRuleType(RuleType.TEXT_LIST)
            break
        }
        setCustomVal(props.editData.rule.customVal.value.toString())
      } else {
        setSecondVal(JSON.stringify(props.editData.rule.lastVal))
      }
      if (
        props.id &&
        props.newlyAdded &&
        props.newlyAdded?.includes(props.id)
      ) {
        setOperator(undefined)
        setFirstVal(undefined)
        setAction(undefined)
        setSecondVal(undefined)
        setCustomVal(undefined)
      }
    }
  }, [])

  const updateFirstValue = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setFirstVal(undefined)
    } else {
      setFirstVal(event.target.value)
    }
  }

  const updateSecondValue = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setSecondVal(undefined)
    } else {
      setSecondVal(event.target.value)
    }
  }

  const updateCustomValue = (event: { target: { value: string } }) => {
    if (secondVal === CustomParams.CUSTOM_DAYS) {
      setCustomVal((+event.target.value * 86400).toString())
    } else {
      setCustomVal(event.target.value)
    }
  }

  const updateAction = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setAction(undefined)
    } else {
      setAction(+event.target.value)
    }
  }

  const updateOperator = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setOperator(undefined)
    } else {
      setOperator(event.target.value)
    }
  }

  const onDelete = (e: FormEvent | null) => {
    e?.preventDefault()
    props.onDelete(props.section ? props.section : 0, props.id ? props.id : 0)
  }

  const submit = (e: FormEvent | null) => {
    e?.preventDefault()

    if (
      firstval &&
      action != null &&
      ((secondVal &&
        secondVal !== CustomParams.CUSTOM_DATE &&
        secondVal !== CustomParams.CUSTOM_DAYS &&
        secondVal !== CustomParams.CUSTOM_NUMBER &&
        secondVal !== CustomParams.CUSTOM_TEXT &&
        secondVal !== CustomParams.CUSTOM_TEXT_LIST &&
        secondVal !== CustomParams.CUSTOM_BOOLEAN) ||
        customVal)
    ) {
      const ruleValues = {
        operator: operator ? operator : null,
        firstVal: JSON.parse(firstval),
        action,
        section: props.section ? props.section - 1 : 0,
      }
      if (customVal) {
        props.onCommit(props.id ? props.id : 0, {
          customVal: {
            ruleTypeId: customValActive
              ? customValType === RuleType.DATE
                ? customValType
                : customValType === RuleType.NUMBER
                  ? customValType
                  : customValType === RuleType.TEXT &&
                      secondVal === CustomParams.CUSTOM_DAYS
                    ? RuleType.NUMBER
                    : customValType === RuleType.TEXT
                      ? customValType
                      : customValType === RuleType.BOOL
                        ? customValType
                        : customValType === RuleType.TEXT_LIST
                          ? customValType
                          : +ruleType
              : +ruleType,
            value: customVal,
          },
          ...ruleValues,
        })
      } else {
        props.onCommit(props.id ? props.id : 0, {
          lastVal: JSON.parse(secondVal!),
          ...ruleValues,
        })
      }
    } else {
      props.onIncomplete(props.id ? props.id : 0)
    }
  }

  useEffect(() => {
    submit(null)
  }, [secondVal, customVal, operator, action, firstval, customValType])

  useEffect(() => {
    if (!constants) return

    // reset firstval & secondval in case of type switch & choices don't exist
    const apps = cloneDeep(constants.applications)?.map((app) => {
      app.props = app.props.filter((prop) => {
        return (
          (prop.mediaType === MediaType.BOTH ||
            props.mediaType === prop.mediaType) &&
          (props.mediaType === MediaType.MOVIE ||
            prop.showType === undefined ||
            prop.showType.includes(props.dataType!))
        )
      })
      return app
    })
    if (firstval) {
      const val = JSON.parse(firstval)
      const appId = val[0]
      // Find application by ID instead of using array index
      const app = apps?.find((a) => a.id === appId)
      if (!app?.props.find((el) => el.id === val[1])) {
        setFirstVal(undefined)
      }
    }
  }, [props.dataType, props.mediaType, constants])

  useEffect(() => {
    if (firstval) {
      const prop = getPropFromTuple(firstval)

      if (prop?.type.key) {
        if (possibilities.length <= 0) {
          setRuleType(+prop?.type.key)
          setPossibilities(prop.type.possibilities)
        } else if (+prop.type.key !== ruleType) {
          setSecondVal(undefined)
          setCustomVal('')
          setRuleType(+prop?.type.key)
          setPossibilities(prop.type.possibilities)
        }
      }
    }
  }, [firstval])

  useEffect(() => {
    if (secondVal) {
      if (secondVal === CustomParams.CUSTOM_NUMBER) {
        setCustomValActive(true)
        setCustomValType(RuleType.NUMBER)
      } else if (secondVal === CustomParams.CUSTOM_DATE) {
        setCustomValActive(true)
        setCustomValType(RuleType.DATE)
      } else if (secondVal === CustomParams.CUSTOM_DAYS) {
        setCustomValActive(true)
        setCustomValType(RuleType.TEXT)
      } else if (secondVal === CustomParams.CUSTOM_TEXT) {
        setCustomValActive(true)
        setCustomValType(RuleType.TEXT)
      } else if (secondVal === CustomParams.CUSTOM_TEXT_LIST) {
        setCustomValActive(true)
        setCustomValType(RuleType.TEXT_LIST)
      } else if (secondVal === CustomParams.CUSTOM_BOOLEAN) {
        setCustomValActive(true)
        setCustomValType(RuleType.BOOL)
        if (customVal !== '0') {
          setCustomVal('1')
        }
      } else {
        setCustomValActive(false)
        setCustomVal(undefined)
      }
    }
  }, [secondVal])

  const getPropFromTuple = (
    value: [number, number] | string,
  ): IProperty | undefined => {
    if (!constants) return undefined

    if (typeof value === 'string') {
      value = JSON.parse(value)
    }
    const application = constants.applications?.find(
      (el) => el.id === +value[0],
    )

    const prop = application?.props.find((el) => {
      return el.id === +value[1]
    })
    return prop
  }

  if (!constants || constantsLoading) {
    return <LoadingSpinner />
  }

  return (
    <div
      className="w-full rounded-2xl bg-zinc-800 p-4 text-zinc-100 shadow-lg"
      onSubmit={submit}
    >
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-amber-600">
          {props.tagId
            ? `Rule #${props.tagId}`
            : props.id
              ? `Rule #${props.id}`
              : `Rule #1`}
        </h3>

        {props.allowDelete ? (
          <button
            className="flex items-center rounded-lg bg-red-600 px-3 py-1 text-zinc-100 shadow-md hover:bg-red-500"
            onClick={onDelete}
            title={`Remove rule ${props.tagId}, section ${props.section}`}
          >
            <TrashIcon className="mr-1 h-5 w-5" />
            Delete
          </button>
        ) : null}
      </div>

      {props.id !== 1 ? (
        (props.id && props.id > 0) || (props.section && props.section > 1) ? (
          <div className="mb-3 mt-2 md:flex md:items-center">
            {!props.id || (props.tagId ? props.tagId === 1 : props.id === 1) ? (
              <label htmlFor="operator">Section Operator</label>
            ) : (
              <label htmlFor="operator">Operator</label>
            )}
            <div className="md:ml-4">
              <div className="flex w-1/2 md:w-fit">
                <select
                  name="operator"
                  id="operator"
                  onChange={updateOperator}
                  value={operator}
                >
                  <option value=""> </option>
                  {Object.keys(RuleOperators).map(
                    (value: string, key: number) => {
                      if (!isNaN(+value)) {
                        return (
                          <option key={key} value={key}>
                            {RuleOperators[key]}
                          </option>
                        )
                      }
                    },
                  )}
                </select>
              </div>
            </div>
          </div>
        ) : undefined
      ) : undefined}

      {/* First Value Selection */}
      <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-3 md:grid-cols-2">
        <div>
          <label htmlFor="first_val" className="block text-sm font-medium">
            First Value
          </label>
          <select
            name="first_val"
            id="first_val"
            onChange={updateFirstValue}
            value={firstval}
            className="w-full rounded-lg p-2 text-zinc-100 focus:border-amber-500 focus:ring-amber-500"
          >
            <option value="" className="text-amber-600">
              Select First Value...
            </option>
            {constants.applications
              ?.filter(
                (app) =>
                  !shouldFilterApplication(
                    app.id,
                    props.radarrSettingsId,
                    props.sonarrSettingsId,
                  ),
              )
              .map((app) =>
                app.mediaType === MediaType.BOTH ||
                props.mediaType === app.mediaType ? (
                  <optgroup key={app.id} label={app.name}>
                    {app.props.map((prop) =>
                      (prop.mediaType === MediaType.BOTH ||
                        props.mediaType === prop.mediaType) &&
                      (props.mediaType === MediaType.MOVIE ||
                        prop.showType === undefined ||
                        prop.showType.includes(props.dataType!)) ? (
                        <option
                          key={`${app.id}-${prop.id}`}
                          value={JSON.stringify([app.id, prop.id])}
                        >
                          {`${app.name} - ${prop.humanName}`}
                        </option>
                      ) : null,
                    )}
                  </optgroup>
                ) : null,
              )}
          </select>
        </div>

        {/* Action Selection */}
        <div>
          <label htmlFor="action" className="mb-1 block text-sm font-medium">
            Action
          </label>
          <select
            name="action"
            id="action"
            onChange={updateAction}
            value={action}
            className="w-full rounded-lg p-2 text-zinc-100 focus:border-amber-500 focus:ring-amber-500"
          >
            <option value="" className="text-amber-600">
              Select Action...
            </option>
            {possibilities.map((action) => (
              <option key={action} value={action}>
                {RulePossibilityTranslations[action]}
              </option>
            ))}
          </select>
        </div>

        {/* Second Value Selection */}
        <div>
          <label
            htmlFor="second_val"
            className="mb-1 block text-sm font-medium"
          >
            Second Value
          </label>
          <select
            name="second_val"
            id="second_val"
            onChange={updateSecondValue}
            value={secondVal}
            className="w-full rounded-lg p-2 text-zinc-100 focus:border-amber-500 focus:ring-amber-500"
          >
            <option value="" className="text-amber-600">
              Select Second Value...
            </option>
            <optgroup label="Custom values">
              {ruleType === RuleType.DATE ? (
                <>
                  <option value={CustomParams.CUSTOM_DAYS}>
                    Amount of days
                  </option>
                  {action != null &&
                  action !== RulePossibility.IN_LAST &&
                  action !== RulePossibility.IN_NEXT ? (
                    <option value={CustomParams.CUSTOM_DATE}>
                      Specific date
                    </option>
                  ) : undefined}
                </>
              ) : undefined}
              {ruleType === RuleType.NUMBER ? (
                <option value={CustomParams.CUSTOM_NUMBER}>Number</option>
              ) : undefined}
              {ruleType === RuleType.BOOL ? (
                <option value={CustomParams.CUSTOM_BOOLEAN}>Boolean</option>
              ) : undefined}
              {ruleType === RuleType.TEXT ? (
                <option value={CustomParams.CUSTOM_TEXT}>Text</option>
              ) : undefined}
              <MaybeTextListOptions ruleType={ruleType} action={action} />
            </optgroup>
            {constants.applications
              ?.filter(
                (app) =>
                  !shouldFilterApplication(
                    app.id,
                    props.radarrSettingsId,
                    props.sonarrSettingsId,
                  ),
              )
              .map((app) => {
                return (app.mediaType === MediaType.BOTH ||
                  props.mediaType === app.mediaType) &&
                  action != null &&
                  action !== RulePossibility.IN_LAST &&
                  action !== RulePossibility.IN_NEXT ? (
                  <optgroup key={app.id} label={app.name}>
                    {app.props.map((prop) => {
                      // Add valid application-specific second values. Note that the second value
                      // type may be different to the rule type - e.g. a rule type of "text list"
                      // may be able to be matched to values of type "text list" as well as "text".
                      const secondValueTypes = getSecondValueTypes(ruleType)
                      for (const type of secondValueTypes) {
                        if (+prop.type.key === type) {
                          return (prop.mediaType === MediaType.BOTH ||
                            props.mediaType === prop.mediaType) &&
                            (props.mediaType === MediaType.MOVIE ||
                              prop.showType === undefined ||
                              prop.showType.includes(props.dataType!)) ? (
                            <option
                              key={app.id + 10 + prop.id}
                              value={JSON.stringify([app.id, prop.id])}
                            >{`${app.name} - ${prop.humanName}`}</option>
                          ) : undefined
                        }
                      }
                    })}
                  </optgroup>
                ) : undefined
              })}
          </select>
        </div>

        {/* Custom Value Input */}
        {customValActive ? (
          <div className="mb-2">
            <label
              htmlFor="custom_val"
              className="mb-1 block text-sm font-medium"
            >
              Custom Value
            </label>
            {customValType === RuleType.TEXT &&
            secondVal === CustomParams.CUSTOM_DAYS ? (
              <input
                type="number"
                name="custom_val"
                id="custom_val"
                onChange={updateCustomValue}
                value={customVal ? +customVal / 86400 : undefined}
                placeholder="Amount of days"
              ></input>
            ) : (customValType === RuleType.TEXT &&
                secondVal === CustomParams.CUSTOM_TEXT) ||
              customValType === RuleType.TEXT_LIST ? (
              <input
                type="text"
                name="custom_val"
                id="custom_val"
                onChange={updateCustomValue}
                value={customVal}
                placeholder="Text"
              ></input>
            ) : customValType === RuleType.DATE ? (
              <input
                type="date"
                name="custom_val"
                id="custom_val"
                onChange={updateCustomValue}
                value={customVal}
                placeholder="Date"
              ></input>
            ) : customValType === RuleType.BOOL ? (
              <select
                name="custom_val"
                id="custom_val"
                onChange={updateCustomValue}
                value={customVal}
              >
                <option value={1}>True</option>
                <option value={0}>False</option>
              </select>
            ) : (
              <input
                type="number"
                name="custom_val"
                id="custom_val"
                onChange={updateCustomValue}
                value={customVal}
                placeholder="Number"
              ></input>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Returns a list of types that are valid to be matched against a given first value type. */
function getSecondValueTypes(firstType: RuleType) {
  if (firstType === RuleType.TEXT_LIST || firstType === RuleType.TEXT) {
    return [RuleType.TEXT, RuleType.TEXT_LIST]
  }
  return [firstType]
}

function MaybeTextListOptions({
  ruleType,
  action,
}: {
  ruleType: RuleType
  action: RulePossibility | undefined
}) {
  if (action == null || ruleType !== RuleType.TEXT_LIST) {
    return
  }

  if (
    [
      RulePossibility.COUNT_EQUALS,
      RulePossibility.COUNT_NOT_EQUALS,
      RulePossibility.COUNT_BIGGER,
      RulePossibility.COUNT_SMALLER,
    ].includes(action)
  ) {
    return <option value={CustomParams.CUSTOM_NUMBER}>Count (number)</option>
  }

  return (
    <>
      <option value={CustomParams.CUSTOM_TEXT}>Text</option>
      {/* This was accidentally shipped - we keep it as a hidden option so that it still appears in
          the UI if somebody had already selected it, but we don't want it to be able to be selected
          in new rules. We should run a migration at some point to update all
          "customValue { type: 'text list' }" to "customValue { type: text }". */}
      <option hidden value={CustomParams.CUSTOM_TEXT_LIST}>
        Text (legacy list option)
      </option>
    </>
  )
}

export default RuleInput
