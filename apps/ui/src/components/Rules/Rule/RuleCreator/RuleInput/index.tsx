import { TrashIcon } from '@heroicons/react/solid'
import {
  Application,
  type ArrDiskspaceResource,
  DISKSPACE_REMAINING_PROPERTY,
  DISKSPACE_TOTAL_PROPERTY,
  type MediaItemType,
  MediaType,
  normalizeDiskPath,
  RulePossibility,
  RulePossibilityTranslations,
} from '@maintainerr/contracts'
import { cloneDeep } from 'lodash-es'
import { FormEvent, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { IRule } from '../'
import {
  useRadarrDiskspace,
  useRuleConstants,
  useSonarrDiskspace,
} from '../../../../../api/rules'
import {
  IConstants,
  IProperty,
} from '../../../../../contexts/constants-context'
import { useMediaServerType } from '../../../../../hooks/useMediaServerType'
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
 * based on server selection and media server type
 */
const shouldFilterApplication = (
  appId: number,
  radarrSettingsId: number | null | undefined,
  sonarrSettingsId: number | null | undefined,
  isPlex: boolean,
  isJellyfin: boolean,
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
  // Filter out Plex/Tautulli if on Jellyfin
  if (
    isJellyfin &&
    (appId === Application.PLEX || appId === Application.TAUTULLI)
  ) {
    return true
  }
  // Filter out Jellyfin if on Plex
  if (isPlex && appId === Application.JELLYFIN) {
    return true
  }
  return false
}

const isArrDiskspaceProperty = (prop?: IProperty): boolean => {
  return (
    prop?.name === DISKSPACE_REMAINING_PROPERTY ||
    prop?.name === DISKSPACE_TOTAL_PROPERTY
  )
}

const isUnaryRuleAction = (action: RulePossibility | undefined): boolean => {
  return (
    action === RulePossibility.EXISTS || action === RulePossibility.NOT_EXISTS
  )
}

const getCustomValueState = (
  secondVal: string | undefined,
): {
  customValActive: boolean
  customValType: RuleType | undefined
} => {
  if (secondVal === CustomParams.CUSTOM_NUMBER) {
    return { customValActive: true, customValType: RuleType.NUMBER }
  }

  if (secondVal === CustomParams.CUSTOM_DATE) {
    return { customValActive: true, customValType: RuleType.DATE }
  }

  if (
    secondVal === CustomParams.CUSTOM_DAYS ||
    secondVal === CustomParams.CUSTOM_TEXT
  ) {
    return { customValActive: true, customValType: RuleType.TEXT }
  }

  if (secondVal === CustomParams.CUSTOM_TEXT_LIST) {
    return { customValActive: true, customValType: RuleType.TEXT_LIST }
  }

  if (secondVal === CustomParams.CUSTOM_BOOLEAN) {
    return { customValActive: true, customValType: RuleType.BOOL }
  }

  return { customValActive: false, customValType: undefined }
}

const buildDiskspaceOptions = (
  resources: ArrDiskspaceResource[] | undefined,
  includePathsWithoutAccurateTotals: boolean,
): Array<{ value: string; label: string }> => {
  const options = new Map<string, string>()

  for (const resource of resources ?? []) {
    if (!resource.path) continue
    if (
      !includePathsWithoutAccurateTotals &&
      resource.hasAccurateTotalSpace === false
    ) {
      continue
    }

    const normalizedPath = normalizeDiskPath(resource.path)
    const label = resource.label
      ? `${normalizedPath} (${resource.label})`
      : normalizedPath
    if (!options.has(normalizedPath)) {
      options.set(normalizedPath, label)
    }
  }

  return [...options.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.value.localeCompare(b.value))
}

const getPropFromTuple = (
  value: [number, number] | string,
  constants: IConstants | undefined,
): IProperty | undefined => {
  if (!constants) return undefined

  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  const application = constants.applications?.find((el) => el.id === +parsed[0])

  return application?.props.find((el) => el.id === +parsed[1])
}

interface InitialRuleState {
  operator: string | undefined
  firstVal: string | undefined
  action: RulePossibility | undefined
  secondVal: string | undefined
  customVal: string | undefined
  arrDiskPath: string
  ruleType: RuleType
}

const getInitialRuleState = (props: IRuleInput): InitialRuleState => {
  const isNewlyAdded = props.id && props.newlyAdded?.includes(props.id)
  const rule = isNewlyAdded ? undefined : props.editData?.rule

  if (!rule) {
    return {
      operator: undefined,
      firstVal: undefined,
      action: undefined,
      secondVal: undefined,
      customVal: undefined,
      arrDiskPath: '',
      ruleType: RuleType.NUMBER,
    }
  }

  const initialState: InitialRuleState = {
    operator: rule.operator?.toString(),
    firstVal: JSON.stringify(rule.firstVal),
    action: rule.action,
    secondVal: undefined,
    customVal: undefined,
    arrDiskPath: rule.arrDiskPath ? normalizeDiskPath(rule.arrDiskPath) : '',
    ruleType: RuleType.NUMBER,
  }

  if (rule.customVal) {
    switch (rule.customVal.ruleTypeId) {
      case 0:
        initialState.secondVal =
          (rule.customVal.value as number) % 86400 === 0 &&
          (rule.customVal.value as number) != 0
            ? CustomParams.CUSTOM_DAYS
            : CustomParams.CUSTOM_NUMBER
        initialState.ruleType = RuleType.NUMBER
        break
      case 1:
        initialState.secondVal = CustomParams.CUSTOM_DATE
        initialState.ruleType = RuleType.DATE
        break
      case 2:
        initialState.secondVal = CustomParams.CUSTOM_TEXT
        initialState.ruleType = RuleType.TEXT
        break
      case 3:
        initialState.secondVal = CustomParams.CUSTOM_BOOLEAN
        initialState.ruleType = RuleType.BOOL
        break
      case 4:
        initialState.secondVal = CustomParams.CUSTOM_TEXT_LIST
        initialState.ruleType = RuleType.TEXT_LIST
        break
    }
    initialState.customVal = rule.customVal.value.toString()
  } else {
    initialState.secondVal = JSON.stringify(rule.lastVal)
  }

  return initialState
}

const RuleInput = (props: IRuleInput) => {
  const [initialRuleState] = useState(() => getInitialRuleState(props))
  const [operator, setOperator] = useState<string | undefined>(
    initialRuleState.operator,
  )
  const [firstval, setFirstVal] = useState<string | undefined>(
    initialRuleState.firstVal,
  )
  const [action, setAction] = useState<RulePossibility | undefined>(
    initialRuleState.action,
  )
  const [secondVal, setSecondVal] = useState<string | undefined>(
    initialRuleState.secondVal,
  )

  const [customVal, setCustomVal] = useState<string | undefined>(
    initialRuleState.customVal,
  )
  const [arrDiskPath, setArrDiskPath] = useState<string>(
    initialRuleState.arrDiskPath,
  )

  const [possibilities, setPossibilities] = useState<RulePossibility[]>([])
  const [ruleType, setRuleType] = useState<RuleType>(initialRuleState.ruleType)

  const { data: constants, isLoading: constantsLoading } = useRuleConstants()
  const { isPlex, isJellyfin } = useMediaServerType()

  const firstValueTuple = useMemo<[number, number] | undefined>(() => {
    if (!firstval) return undefined
    return JSON.parse(firstval) as [number, number]
  }, [firstval])

  const selectedFirstValueAppId = firstValueTuple?.[0]
  const selectedFirstValueProp = firstval
    ? getPropFromTuple(firstval, constants)
    : undefined
  const isSelectedArrDiskspaceRule =
    (selectedFirstValueAppId === Application.RADARR ||
      selectedFirstValueAppId === Application.SONARR) &&
    isArrDiskspaceProperty(selectedFirstValueProp)

  const { data: radarrDiskspace = [], isLoading: radarrDiskspaceLoading } =
    useRadarrDiskspace(props.radarrSettingsId, {
      enabled:
        isSelectedArrDiskspaceRule &&
        selectedFirstValueAppId === Application.RADARR,
    })

  const { data: sonarrDiskspace = [], isLoading: sonarrDiskspaceLoading } =
    useSonarrDiskspace(props.sonarrSettingsId, {
      enabled:
        isSelectedArrDiskspaceRule &&
        selectedFirstValueAppId === Application.SONARR,
    })

  const isSelectedArrTotalDiskspaceRule =
    selectedFirstValueProp?.name === DISKSPACE_TOTAL_PROPERTY

  const arrDiskspaceOptions = useMemo(() => {
    if (selectedFirstValueAppId === Application.RADARR) {
      return buildDiskspaceOptions(
        radarrDiskspace,
        !isSelectedArrTotalDiskspaceRule,
      )
    }
    if (selectedFirstValueAppId === Application.SONARR) {
      return buildDiskspaceOptions(
        sonarrDiskspace,
        !isSelectedArrTotalDiskspaceRule,
      )
    }
    return []
  }, [
    isSelectedArrTotalDiskspaceRule,
    selectedFirstValueAppId,
    radarrDiskspace,
    sonarrDiskspace,
  ])

  const isDiskspaceLoading =
    selectedFirstValueAppId === Application.RADARR
      ? radarrDiskspaceLoading
      : selectedFirstValueAppId === Application.SONARR
        ? sonarrDiskspaceLoading
        : false

  const preservedArrDiskPathOption = useMemo(() => {
    if (!arrDiskPath) {
      return undefined
    }

    const normalizedPath = normalizeDiskPath(arrDiskPath)
    const hasMatchingOption = arrDiskspaceOptions.some(
      (option) => option.value === normalizedPath,
    )

    if (hasMatchingOption) {
      return undefined
    }

    return {
      value: normalizedPath,
      label: isSelectedArrTotalDiskspaceRule
        ? `${normalizedPath} (saved selection; total space unavailable)`
        : `${normalizedPath} (saved selection)`,
    }
  }, [arrDiskPath, arrDiskspaceOptions, isSelectedArrTotalDiskspaceRule])

  const { customValActive, customValType } = useMemo(
    () => getCustomValueState(secondVal),
    [secondVal],
  )

  const updateFirstValue = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setFirstVal(undefined)
      setArrDiskPath('')
    } else {
      setFirstVal(event.target.value)

      const nextProp = getPropFromTuple(event.target.value, constants)
      if (!isArrDiskspaceProperty(nextProp)) {
        setArrDiskPath('')
      }
    }
  }

  const updateSecondValue = (event: { target: { value: string } }) => {
    const nextSecondVal = event.target.value || undefined
    const nextCustomValueState = getCustomValueState(nextSecondVal)

    setSecondVal(nextSecondVal)

    if (nextSecondVal === CustomParams.CUSTOM_BOOLEAN) {
      setCustomVal((currentValue) =>
        currentValue === '0' ? currentValue : '1',
      )
      return
    }

    if (!nextCustomValueState.customValActive) {
      setCustomVal(undefined)
    }
  }

  const updateCustomValue = (event: { target: { value: string } }) => {
    if (secondVal === CustomParams.CUSTOM_DAYS) {
      setCustomVal((+event.target.value * 86400).toString())
    } else {
      setCustomVal(event.target.value)
    }
  }

  const updateArrDiskPath = (event: { target: { value: string } }) => {
    const value = event.target.value
    setArrDiskPath(value ? normalizeDiskPath(value) : '')
  }

  const updateAction = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setAction(undefined)
    } else {
      const nextAction = +event.target.value as RulePossibility
      setAction(nextAction)
      if (isUnaryRuleAction(nextAction)) {
        setSecondVal(undefined)
        setCustomVal(undefined)
      }
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

  const commitCurrentRule = () => {
    const requiresSecondValue = !isUnaryRuleAction(action)
    const hasSecondValue =
      !!secondVal &&
      secondVal !== CustomParams.CUSTOM_DATE &&
      secondVal !== CustomParams.CUSTOM_DAYS &&
      secondVal !== CustomParams.CUSTOM_NUMBER &&
      secondVal !== CustomParams.CUSTOM_TEXT &&
      secondVal !== CustomParams.CUSTOM_TEXT_LIST &&
      secondVal !== CustomParams.CUSTOM_BOOLEAN

    if (
      firstval &&
      action != null &&
      (!requiresSecondValue || hasSecondValue || !!customVal)
    ) {
      const ruleValues = {
        operator: operator ? operator : null,
        firstVal: JSON.parse(firstval),
        action,
        section: props.section ? props.section - 1 : 0,
        ...(isSelectedArrDiskspaceRule && arrDiskPath ? { arrDiskPath } : {}),
      }
      if (!requiresSecondValue) {
        props.onCommit(props.id ? props.id : 0, ruleValues)
      } else if (customVal) {
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

  const submitCurrentRule = useEffectEvent(() => {
    commitCurrentRule()
  })

  const syncFirstValueAvailability = useEffectEvent(() => {
    if (!constants || !firstval) {
      return
    }

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

    const val = JSON.parse(firstval)
    const appId = +val[0]
    const app = apps?.find((currentApp) => currentApp.id === appId)

    if (!app?.props.find((prop) => prop.id === +val[1])) {
      setFirstVal(undefined)
      setSecondVal(undefined)
      setCustomVal(undefined)
      setArrDiskPath('')
    }
  })

  const syncRuleTypeSelection = useEffectEvent(() => {
    if (!firstval) {
      return
    }

    const prop = getPropFromTuple(firstval, constants)

    if (!prop?.type.key) {
      return
    }

    if (possibilities.length <= 0) {
      setRuleType(+prop.type.key)
      setPossibilities(prop.type.possibilities)
      return
    }

    if (+prop.type.key !== ruleType) {
      setSecondVal(undefined)
      setCustomVal('')
      setRuleType(+prop.type.key)
      setPossibilities(prop.type.possibilities)
    }
  })

  const submit = (e: FormEvent | null) => {
    e?.preventDefault()
    commitCurrentRule()
  }

  useEffect(() => {
    submitCurrentRule()
  }, [
    action,
    arrDiskPath,
    customVal,
    customValActive,
    customValType,
    firstval,
    isSelectedArrDiskspaceRule,
    operator,
    ruleType,
    secondVal,
  ])

  useEffect(() => {
    syncFirstValueAvailability()
  }, [props.dataType, props.mediaType, constants, firstval])

  useEffect(() => {
    syncRuleTypeSelection()
  }, [constants, firstval, possibilities.length, ruleType])

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
        <h3 className="text-lg font-semibold text-maintainerr-600">
          {props.tagId
            ? `Rule #${props.tagId}`
            : props.id
              ? `Rule #${props.id}`
              : `Rule #1`}
        </h3>

        {props.allowDelete ? (
          <button
            className="flex items-center rounded-lg bg-error-600 px-3 py-1 text-zinc-100 shadow-md hover:bg-error-500"
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
            className="w-full rounded-lg p-2 text-zinc-100 focus:border-maintainerr focus:ring-maintainerr"
          >
            <option value="" className="text-maintainerr-600">
              Select First Value...
            </option>
            {constants.applications
              ?.filter(
                (app) =>
                  !shouldFilterApplication(
                    app.id,
                    props.radarrSettingsId,
                    props.sonarrSettingsId,
                    isPlex,
                    isJellyfin,
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
            className="w-full rounded-lg p-2 text-zinc-100 focus:border-maintainerr focus:ring-maintainerr"
          >
            <option value="" className="text-maintainerr-600">
              Select Action...
            </option>
            {possibilities.map((action) => (
              <option key={action} value={action}>
                {RulePossibilityTranslations[action]}
              </option>
            ))}
          </select>
        </div>

        {!isUnaryRuleAction(action) ? (
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
              className="w-full rounded-lg p-2 text-zinc-100 focus:border-maintainerr focus:ring-maintainerr"
            >
              <option value="" className="text-maintainerr-600">
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
                      isPlex,
                      isJellyfin,
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
        ) : null}

        {isSelectedArrDiskspaceRule ? (
          <div>
            <label
              htmlFor="arr_disk_path"
              className="mb-1 block text-sm font-medium"
            >
              Disk Target
            </label>
            <select
              name="arr_disk_path"
              id="arr_disk_path"
              onChange={updateArrDiskPath}
              value={arrDiskPath}
              className="w-full rounded-lg p-2 text-zinc-100 focus:border-maintainerr focus:ring-maintainerr"
            >
              <option value="">Aggregate (all paths)</option>
              {preservedArrDiskPathOption ? (
                <option
                  key={preservedArrDiskPathOption.value}
                  value={preservedArrDiskPathOption.value}
                >
                  {preservedArrDiskPathOption.label}
                </option>
              ) : null}
              {arrDiskspaceOptions.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
              {!isDiskspaceLoading &&
              !preservedArrDiskPathOption &&
              arrDiskspaceOptions.length === 0 ? (
                <option disabled value="__no_paths">
                  {isSelectedArrTotalDiskspaceRule
                    ? 'No disk paths with total space reported by ARR'
                    : 'No disk paths reported by ARR'}
                </option>
              ) : null}
            </select>
            {isSelectedArrTotalDiskspaceRule ? (
              <p className="mt-1 text-xs text-zinc-400">
                Total disk space only works for paths reported by ARR disk
                space. Root-folder fallback paths can still be used for
                remaining space, but they do not expose a reliable total size.
              </p>
            ) : null}
          </div>
        ) : null}

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
                placeholder={
                  ruleType === RuleType.TEXT_LIST ||
                  customValType === RuleType.TEXT_LIST
                    ? 'Value1 or ["Value1", "Value2"]'
                    : 'Text'
                }
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
