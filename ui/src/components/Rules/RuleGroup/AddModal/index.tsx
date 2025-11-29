import { CloudDownloadIcon } from '@heroicons/react/outline'
import {
  BanIcon,
  DownloadIcon,
  QuestionMarkCircleIcon,
  SaveIcon,
  UploadIcon,
} from '@heroicons/react/solid'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { z } from 'zod'
import { IRuleGroup } from '..'
import { usePlexLibraries } from '../../../../api/plex'
import { useRuleConstants } from '../../../../api/rules'
import { Application } from '../../../../contexts/constants-context'
import { ILibrary } from '../../../../contexts/libraries-context'
import { PostApiHandler, PutApiHandler } from '../../../../utils/ApiHandler'
import { EPlexDataType } from '../../../../utils/PlexDataType-enum'
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
  onCancel: () => void
  onSuccess: () => void
}

interface ICreateApiObject {
  name: string
  description: string
  libraryId: number
  arrAction: number
  isActive: boolean
  useRules: boolean
  listExclusions: boolean
  forceOverseerr: boolean
  tautulliWatchedPercentOverride?: number
  radarrSettingsId?: number
  sonarrSettingsId?: number
  collection: {
    visibleOnRecommended: boolean
    visibleOnHome: boolean
    deleteAfterDays?: number
    manualCollection?: boolean
    manualCollectionName?: string
    keepLogsForMonths?: number
  }
  rules: IRule[]
  dataType: EPlexDataType
  notifications: AgentConfiguration[]
}

const DEFAULT_MANUAL_COLLECTION_NAME = 'My custom collection'

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
          .min(1, 'Take action after days must be at least 1')
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
    active: z.boolean(),
    useRules: z.boolean(),
    radarrSettingsId: z.number().int().nullable().optional(),
    sonarrSettingsId: z.number().int().nullable().optional(),
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
        code: z.ZodIssueCode.custom,
        path: ['radarrSettingsId'],
        message: 'Select a Radarr or Sonarr server',
      })
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sonarrSettingsId'],
        message: 'Select a Radarr or Sonarr server',
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
  manualCollectionName:
    editData?.collection?.manualCollectionName ??
    DEFAULT_MANUAL_COLLECTION_NAME,
  active: editData?.isActive ?? true,
  useRules: editData?.useRules ?? true,
  radarrSettingsId: editData
    ? (editData.collection?.radarrSettingsId ?? null)
    : undefined,
  sonarrSettingsId: editData
    ? (editData.collection?.sonarrSettingsId ?? null)
    : undefined,
})

