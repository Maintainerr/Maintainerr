import { CloudDownloadIcon } from '@heroicons/react/outline'
import {
  BanIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentDuplicateIcon,
  DownloadIcon,
  QuestionMarkCircleIcon,
  SaveIcon,
  UploadIcon,
} from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Application,
  MediaItemType,
  MediaLibrary,
} from '@maintainerr/contracts'
import { isValidCron } from 'cron-validator'
import { useState, useSyncExternalStore } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { z } from 'zod'
import { IRuleGroup } from '..'
import { useMediaServerLibraries } from '../../../../api/media-server'
import {
  RuleGroupCreatePayload,
  useCreateRuleGroup,
  useRuleConstants,
  useUpdateRuleGroup,
} from '../../../../api/rules'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import { PostApiHandler } from '../../../../utils/ApiHandler'
import { logClientError } from '../../../../utils/ClientLogger'
import Alert from '../../../Common/Alert'
import Button from '../../../Common/Button'
import CommunityRuleModal from '../../../Common/CommunityRuleModal'
import LoadingSpinner from '../../../Common/LoadingSpinner'
import YamlImporterModal from '../../../Common/YamlImporterModal'
import { AgentConfiguration } from '../../../Settings/Notifications/CreateNotificationModal'
import RuleCreator, { IRule } from '../../Rule/RuleCreator'
import ArrAction from './ArrAction'
import ConfigureNotificationModal from './ConfigureNotificationModal'

interface AddModal {
  editData?: IRuleGroup
  isCloneMode?: boolean
  onCancel: () => void
  onSuccess: () => void
}

// Helper function to check if an app should be filtered
const shouldFilterApp = (
  appId: number,
  radarrId: number | null | undefined,
  sonarrId: number | null | undefined,
): boolean => {
  if (
    appId === Application.RADARR &&
    (radarrId === undefined || radarrId === null)
  ) {
    return true
  }
  if (
    appId === Application.SONARR &&
    (sonarrId === undefined || sonarrId === null)
  ) {
    return true
  }
  return false
}

// Filter rules that reference deselected *arr servers
const filterRulesForArrSettings = (
  rules: IRule[],
  radarrId: number | null | undefined,
  sonarrId: number | null | undefined,
): IRule[] => {
  return rules.filter((rule) => {
    if (shouldFilterApp(+rule.firstVal[0], radarrId, sonarrId)) return false
    if (
      rule.lastVal &&
      Array.isArray(rule.lastVal) &&
      shouldFilterApp(+rule.lastVal[0], radarrId, sonarrId)
    ) {
      return false
    }
    return true
  })
}

// Scroll detection using useSyncExternalStore (no useEffect needed)
const scrollStore = {
  subscribe: (callback: () => void) => {
    window.addEventListener('scroll', callback)
    return () => window.removeEventListener('scroll', callback)
  },
  getSnapshot: () =>
    window.innerHeight + window.scrollY >= document.body.offsetHeight - 50,
  getServerSnapshot: () => false,
}

const numberOrUndefined = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) {
    return undefined
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? undefined : value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }

  return value as number | undefined
}

const ruleGroupFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string().optional(),
    libraryId: z.string().trim().min(1, 'Library is required'),
    dataType: z.string().trim().min(1, 'Media type is required'),
    arrAction: z
      .preprocess(
        numberOrUndefined,
        z.number().int('Invalid action').optional(),
      )
      .optional(),
    deleteAfterDays: z
      .preprocess(
        numberOrUndefined,
        z
          .number()
          .int('Take action after days must be a whole number')
          .min(0, 'Take action after days must be 0 or greater')
          .optional(),
      )
      .optional(),
    keepLogsForMonths: z.preprocess(
      numberOrUndefined,
      z
        .number()
        .int('Keep logs for months must be a whole number')
        .min(0, 'Keep logs for months must be 0 or greater'),
    ),
    tautulliWatchedPercentOverride: z
      .preprocess(
        numberOrUndefined,
        z
          .number()
          .int('Tautulli watched percent override must be a whole number')
          .min(0, 'Minimum is 0')
          .max(100, 'Maximum is 100')
          .optional(),
      )
      .optional(),
    showRecommended: z.boolean(),
    showHome: z.boolean(),
    listExclusions: z.boolean(),
    forceOverseerr: z.boolean(),
    manualCollection: z.boolean(),
    manualCollectionName: z.string().optional(),
    sortTitle: z.string().optional(),
    active: z.boolean(),
    useRules: z.boolean(),
    radarrSettingsId: z.number().int().nullable().optional(),
    sonarrSettingsId: z.number().int().nullable().optional(),
    ruleHandlerCronSchedule: z.preprocess(
      (val) => (val === '' ? null : val),
      z
        .string()
        .refine((val) => (val != null ? isValidCron(val) : true), {
          message: 'Invalid cron schedule',
        })
        .nullable(),
    ),
  })
  .refine(
    (data) =>
      !data.manualCollection ||
      (data.manualCollectionName ?? '').trim().length > 0,
    {
      path: ['manualCollectionName'],
      message: 'Custom collection name is required',
    },
  )
  .superRefine((data, ctx) => {
    if (
      data.radarrSettingsId === undefined &&
      data.sonarrSettingsId === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['radarrSettingsId'],
        message: 'Select an *arr server',
      })
      ctx.addIssue({
        code: 'custom',
        path: ['sonarrSettingsId'],
        message: 'Select an *arr server',
      })
    }
  })
  .refine(
    (data) =>
      data.arrAction === undefined ||
      data.arrAction === 4 ||
      data.deleteAfterDays !== undefined,
    {
      path: ['deleteAfterDays'],
      message: 'Take action after days is required for this action',
    },
  )

type RuleGroupFormValues = z.infer<typeof ruleGroupFormSchema>
type RuleGroupFormInput = z.input<typeof ruleGroupFormSchema>
type RuleGroupFormOutput = z.output<typeof ruleGroupFormSchema>

const buildFormDefaults = (editData?: IRuleGroup): RuleGroupFormValues => ({
  name: editData?.name ?? '',
  description: editData?.description ?? '',
  libraryId: editData?.libraryId ? editData.libraryId.toString() : '',
  dataType: editData?.dataType ? editData.dataType.toString() : '',
  arrAction: editData?.collection?.arrAction ?? undefined,
  deleteAfterDays: editData?.collection?.deleteAfterDays ?? undefined,
  keepLogsForMonths: editData?.collection?.keepLogsForMonths ?? 6,
  tautulliWatchedPercentOverride:
    editData?.collection?.tautulliWatchedPercentOverride ?? undefined,
  showRecommended: editData?.collection?.visibleOnRecommended ?? true,
  showHome: editData?.collection?.visibleOnHome ?? true,
  listExclusions: editData?.collection?.listExclusions ?? true,
  forceOverseerr: editData?.collection?.forceOverseerr ?? false,
  manualCollection: editData?.collection?.manualCollection ?? false,
  manualCollectionName: editData?.collection?.manualCollectionName ?? '',
  sortTitle: editData?.collection?.sortTitle ?? '',
  active: editData?.isActive ?? true,
  useRules: editData?.useRules ?? true,
  radarrSettingsId: editData
    ? (editData.collection?.radarrSettingsId ?? null)
    : undefined,
  sonarrSettingsId: editData
    ? (editData.collection?.sonarrSettingsId ?? null)
    : undefined,
  ruleHandlerCronSchedule: editData?.ruleHandlerCronSchedule ?? null,
})