const AddModal = (props: AddModal) => {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RuleGroupFormInput, any, RuleGroupFormOutput>({
    resolver: zodResolver(ruleGroupFormSchema),
    defaultValues: buildFormDefaults(props.editData),
  })

  const selectedLibraryId = watch('libraryId') ?? ''
  const selectedType = watch('dataType') ?? ''
  const selectedLibraryType: undefined | 'movie' | 'show' = selectedType
    ? +selectedType === EPlexDataType.MOVIES
      ? 'movie'
      : 'show'
    : undefined
  const manualCollectionEnabled = watch('manualCollection')
  const useRulesEnabled = watch('useRules')
  const arrActionValue = watch('arrAction') as number | undefined
  const radarrSettingsId = watch('radarrSettingsId') as
    | number
    | null
    | undefined
  const sonarrSettingsId = watch('sonarrSettingsId') as
    | number
    | null
    | undefined
  const [showCommunityModal, setShowCommunityModal] = useState(false)
  const [yamlImporterModal, setYamlImporterModal] = useState(false)
  const [configureNotificionModal, setConfigureNotificationModal] =
    useState(false)

  const yaml = useRef<string>(undefined)
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
  const [error, setError] = useState<boolean>(false)
  const [formIncomplete, setFormIncomplete] = useState<boolean>(false)
  const ruleCreatorVersion = useRef<number>(1)

  const { data: plexLibraries, isLoading: plexLibrariesLoading } =
    usePlexLibraries()

  const { data: constants, isLoading: constantsLoading } = useRuleConstants()

  useEffect(() => {
    register('arrAction')
    register('radarrSettingsId')
    register('sonarrSettingsId')
  }, [register])

  useEffect(() => {
    reset(buildFormDefaults(props.editData))
    setConfiguredNotificationConfigurations(props.editData?.notifications ?? [])
    setRules(
      props.editData?.rules
        ? props.editData.rules.map((r) => JSON.parse(r.ruleJson) as IRule)
        : [],
    )
    ruleCreatorVersion.current += 1
  }, [props.editData, reset])

  const tautulliEnabled =
    constants?.applications?.some((x) => x.id == Application.TAUTULLI) ?? false
  const overseerrEnabled =
    constants?.applications?.some((x) => x.id == Application.OVERSEERR) ?? false

  function updateLibraryId(value: string) {
    if (!plexLibraries) {
      throw new Error('Plex libraries not loaded')
    }

    const lib = plexLibraries.find((el: ILibrary) => +el.key === +value)

    if (lib) {
      setValue(
        'dataType',
        lib.type === 'movie'
          ? EPlexDataType.MOVIES.toString()
          : EPlexDataType.SHOWS.toString(),
      )
    }

    setValue('radarrSettingsId', undefined)
    setValue('sonarrSettingsId', undefined)
    updateArrOption(0)
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

    if (type === 'Radarr') {
      setValue('sonarrSettingsId', undefined)
      setValue('radarrSettingsId', settingId)
    } else if (type === 'Sonarr') {
      setValue('radarrSettingsId', undefined)
      setValue('sonarrSettingsId', settingId)
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
      yaml.current = response.result

      if (!yamlImporterModal) {
        setYamlImporterModal(true)
      } else {
        setYamlImporterModal(false)
      }
    }
  }

  const toggleYamlImporter = () => {
    yaml.current = undefined
    if (!yamlImporterModal) {
      setYamlImporterModal(true)
    } else {
      setYamlImporterModal(false)
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
      handleLoadRules(result.rules)
      toast.success('Successfully imported rules from Yaml.', {
        autoClose: 5000,
      })
    } else {
      toast.error(response.message, { autoClose: 5000 })
    }
  }

  const handleLoadRules = (rules: IRule[]) => {
    updateRules(rules)
    ruleCreatorVersion.current = ruleCreatorVersion.current + 1
    setShowCommunityModal(false)
  }

  const cancel = () => {
    props.onCancel()
  }

  const onSubmit = (data: RuleGroupFormValues) => {
    if (data.useRules && rules.length === 0) {
      setFormIncomplete(true)
      return
    }

    setFormIncomplete(false)

    const creationObj: ICreateApiObject = {
      name: data.name,
      description: data.description ?? '',
      libraryId: +data.libraryId,
      arrAction: data.arrAction ?? 0,
      dataType: +data.dataType as EPlexDataType,
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
          data.manualCollectionName ?? DEFAULT_MANUAL_COLLECTION_NAME,
        keepLogsForMonths: data.keepLogsForMonths,
      },
      rules: data.useRules ? rules : [],
      notifications: configuredNotificationConfigurations,
    }

    if (!props.editData) {
      PostApiHandler('/rules', creationObj)
        .then((resp) => {
          if (resp.code === 1) props.onSuccess()
          else setError(true)
        })
        .catch(() => {
          setError(true)
        })
    } else {
      PutApiHandler('/rules', { id: props.editData?.id, ...creationObj })
        .then((resp) => {
          if (resp.code === 1) props.onSuccess()
          else setError(true)
        })
        .catch(() => {
          setError(true)
        })
    }
  }

  if (plexLibrariesLoading || constantsLoading) {
    return <LoadingSpinner />
  }

  return (
    <>
      <div className="h-full w-full">
        <div className="flex">
          <div className="ml-0">
            <h3 className="heading mb-5">Rule Group Settings</h3>
          </div>
          <div className="ml-auto">
            <Button
              className="ml-3"
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

        {error ? (
          <Alert>
            Something went wrong saving the group.. Please verify that all
            values are valid
          </Alert>
        ) : undefined}
        {formIncomplete ? (
          <Alert>
            Not all required (*) fields contain values and at least 1 valid rule
            is required
          </Alert>
        ) : undefined}
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
                        Will also be the name of the collection in Plex.
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
                      {errors.name ? (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.name.message}
                        </p>
                      ) : undefined}
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
                              {plexLibraries?.map((data: ILibrary) => {
                                return (
                                  <option key={data.key} value={data.key}>
                                    {data.title}
                                  </option>
                                )
                              })}
                            </select>
                          )
                        })()}
                      </div>
                      {errors.libraryId ? (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.libraryId.message}
                        </p>
                      ) : undefined}
                    </div>
                  </div>
                  {selectedLibraryType && selectedLibraryType === 'movie' && (
                    <ArrAction
                      type="Radarr"
                      arrAction={arrActionValue}
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
                  {selectedLibraryType === 'movie' &&
                  errors.radarrSettingsId ? (
                    <p className="mt-1 text-xs text-red-400">
                      {errors.radarrSettingsId.message}
                    </p>
                  ) : undefined}

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
                                  {Object.keys(EPlexDataType)
                                    .filter((v) => isNaN(Number(v)))
                                    .filter((v) => v !== 'MOVIES')
                                    .map((data: string) => {
                                      return (
                                        <option
                                          key={
                                            EPlexDataType[
                                              data as keyof typeof EPlexDataType
                                            ]
                                          }
                                          value={
                                            EPlexDataType[
                                              data as keyof typeof EPlexDataType
                                            ]
                                          }
                                        >
                                          {data[0].toUpperCase() +
                                            data.slice(1).toLowerCase()}
                                        </option>
                                      )
                                    })}
                                </select>
                              )
                            })()}
                          </div>
                          {errors.dataType ? (
                            <p className="mt-1 text-xs text-red-400">
                              {errors.dataType.message}
                            </p>
                          ) : undefined}
                        </div>
                      </div>

                      <ArrAction
                        type="Sonarr"
                        arrAction={arrActionValue}
                        settingId={sonarrSettingsId}
                        onUpdate={(e: number, settingId) => {
                          handleUpdateArrAction('Sonarr', e, settingId)
                        }}
                        options={
                          +selectedType === EPlexDataType.SHOWS
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
                            : +selectedType === EPlexDataType.SEASONS
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
                      {errors.sonarrSettingsId ? (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.sonarrSettingsId.message}
                        </p>
                      ) : undefined}
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
                          Duration of days media remains in the collection
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
                        {errors.deleteAfterDays ? (
                          <p className="mt-1 text-xs text-red-400">
                            {errors.deleteAfterDays.message}
                          </p>
                        ) : undefined}
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

                    <div className="flex flex-row items-center justify-between py-4">
                      <label
                        htmlFor="collection_visible_library"
                        className="text-label"
                      >
                        Show on Plex library recommended
                        <p className="text-xs font-normal">
                          Show the collection on the Plex library recommended
                          screen
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
                        Show on Plex home
                        <p className="text-xs font-normal">
                          Show the collection on the Plex home screen
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

                    {(radarrSettingsId != null ||
                      (sonarrSettingsId != null &&
                        arrActionValue === 0 &&
                        (+selectedType as EPlexDataType) ===
                          EPlexDataType.SHOWS)) && (
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
                        Custom collection
                        <p className="text-xs font-normal">
                          Toggle internal collection system
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
                        Custom collection name
                        <p className="text-xs font-normal">
                          Collection must exist in Plex
                        </p>
                      </label>

                      <div className="py-2">
                        <div className="form-input-field">
                          <input
                            type="text"
                            id="manual_collection_name"
                            {...register('manualCollectionName')}
                          />
                        </div>
                        {errors.manualCollectionName ? (
                          <p className="mt-1 text-xs text-red-400">
                            {errors.manualCollectionName.message}
                          </p>
                        ) : undefined}
                      </div>
                    </div>
                  </div>

                  {/* Form Input Options */}
                  <div className="flex flex-col p-2 md:p-4">
                    <div className="flex flex-row items-center justify-between py-2 md:py-4">
                      <label htmlFor="notifications" className="text-label">
                        Notifications
                        <span className="ml-1.5 rounded-full bg-amber-600 px-3 text-white">
                          BETA
                        </span>
                      </label>
                      <div className="flex justify-end px-2 py-2">
                        <div className="form-input-field w-20">
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
                          Duration for which collection logs should be retained,
                          measured in months (0 = forever)
                        </p>
                      </label>
                      <div className="flex justify-end px-2 py-2">
                        <div className="form-input-field w-20">
                          <input
                            type="number"
                            id="collection_logs_months"
                            min={0}
                            {...register('keepLogsForMonths')}
                          />
                        </div>
                      </div>
                      {errors.keepLogsForMonths ? (
                        <p className="mt-1 text-end text-xs text-red-400">
                          {errors.keepLogsForMonths.message}
                        </p>
                      ) : undefined}
                    </div>

                    {tautulliEnabled && useRulesEnabled && (
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
                        <div className="flex justify-end px-2 py-2">
                          <div className="form-input-field w-20">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              id="tautulli_watched_percent_override"
                              {...register('tautulliWatchedPercentOverride')}
                            />
                          </div>
                        </div>
                        {errors.tautulliWatchedPercentOverride ? (
                          <p className="mt-1 text-end text-xs text-red-400">
                            {errors.tautulliWatchedPercentOverride.message}
                          </p>
                        ) : undefined}
                      </div>
                    )}
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
                        className="ml-3 flex h-fit rounded bg-amber-900 p-1 text-zinc-900 shadow-md hover:bg-amber-800 md:h-10"
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
                    onUpdate={handleLoadRules}
                    onCancel={() => setShowCommunityModal(false)}
                  />
                )}
                {yamlImporterModal && (
                  <YamlImporterModal
                    yaml={yaml.current ? yaml.current : undefined}
                    onImport={(yaml: string) => {
                      importRulesFromYaml(yaml)
                      setYamlImporterModal(false)
                    }}
                    onCancel={() => {
                      setYamlImporterModal(false)
                    }}
                  />
                )}

                {configureNotificionModal ? (
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
                ) : undefined}

                <RuleCreator
                  key={ruleCreatorVersion.current}
                  mediaType={
                    selectedLibraryType != null
                      ? selectedLibraryType === 'movie'
                        ? 1
                        : 2
                      : 0
                  }
                  dataType={+selectedType as EPlexDataType}
                  editData={{ rules: rules }}
                  onCancel={cancel}
                  onUpdate={updateRules}
                />
              </div>
            </div>
          </div>
          <div className="mt-5 flex h-full w-full">
            <div className="m-auto flex xl:m-0">
              <button
                className="ml-auto mr-3 flex h-10 rounded bg-amber-600 text-zinc-900 shadow-md hover:bg-amber-500"
                type="submit"
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
              >
                {<BanIcon className="m-auto ml-5 h-6 w-6 text-zinc-200" />}
                <p className="button-text m-auto ml-1 mr-5 text-zinc-100">
                  Cancel
                </p>
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

export default AddModal