const AddModal = (props: AddModal) => {
  const navigate = useNavigate()
  const { isPlex, isJellyfin } = useMediaServerType()
  const mediaServerName = isPlex
    ? 'Plex'
    : isJellyfin
      ? 'Jellyfin'
      : 'your media server'
  // Both Plex and Jellyfin call them "Collections" in their GUI
  // (Jellyfin's internal API type is "BoxSet" but the user-facing term is "Collection")
  const collectionTerm = 'collection'
  const collectionTermCapitalized = 'Collection'
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RuleGroupFormInput, any, RuleGroupFormOutput>({
    resolver: zodResolver(ruleGroupFormSchema),
    defaultValues: buildFormDefaults(props.editData),
  })

  const {
    mutateAsync: createRuleGroup,
    isError: isCreateError,
    isPending: isCreatePending,
  } = useCreateRuleGroup()
  const {
    mutateAsync: updateRuleGroup,
    isError: isUpdateError,
    isPending: isUpdatePending,
  } = useUpdateRuleGroup()

  const selectedLibraryId = useWatch({ control, name: 'libraryId' }) ?? ''
  const selectedType = useWatch({ control, name: 'dataType' }) ?? ''
  // dataType is now stored as MediaItemType string ('movie', 'show', 'season', 'episode')
  const selectedLibraryType: undefined | 'movie' | 'show' = selectedType
    ? selectedType === 'movie'
      ? 'movie'
      : 'show'
    : undefined

  const manualCollectionEnabled = useWatch({
    control,
    name: 'manualCollection',
  })
  const useRulesEnabled = useWatch({ control, name: 'useRules' })
  const arrActionValue = useWatch({ control, name: 'arrAction' }) as
    | number
    | undefined
  const radarrSettingsId = useWatch({ control, name: 'radarrSettingsId' }) as
    | number
    | null
    | undefined
  const sonarrSettingsId = useWatch({ control, name: 'sonarrSettingsId' }) as
    | number
    | null
    | undefined
  const [showCommunityModal, setShowCommunityModal] = useState(false)
  const [yamlImporterModal, setYamlImporterModal] = useState(false)
  const [configureNotificionModal, setConfigureNotificationModal] =
    useState(false)

  const [yaml, setYaml] = useState<string | undefined>(undefined)
  const [
    configuredNotificationConfigurations,
    setConfiguredNotificationConfigurations,
  ] = useState<AgentConfiguration[]>(
    props.editData?.notifications ? props.editData?.notifications : [],
  )
  const [rules, setRules] = useState<IRule[]>(
    props.editData?.rules
      ? props.editData.rules.map((r) => JSON.parse(r.ruleJson) as IRule)
      : [],
  )
  const [formIncomplete, setFormIncomplete] = useState<boolean>(false)
  const [ruleCreatorVersion, setRuleCreatorVersion] = useState<number>(1)

  const { data: libraries, isLoading: librariesLoading } =
    useMediaServerLibraries()

  const { data: constants, isLoading: constantsLoading } = useRuleConstants()

  // Scroll detection without useEffect
  const atBottom = useSyncExternalStore(
    scrollStore.subscribe,
    scrollStore.getSnapshot,
    scrollStore.getServerSnapshot,
  )

  const tautulliEnabled =
    constants?.applications?.some((x) => x.id == Application.TAUTULLI) ?? false
  const overseerrEnabled =
    constants?.applications?.some((x) => x.id == Application.OVERSEERR) ?? false

  function updateLibraryId(value: string) {
    if (!libraries) {
      throw new Error('Libraries not loaded')
    }

    const lib = libraries.find((el: MediaLibrary) => el.id === value)

    if (lib) {
      // Store MediaItemType string directly ('movie' or 'show')
      setValue('dataType', lib.type)
    }

    setValue('radarrSettingsId', undefined)
    setValue('sonarrSettingsId', undefined)
    updateArrOption(0)

    // Clear rules that reference *arr servers since we're resetting them
    const filtered = filterRulesForArrSettings(rules, undefined, undefined)
    if (filtered.length !== rules.length) {
      setRules(filtered)
      setRuleCreatorVersion((v) => v + 1)
    }
  }

  function updateArrOption(value: number | undefined) {
    setValue('arrAction', value)

    if (value === undefined || value === 4) {
      setValue('deleteAfterDays', undefined)
    } else if (getValues('deleteAfterDays') === undefined) {
      setValue('deleteAfterDays', 30)
    }
  }

  const handleUpdateArrAction = (
    type: 'Radarr' | 'Sonarr',
    arrAction: number,
    settingId?: number | null,
  ) => {
    updateArrOption(arrAction)

    const newRadarrId = type === 'Radarr' ? settingId : undefined
    const newSonarrId = type === 'Sonarr' ? settingId : undefined

    setValue('radarrSettingsId', newRadarrId)
    setValue('sonarrSettingsId', newSonarrId)

    // Filter out rules that reference the deselected *arr server
    const filtered = filterRulesForArrSettings(rules, newRadarrId, newSonarrId)
    if (filtered.length !== rules.length) {
      setRules(filtered)
      setRuleCreatorVersion((v) => v + 1)
    }
  }

  function updateRules(rules: IRule[]) {
    setRules(rules)
  }

  const toggleCommunityRuleModal = () => {
    if (selectedLibraryType == null) {
      alert('Please select a library first.')
    } else {
      setShowCommunityModal(!showCommunityModal)
    }
  }

  const toggleYamlExporter = async () => {
    const response = await PostApiHandler('/rules/yaml/encode', {
      rules: JSON.stringify(rules),
      mediaType: selectedType,
    })

    if (response.code === 1) {
      setYaml(response.result)

      if (!yamlImporterModal) {
        setYamlImporterModal(true)
      } else {
        setYamlImporterModal(false)
      }
    }
  }

  const toggleYamlImporter = () => {
    if (selectedLibraryType == null) {
      alert('Please select a library first.')
    } else {
      setYaml(undefined)
      if (!yamlImporterModal) {
        setYamlImporterModal(true)
      } else {
        setYamlImporterModal(false)
      }
    }
  }

  const importRulesFromYaml = async (yaml: string) => {
    const response = await PostApiHandler('/rules/yaml/decode', {
      yaml: yaml,
      mediaType: selectedType,
    })

    if (response && response.code === 1) {
      const result: { mediaType: string; rules: IRule[] } = JSON.parse(
        response.result,
      )
      handleLoadRulesFromYaml(result.rules)
      toast.success('Successfully imported rules from Yaml.', {
        autoClose: 5000,
      })
    } else {
      toast.error(response.message, { autoClose: 5000 })
    }
  }

  const handleLoadRulesFromCommunity = async (rules: IRule[]) => {
    // Migrate rules to the configured media server before displaying
    const response = await PostApiHandler('/rules/migrate', {
      rules: JSON.stringify(rules),
    })

    if (response && response.code === 1) {
      const migratedRules = JSON.parse(response.result) as IRule[]
      updateRules(migratedRules)
    } else {
      // If migration fails, use original rules
      updateRules(rules)
    }
    setRuleCreatorVersion((v) => v + 1)
    setShowCommunityModal(false)
  }

  const handleLoadRulesFromYaml = (rules: IRule[]) => {
    // YAML decode already migrates rules on the backend
    updateRules(rules)
    setRuleCreatorVersion((v) => v + 1)
  }

  const cancel = () => {
    props.onCancel()
  }

  const onSubmit = async (data: RuleGroupFormOutput) => {
    if (data.useRules && rules.length === 0) {
      setFormIncomplete(true)
      return
    }

    setFormIncomplete(false)

    const creationObj: RuleGroupCreatePayload = {
      name: data.name,
      description: data.description ?? '',
      libraryId: data.libraryId,
      arrAction: data.arrAction ?? 0,
      dataType: data.dataType as MediaItemType,
      isActive: data.active,
      useRules: data.useRules,
      listExclusions: data.listExclusions,
      forceOverseerr: data.forceOverseerr,
      tautulliWatchedPercentOverride: data.tautulliWatchedPercentOverride,
      radarrSettingsId: data.radarrSettingsId ?? undefined,
      sonarrSettingsId: data.sonarrSettingsId ?? undefined,
      collection: {
        visibleOnRecommended: data.showRecommended,
        visibleOnHome: data.showHome,
        deleteAfterDays:
          data.arrAction === undefined || data.arrAction === 4
            ? undefined
            : data.deleteAfterDays,
        manualCollection: data.manualCollection,
        manualCollectionName:
          data.manualCollectionName ?? `My custom ${collectionTerm}`,
        keepLogsForMonths: data.keepLogsForMonths,
        sortTitle: data.sortTitle?.trim() ? data.sortTitle : undefined,
      },
      rules: data.useRules ? rules : [],
      notifications: configuredNotificationConfigurations,
      ruleHandlerCronSchedule: data.ruleHandlerCronSchedule,
    }

    try {
      if (props.editData && !props.isCloneMode) {
        await updateRuleGroup({
          id: props.editData.id,
          ...creationObj,
        })
      } else {
        await createRuleGroup(creationObj)
      }

      props.onSuccess()
    } catch (mutationError) {
      void logClientError(
        'Failed to save rule group',
        mutationError,
        'RuleGroup.AddModal.handleSave',
      )
      toast.error('Failed to save rule group. Check logs for details.')
    }
  }

  const handleClone = () => {
    if (props.editData && !props.isCloneMode) {
      navigate(`/rules/clone/${props.editData.id}`)
    }
  }

  if (librariesLoading || constantsLoading) {
    return <LoadingSpinner />
  }

  return (
    <>
      <div className="h-full w-full">
        <div className="mb-5 flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <div className="ml-0">
            <h3 className="heading">Rule Group Settings</h3>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {props.editData && !props.isCloneMode && (
              <Button buttonType="primary" type="button" onClick={handleClone}>
                <DocumentDuplicateIcon />
                <span>Clone</span>
              </Button>
            )}
            <Button
              buttonType="default"
              type="button"
              as="a"
              target="_blank"
              rel="noopener noreferrer"
              href="https://docs.maintainerr.info/latest/Rules"
            >
              <QuestionMarkCircleIcon />
              <span>Help</span>
            </Button>
          </div>
        </div>

        {props.editData && props.isCloneMode && (
          <Alert type="info">
            You are cloning the rule group &apos;{props.editData.name}&apos;.
          </Alert>
        )}

        {(isCreateError || isUpdateError) && (
          <Alert>
            Something went wrong saving the group.. Please verify that all
            values are valid
          </Alert>
        )}

        {formIncomplete && (
          <Alert>
            Not all required (*) fields contain values and at least 1 valid rule
            is required
          </Alert>
        )}
        <form className="flex flex-col" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {/* Start Left side of top section */}
            <div className="flex flex-col items-center">
              <h2 className="mb-2 flex justify-center font-semibold text-zinc-100">
                General
              </h2>
              <div className="flex w-full flex-col rounded-lg bg-zinc-800 px-3 py-1">
                <div className="space-y-2 md:p-4">
                  <div className="form-row items-center">
                    <label htmlFor="name" className="text-label">
                      Name *
                      <p className="text-xs font-normal">
                        Will also be the name of the {collectionTerm} in{' '}
                        {mediaServerName}.
                      </p>
                    </label>
                    <div className="form-input">
                      <div className="form-input-field">
                        <input
                          id="name"
                          type="text"
                          {...register('name')}
                        ></input>
                      </div>
                      {errors.name && (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.name.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="form-row items-center">
                    <label htmlFor="description" className="text-label">
                      Description
                    </label>
                    <div className="form-input">
                      <div className="form-input-field">
                        <textarea
                          id="description"
                          rows={5}
                          {...register('description')}
                        ></textarea>
                      </div>
                    </div>
                  </div>

                  <div className="form-row items-center">
                    <label htmlFor="library" className="text-label">
                      Library *
                    </label>
                    <div className="form-input">
                      <div className="form-input-field">
                        {(() => {
                          const field = register('libraryId')
                          return (
                            <select
                              id="library"
                              {...field}
                              onChange={(event) => {
                                field.onChange(event)
                                updateLibraryId(event.target.value)
                              }}
                            >
                              {selectedLibraryId === '' && (
                                <option value="" disabled></option>
                              )}
                              {libraries?.map((data: MediaLibrary) => {
                                return (
                                  <option key={data.id} value={data.id}>
                                    {data.title}
                                  </option>
                                )
                              })}
                            </select>
                          )
                        })()}
                      </div>
                      {errors.libraryId && (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.libraryId.message}
                        </p>
                      )}
                    </div>
                  </div>
                  {selectedLibraryType && selectedLibraryType === 'movie' && (
                    <ArrAction
                      type="Radarr"
                      mediaServerName={mediaServerName}
                      accActionError={errors.arrAction?.message}
                      arrAction={arrActionValue}
                      settingIdError={errors.radarrSettingsId?.message}
                      settingId={radarrSettingsId}
                      onUpdate={(arrAction: number, settingId) => {
                        handleUpdateArrAction('Radarr', arrAction, settingId)
                      }}
                      options={[
                        {
                          id: 0,
                          name: 'Delete',
                        },
                        {
                          id: 1,
                          name: 'Unmonitor and delete files',
                        },
                        {
                          id: 3,
                          name: 'Unmonitor and keep files',
                        },
                        {
                          id: 4,
                          name: 'Do nothing',
                        },
                      ]}
                    />
                  )}

                  {selectedLibraryType && selectedLibraryType !== 'movie' && (
                    <>
                      <div className="form-row items-center">
                        <label htmlFor="type" className="text-label">
                          Media type*
                          <p className="text-xs font-normal">
                            The type of TV media rules should apply to
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            {(() => {
                              const field = register('dataType')
                              return (
                                <select
                                  id="type"
                                  {...field}
                                  onChange={(event) => {
                                    field.onChange(event)
                                    updateArrOption(0)
                                  }}
                                >
                                  {/* Show TV-related types: show, season, episode */}
                                  {(['show', 'season', 'episode'] as const).map(
                                    (mediaType) => (
                                      <option key={mediaType} value={mediaType}>
                                        {mediaType[0].toUpperCase() +
                                          mediaType.slice(1) +
                                          's'}
                                      </option>
                                    ),
                                  )}
                                </select>
                              )
                            })()}
                          </div>
                          {errors.dataType && (
                            <p className="mt-1 text-xs text-red-400">
                              {errors.dataType.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <ArrAction
                        type="Sonarr"
                        mediaServerName={mediaServerName}
                        arrAction={arrActionValue}
                        settingId={sonarrSettingsId}
                        onUpdate={(e: number, settingId) => {
                          handleUpdateArrAction('Sonarr', e, settingId)
                        }}
                        options={
                          selectedType === 'show'
                            ? [
                                {
                                  id: 0,
                                  name: 'Delete entire show',
                                },
                                {
                                  id: 1,
                                  name: 'Unmonitor and delete all seasons / episodes',
                                },
                                {
                                  id: 2,
                                  name: 'Unmonitor and delete existing seasons / episodes',
                                },
                                {
                                  id: 3,
                                  name: 'Unmonitor show and keep files',
                                },
                                {
                                  id: 4,
                                  name: 'Do nothing',
                                },
                              ]
                            : selectedType === 'season'
                              ? [
                                  {
                                    id: 0,
                                    name: 'Unmonitor and delete season',
                                  },
                                  {
                                    id: 2,
                                    name: 'Unmonitor and delete existing episodes',
                                  },
                                  {
                                    id: 3,
                                    name: 'Unmonitor season and keep files',
                                  },
                                  {
                                    id: 4,
                                    name: 'Do nothing',
                                  },
                                ]
                              : // episodes
                                [
                                  {
                                    id: 0,
                                    name: 'Unmonitor and delete episode',
                                  },
                                  {
                                    id: 3,
                                    name: 'Unmonitor and keep file',
                                  },
                                  {
                                    id: 4,
                                    name: 'Do nothing',
                                  },
                                ]
                        }
                      />
                      {errors.sonarrSettingsId && (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.sonarrSettingsId.message}
                        </p>
                      )}
                    </>
                  )}

                  {arrActionValue !== undefined && arrActionValue !== 4 && (
                    <div className="form-row items-center">
                      <label
                        htmlFor="collection_deleteDays"
                        className="text-label"
                      >
                        Take action after days*
                        <p className="text-xs font-normal">
                          Duration of days media remains in the {collectionTerm}
                          before deletion/unmonitor
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="number"
                            id="collection_deleteDays"
                            {...register('deleteAfterDays')}
                          />
                        </div>
                        {errors.deleteAfterDays && (
                          <p className="mt-1 text-xs text-red-400">
                            {errors.deleteAfterDays.message}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Start Right side of top section */}
            <div className="flex flex-col items-center">
              <h2 className="mb-2 flex justify-center font-semibold text-zinc-100">
                Options
              </h2>
              <div className="flex w-full flex-col rounded-lg bg-zinc-800 px-3 py-1">
                <div className="grid grid-cols-1 md:grid-cols-2 md:gap-3">
                  {/* Checkbox Options */}
                  <div className="flex flex-col p-2 md:my-2 md:border-r-2 md:border-dashed md:border-zinc-700 md:p-4">
                    <div className="flex flex-row items-center justify-between py-4">
                      <label htmlFor="is_active" className="text-label">
                        Active
                        <p className="text-xs font-normal">
                          Will this rule be included in rule runs
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="checkbox"
                            id="is_active"
                            className=""
                            {...register('active')}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Plex-only visibility options - Jellyfin doesn't support collection visibility settings */}
                    {isPlex && (
                      <>
                        <div className="flex flex-row items-center justify-between py-4">
                          <label
                            htmlFor="collection_visible_library"
                            className="text-label"
                          >
                            Show on {mediaServerName} library recommended
                            <p className="text-xs font-normal">
                              Show the {collectionTerm} on the {mediaServerName}{' '}
                              library recommended screen
                            </p>
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <input
                                type="checkbox"
                                id="collection_visible_library"
                                className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                                {...register('showRecommended')}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-row items-center justify-between py-4">
                          <label
                            htmlFor="collection_visible"
                            className="text-label"
                          >
                            Show on {mediaServerName} home
                            <p className="text-xs font-normal">
                              Show the {collectionTerm} on the {mediaServerName}{' '}
                              home screen
                            </p>
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <input
                                type="checkbox"
                                id="collection_visible"
                                className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                                {...register('showHome')}
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {(radarrSettingsId != null ||
                      (sonarrSettingsId != null &&
                        arrActionValue === 0 &&
                        selectedType === 'show')) && (
                      <div className="flex flex-row items-center justify-between py-4">
                        <label htmlFor="list_exclusions" className="text-label">
                          Add import list exclusions
                          <p className="text-xs font-normal">
                            Prevents{' '}
                            {radarrSettingsId
                              ? 'Radarr '
                              : sonarrSettingsId
                                ? 'Sonarr '
                                : ''}
                            import lists re-adding removed{' '}
                            {selectedLibraryType
                              ? selectedLibraryType
                              : 'movie'}
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <input
                              type="checkbox"
                              id="list_exclusions"
                              className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                              {...register('listExclusions')}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {overseerrEnabled && (
                      <div className="flex flex-row items-center justify-between py-4">
                        <label htmlFor="force_overseerr" className="text-label">
                          Force delete Overseerr request
                          <p className="text-xs font-normal">
                            Deletes the Overseerr request instead of relying on
                            media availability sync
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <input
                              type="checkbox"
                              id="force_overseerr"
                              className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                              {...register('forceOverseerr')}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-row items-center justify-between py-4">
                      <label htmlFor="use_rules" className="text-label">
                        Use rules
                        <p className="text-xs font-normal">
                          Toggle the rule system
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="checkbox"
                            id="use_rules"
                            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                            {...register('useRules')}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-row items-center justify-between py-4">
                      <label htmlFor="manual_collection" className="text-label">
                        Custom {collectionTerm}
                        <p className="text-xs font-normal">
                          Toggle internal {collectionTerm} system
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="checkbox"
                            id="manual_collection"
                            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                            {...register('manualCollection')}
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      className={`flex flex-col ${manualCollectionEnabled ? `` : `hidden`} `}
                    >
                      <label
                        htmlFor="manual_collection_name"
                        className="text-label"
                      >
                        Custom {collectionTerm} name
                        <p className="text-xs font-normal">
                          {collectionTermCapitalized} must exist in{' '}
                          {mediaServerName}
                        </p>
                      </label>

                      <div className="py-2">
                        <div className="form-input-field">
                          <input
                            type="text"
                            id="manual_collection_name"
                            placeholder={`My custom ${collectionTerm}`}
                            {...register('manualCollectionName')}
                          />
                        </div>
                        {errors.manualCollectionName && (
                          <p className="mt-1 text-xs text-red-400">
                            {errors.manualCollectionName.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Form Input Options */}
                  <div className="flex flex-col p-2 md:p-4">
                    <div className="flex flex-row items-center justify-between py-2 md:py-4">
                      <label
                        htmlFor="notifications"
                        className="text-label flex flex-wrap gap-1"
                      >
                        Notifications
                        <span className="ml-1.5 rounded-full bg-amber-600 px-3 text-white">
                          BETA
                        </span>
                      </label>
                      <div className="flex justify-end px-2 py-2">
                        <div className="form-input-field w-32">
                          <Button
                            buttonType="default"
                            type="button"
                            name="notifications"
                            className="w-full !bg-amber-600 hover:!bg-amber-500"
                            onClick={() => {
                              setConfigureNotificationModal(
                                !configureNotificionModal,
                              )
                            }}
                          >
                            Configure
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row items-center justify-between py-2 md:py-4">
                      <label
                        htmlFor="collection_logs_months"
                        className="text-label text-left"
                      >
                        Keep logs for months*
                        <p className="text-xs font-normal">
                          Duration for which {collectionTerm} logs should be
                          retained, measured in months (0 = forever)
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field flex w-32 flex-col">
                          <input
                            type="number"
                            id="collection_logs_months"
                            min={0}
                            {...register('keepLogsForMonths')}
                          />
                          {errors.keepLogsForMonths && (
                            <p className="mt-1 text-xs text-red-400">
                              {errors.keepLogsForMonths.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row items-center justify-between py-2 md:py-4">
                      <label
                        htmlFor="sort_title"
                        className="text-label text-left"
                      >
                        Sort title
                        <p className="text-xs font-normal">
                          Custom sort title for the {collectionTerm} in{' '}
                          {mediaServerName}
                        </p>
                      </label>
                      <div className="flex justify-end px-2 py-2">
                        <div className="form-input-field w-full">
                          <input
                            type="text"
                            id="sort_title"
                            placeholder={`e.g., 001 My ${collectionTermCapitalized}`}
                            {...register('sortTitle')}
                          />
                        </div>
                      </div>
                    </div>

                    {isPlex && tautulliEnabled && useRulesEnabled && (
                      <div className="flex flex-row items-center justify-between py-2 md:py-4">
                        <label
                          htmlFor="tautulli_watched_percent_override"
                          className="text-label text-left"
                        >
                          Tautulli watched percent override
                          <p className="text-xs font-normal">
                            Overrides the configured Watched Percent in
                            Tautulli, which is used to determine when media is
                            counted as watched
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field flex w-32 flex-col">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              id="tautulli_watched_percent_override"
                              {...register('tautulliWatchedPercentOverride')}
                            />
                            {errors.tautulliWatchedPercentOverride && (
                              <p className="mt-1 text-xs text-red-400">
                                {errors.tautulliWatchedPercentOverride.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-row items-center justify-between py-2 md:py-4">
                      <label
                        htmlFor="rule_handler_cron_schedule"
                        className="text-label text-left"
                      >
                        Rule handler schedule override
                        <p className="text-xs font-normal">
                          Supports all standard{' '}
                          <a
                            href="http://crontab.org/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            cron
                          </a>{' '}
                          patterns
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field flex w-32 flex-col">
                          <input
                            type="text"
                            id="rule_handler_cron_schedule"
                            {...register('ruleHandlerCronSchedule')}
                          />
                          {errors.ruleHandlerCronSchedule && (
                            <p className="mt-1 text-xs text-red-400">
                              {errors.ruleHandlerCronSchedule.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <hr className="mt-6 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
          <div className="grid grid-cols-1">
            <div className="flex justify-center">
              <div
                className={`section ${useRulesEnabled ? `` : `hidden`} md:w-3/4`}
              >
                <div className="section max-w-full">
                  <div className="flex">
                    <div className="ml-0">
                      <h3 className="heading">Rules</h3>
                      <p className="description">
                        Specify the rules this group needs to enforce
                      </p>
                    </div>
                    <div className="ml-auto">
                      <button
                        className="ml-3 flex h-fit rounded bg-amber-900 p-1 text-sm text-zinc-900 shadow-md hover:bg-amber-800 md:h-10 md:text-base"
                        onClick={toggleCommunityRuleModal}
                        type="button"
                      >
                        {
                          <CloudDownloadIcon className="m-auto ml-4 h-6 w-6 text-zinc-200" />
                        }
                        <p className="button-text m-auto ml-1 mr-4 text-zinc-100">
                          Community
                        </p>
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-center sm:justify-end">
                    <button
                      className="ml-3 flex h-fit rounded bg-amber-600 p-1 text-sm text-zinc-900 shadow-md hover:bg-amber-500 md:h-10 md:text-base"
                      onClick={toggleYamlImporter}
                      type="button"
                    >
                      {
                        <DownloadIcon className="m-auto ml-4 h-6 w-6 text-zinc-200 md:h-6" />
                      }
                      <p className="button-text m-auto ml-1 mr-4 text-zinc-100">
                        Import
                      </p>
                    </button>

                    <button
                      className="ml-3 flex h-fit rounded bg-amber-900 p-1 text-sm shadow-md hover:bg-amber-800 md:h-10 md:text-base"
                      onClick={toggleYamlExporter}
                      type="button"
                    >
                      {
                        <UploadIcon className="m-auto ml-4 h-6 w-6 text-zinc-200" />
                      }
                      <p className="button-text m-auto ml-1 mr-4 text-zinc-100">
                        Export
                      </p>
                    </button>
                  </div>
                </div>
                {showCommunityModal && selectedLibraryType && (
                  <CommunityRuleModal
                    currentRules={rules}
                    type={selectedLibraryType}
                    onUpdate={handleLoadRulesFromCommunity}
                    onCancel={() => setShowCommunityModal(false)}
                  />
                )}
                {yamlImporterModal && (
                  <YamlImporterModal
                    yaml={yaml}
                    onImport={(yaml: string) => {
                      importRulesFromYaml(yaml)
                      setYamlImporterModal(false)
                    }}
                    onCancel={() => {
                      setYamlImporterModal(false)
                    }}
                  />
                )}

                {configureNotificionModal && (
                  <ConfigureNotificationModal
                    onSuccess={(selection) => {
                      setConfiguredNotificationConfigurations(selection)
                      setConfigureNotificationModal(false)
                    }}
                    onCancel={() => {
                      setConfigureNotificationModal(false)
                    }}
                    selectedAgents={configuredNotificationConfigurations}
                  />
                )}

                <RuleCreator
                  key={ruleCreatorVersion}
                  mediaType={
                    selectedLibraryType != null
                      ? selectedLibraryType === 'movie'
                        ? 1
                        : 2
                      : 0
                  }
                  dataType={(selectedType as MediaItemType) || undefined}
                  editData={{ rules: rules }}
                  radarrSettingsId={radarrSettingsId}
                  sonarrSettingsId={sonarrSettingsId}
                  onCancel={cancel}
                  onUpdate={updateRules}
                />
              </div>
            </div>
          </div>
          <div className="mt-5 hidden h-full w-full md:flex">
            <div className="m-auto flex xl:m-0">
              <button
                className="ml-auto mr-3 flex h-10 rounded bg-amber-600 text-zinc-900 shadow-md hover:bg-amber-500"
                type="submit"
                disabled={isCreatePending || isUpdatePending}
              >
                {<SaveIcon className="m-auto ml-5 h-6 w-6 text-zinc-200" />}
                <p className="button-text m-auto ml-1 mr-5 text-zinc-100">
                  Save
                </p>
              </button>
              <button
                className="ml-auto flex h-10 rounded bg-amber-900 text-zinc-900 shadow-md hover:bg-amber-800"
                onClick={cancel}
                type="button"
                disabled={isCreatePending || isUpdatePending}
              >
                {<BanIcon className="m-auto ml-5 h-6 w-6 text-zinc-200" />}
                <p className="button-text m-auto ml-1 mr-5 text-zinc-100">
                  Cancel
                </p>
              </button>
            </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-800 px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.4)] md:hidden">
            <div className="flex justify-center gap-3">
              <button
                className="flex h-10 w-full max-w-[160px] items-center justify-center rounded bg-amber-600 text-zinc-900 shadow-md hover:bg-amber-500 disabled:opacity-60"
                type="submit"
                disabled={isCreatePending || isUpdatePending}
              >
                <SaveIcon className="h-5 w-5 text-zinc-200" />
                <span className="ml-2 text-zinc-100">Save</span>
              </button>

              <button
                className="flex h-10 w-full max-w-[160px] items-center justify-center rounded bg-amber-900 text-zinc-900 shadow-md hover:bg-amber-800 disabled:opacity-60"
                type="button"
                onClick={cancel}
                disabled={isCreatePending || isUpdatePending}
              >
                <BanIcon className="h-5 w-5 text-zinc-200" />
                <span className="ml-2 text-zinc-100">Cancel</span>
              </button>
            </div>
          </div>

          <div className="fixed bottom-6 right-6 z-40 hidden md:block">
            <button
              type="button"
              onClick={() => {
                if (atBottom) {
                  // Scroll UP
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                } else {
                  // Scroll DOWN
                  window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: 'smooth',
                  })
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-600 shadow-lg transition-colors hover:bg-amber-500 focus:outline-none"
            >
              {atBottom ? (
                <ChevronUpIcon className="h-5 w-5 text-zinc-900" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-zinc-900" />
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

export default AddModal
