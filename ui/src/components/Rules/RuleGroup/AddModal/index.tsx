import { CloudDownloadIcon } from '@heroicons/react/outline'
import {
  BanIcon,
  DownloadIcon,
  QuestionMarkCircleIcon,
  SaveIcon,
  UploadIcon,
} from '@heroicons/react/solid'
import Image from 'next/image'
import Router from 'next/router'
import { useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { IRuleGroup } from '..'
import ConstantsContext, {
  Application,
} from '../../../../contexts/constants-context'
import LibrariesContext, {
  ILibrary,
} from '../../../../contexts/libraries-context'
import GetApiHandler, {
  PostApiHandler,
  PutApiHandler,
} from '../../../../utils/ApiHandler'
import { EPlexDataType } from '../../../../utils/PlexDataType-enum'
import { ICollection } from '../../../Collection'
import Alert from '../../../Common/Alert'
import Button from '../../../Common/Button'
import CommunityRuleModal from '../../../Common/CommunityRuleModal'
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

const AddModal = (props: AddModal) => {
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>(
    props.editData ? props.editData.libraryId.toString() : '',
  )
  const [selectedType, setSelectedType] = useState<string>(
    props.editData?.type ? props.editData.type.toString() : '',
  )
  const [selectedLibrary, setSelectedLibrary] = useState<ILibrary>()
  const [collection, setCollection] = useState<ICollection>()
  const [isLoading, setIsLoading] = useState(true)
  const [showCommunityModal, setShowCommunityModal] = useState(false)
  const [yamlImporterModal, setYamlImporterModal] = useState(false)
  const [configureNotificionModal, setConfigureNotificationModal] =
    useState(false)

  const yaml = useRef<string>(undefined)
  const nameRef = useRef<any>(undefined)
  const descriptionRef = useRef<any>(undefined)
  const libraryRef = useRef<any>(undefined)
  const collectionTypeRef = useRef<any>(undefined)
  const keepLogsForMonthsRef = useRef<any>(undefined)
  const tautulliWatchedPercentOverrideRef = useRef<any>(undefined)
  const manualCollectionNameRef = useRef<any>('My custom collection')
  const [showRecommended, setShowRecommended] = useState<boolean>(true)
  const [showHome, setShowHome] = useState<boolean>(true)
  const [listExclusion, setListExclusion] = useState<boolean>(true)
  const [forceOverseerr, setForceOverseerr] = useState<boolean>(false)
  const [manualCollection, setManualCollection] = useState<boolean>(false)
  const [deleteDays, setDeleteDays] = useState<number | undefined>(undefined)
  const ConstantsCtx = useContext(ConstantsContext)
  const [
    configuredNotificationConfigurations,
    setConfiguredNotificationConfigurations,
  ] = useState<AgentConfiguration[]>(
    props.editData?.notifications ? props.editData?.notifications : [],
  )

  const [useRules, setUseRules] = useState<boolean>(
    props.editData ? props.editData.useRules : true,
  )
  const [arrOption, setArrOption] = useState<number>()
  const [radarrSettingsId, setRadarrSettingsId] = useState<
    number | null | undefined
  >(props.editData ? null : undefined)
  const [sonarrSettingsId, setSonarrSettingsId] = useState<
    number | null | undefined
  >(props.editData ? null : undefined)
  const [active, setActive] = useState<boolean>(
    props.editData ? props.editData.isActive : true,
  )
  const [rules, setRules] = useState<IRule[]>(
    props.editData
      ? props.editData.rules.map((r) => JSON.parse(r.ruleJson) as IRule)
      : [],
  )
  const [error, setError] = useState<boolean>(false)
  const [formIncomplete, setFormIncomplete] = useState<boolean>(false)
  const ruleCreatorVersion = useRef<number>(1)
  const LibrariesCtx = useContext(LibrariesContext)
  const tautulliEnabled =
    ConstantsCtx.constants.applications?.some(
      (x) => x.id == Application.TAUTULLI,
    ) ?? false
  const overseerrEnabled =
    ConstantsCtx.constants.applications?.some(
      (x) => x.id == Application.OVERSEERR,
    ) ?? false

  function updateLibraryId(value: string) {
    const lib = LibrariesCtx.libraries.find(
      (el: ILibrary) => +el.key === +value,
    )

    if (lib) {
      setSelectedLibraryId(lib.key)
      setSelectedLibrary(lib)
      setSelectedType(
        lib.type === 'movie'
          ? EPlexDataType.MOVIES.toString()
          : EPlexDataType.SHOWS.toString(),
      )
    }

    setRadarrSettingsId(undefined)
    setSonarrSettingsId(undefined)
    updateArrOption(0)
  }

  function updateArrOption(value: number) {
    setArrOption(value)

    if (value === undefined || value === 4) {
      setDeleteDays(undefined)
    } else if (deleteDays === undefined) {
      setDeleteDays(30)
    }
  }

  function setLibraryId(value: string) {
    const lib = LibrariesCtx.libraries.find(
      (el: ILibrary) => +el.key === +value,
    )

    if (lib) {
      setSelectedLibraryId(lib.key)
      setSelectedLibrary(lib)
    }
  }

  function setCollectionType(event: { target: { value: string } }) {
    setSelectedType(event.target.value)
    updateArrOption(0)
  }

  const handleUpdateArrAction = (
    type: 'Radarr' | 'Sonarr',
    arrAction: number,
    settingId?: number | null,
  ) => {
    updateArrOption(arrAction)

    if (type === 'Radarr') {
      setSonarrSettingsId(undefined)
      setRadarrSettingsId(settingId)
    } else if (type === 'Sonarr') {
      setRadarrSettingsId(undefined)
      setSonarrSettingsId(settingId)
    }
  }

  function updateRules(rules: IRule[]) {
    setRules(rules)
  }

  const toggleCommunityRuleModal = () => {
    if (selectedLibrary == null) {
      alert('Please select a library first.')
    } else {
      setShowCommunityModal(!showCommunityModal)
    }
  }

  const toggleYamlExporter = async (e: any) => {
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

  const toggleYamlImporter = (e: any) => {
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

  useEffect(() => {
    setIsLoading(true)

    const load = async () => {
      const constantsPromise = GetApiHandler('/rules/constants')
      const librariesPromise =
        LibrariesCtx.libraries.length <= 0
          ? GetApiHandler('/plex/libraries/')
          : Promise.resolve(null)
      const collectionPromise: Promise<ICollection | null> = props.editData
        ? GetApiHandler(
            `/collections/collection/${props.editData.collectionId}`,
          )
        : Promise.resolve(null)

      const [constants, libraries, collection] = await Promise.all([
        constantsPromise,
        librariesPromise,
        collectionPromise,
      ])

      ConstantsCtx.setConstants(constants)

      if (libraries != null) {
        if (libraries) {
          LibrariesCtx.addLibraries(libraries)
        } else {
          LibrariesCtx.addLibraries([])
        }
      }

      if (collection) {
        setCollection(collection)
        setShowRecommended(collection.visibleOnRecommended!)
        setShowHome(collection.visibleOnHome!)
        setListExclusion(collection.listExclusions!)
        setForceOverseerr(collection.forceOverseerr!)
        setArrOption(collection.arrAction)
        setSelectedType(collection.type.toString())
        setManualCollection(collection.manualCollection)
        setRadarrSettingsId(collection.radarrSettingsId ?? null)
        setSonarrSettingsId(collection.sonarrSettingsId ?? null)
        setLibraryId(collection.libraryId.toString())
        setDeleteDays(collection.deleteAfterDays ?? undefined)
      }

      setIsLoading(false)
    }

    load()
  }, [])

  useEffect(() => {
    // trapping next router before-pop-state to manipulate router change on browser back button
    Router.beforePopState(() => {
      props.onCancel()
      window.history.forward()
      return false
    })
    return () => {
      Router.beforePopState(() => {
        return true
      })
    }
  }, [])

  const create = () => {
    if (
      nameRef.current.value &&
      libraryRef.current.value &&
      (radarrSettingsId !== undefined || sonarrSettingsId !== undefined) &&
      ((useRules && rules.length > 0) || !useRules)
    ) {
      setFormIncomplete(false)
      const creationObj: ICreateApiObject = {
        name: nameRef.current.value,
        description: descriptionRef.current.value,
        libraryId: +libraryRef.current.value,
        arrAction: arrOption ? arrOption : 0,
        dataType: +selectedType,
        isActive: active,
        useRules: useRules,
        listExclusions: listExclusion,
        forceOverseerr: forceOverseerr,
        tautulliWatchedPercentOverride:
          tautulliWatchedPercentOverrideRef.current &&
          tautulliWatchedPercentOverrideRef.current.value != ''
            ? +tautulliWatchedPercentOverrideRef.current.value
            : undefined,
        radarrSettingsId: radarrSettingsId ?? undefined,
        sonarrSettingsId: sonarrSettingsId ?? undefined,
        collection: {
          visibleOnRecommended: showRecommended,
          visibleOnHome: showHome,
          deleteAfterDays:
            arrOption === undefined || arrOption === 4 ? undefined : deleteDays,
          manualCollection: manualCollection,
          manualCollectionName: manualCollectionNameRef.current.value,
          keepLogsForMonths: +keepLogsForMonthsRef.current.value,
        },
        rules: useRules ? rules : [],
        notifications: configuredNotificationConfigurations,
      }

      if (!props.editData) {
        PostApiHandler('/rules', creationObj)
          .then((resp) => {
            if (resp.code === 1) props.onSuccess()
            else setError(true)
          })
          .catch((err) => {
            setError(true)
          })
      } else {
        PutApiHandler('/rules', { id: props.editData.id, ...creationObj })
          .then((resp) => {
            if (resp.code === 1) props.onSuccess()
            else setError(true)
          })
          .catch((err) => {
            setError(true)
          })
      }
    } else {
      setFormIncomplete(true)
    }
  }

  if (isLoading) {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

    return (
      <span>
        <Image fill src={`${basePath}/spinner.svg`} alt="Loading..." />
      </span>
    )
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
        <form className="flex flex-col">
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
                          name="name"
                          id="name"
                          type="text"
                          ref={nameRef}
                          defaultValue={props.editData?.name}
                        ></input>
                      </div>
                    </div>
                  </div>

                  <div className="form-row items-center">
                    <label htmlFor="description" className="text-label">
                      Description
                    </label>
                    <div className="form-input">
                      <div className="form-input-field">
                        <textarea
                          name="description"
                          id="description"
                          rows={5}
                          defaultValue={props.editData?.description}
                          ref={descriptionRef}
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
                        <select
                          name="library"
                          id="library"
                          value={selectedLibraryId}
                          onChange={(e) => updateLibraryId(e.target.value)}
                          ref={libraryRef}
                        >
                          {selectedLibraryId === '' && (
                            <option value="" disabled></option>
                          )}
                          {LibrariesCtx.libraries.map((data: ILibrary) => {
                            return (
                              <option key={data.key} value={data.key}>
                                {data.title}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    </div>
                  </div>
                  {selectedLibrary && selectedLibrary!.type === 'movie' && (
                    <ArrAction
                      type="Radarr"
                      arrAction={arrOption}
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

                  {selectedLibrary && selectedLibrary!.type !== 'movie' && (
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
                            <select
                              name="type"
                              id="type"
                              value={selectedType}
                              onChange={setCollectionType}
                              ref={collectionTypeRef}
                            >
                              {Object.keys(EPlexDataType)
                                .filter((v) => isNaN(Number(v)))
                                .filter((v) => v !== 'MOVIES') // We don't need movies here.
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
                          </div>
                        </div>
                      </div>

                      <ArrAction
                        type="Sonarr"
                        arrAction={arrOption}
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
                    </>
                  )}

                  {arrOption !== undefined && arrOption !== 4 && (
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
                            name="collection_deleteDays"
                            id="collection_deleteDays"
                            value={deleteDays}
                            onChange={(e) => setDeleteDays(+e.target.value)}
                          />
                        </div>
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
                      <label htmlFor="active" className="text-label">
                        Active
                        <p className="text-xs font-normal">
                          Will this rule be included in rule runs
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="checkbox"
                            name="is_active"
                            id="is_active"
                            className=""
                            defaultChecked={active}
                            onChange={() => {
                              setActive(!active)
                            }}
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
                            name="collection_visible_library"
                            id="collection_visible_library"
                            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                            defaultChecked={showRecommended}
                            onChange={() => {
                              setShowRecommended(!showRecommended)
                            }}
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
                            name="collection_visible"
                            id="collection_visible"
                            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                            defaultChecked={showHome}
                            onChange={() => {
                              setShowHome(!showHome)
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {(radarrSettingsId != null ||
                      (sonarrSettingsId != null &&
                        arrOption === 0 &&
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
                            {selectedLibrary?.type ?? 'media'}
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <input
                              type="checkbox"
                              name="list_exclusions"
                              id="list_exclusions"
                              className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                              defaultChecked={listExclusion}
                              onChange={() => {
                                setListExclusion(!listExclusion)
                              }}
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
                              name="force_overseerr"
                              id="force_overseerr"
                              className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                              defaultChecked={forceOverseerr}
                              onChange={() => {
                                setForceOverseerr(!forceOverseerr)
                              }}
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
                            name="use_rules"
                            id="use_rules"
                            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                            defaultChecked={useRules}
                            onChange={() => {
                              setUseRules(!useRules)
                            }}
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
                            name="manual_collection"
                            id="manual_collection"
                            className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
                            defaultChecked={manualCollection}
                            onChange={() => {
                              setManualCollection(!manualCollection)
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      className={`flex flex-col ${manualCollection ? `` : `hidden`} `}
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
                            name="manual_collection_name"
                            id="manual_collection_name"
                            defaultValue={collection?.manualCollectionName}
                            ref={manualCollectionNameRef}
                          />
                        </div>
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
                            name="collection_logs_months"
                            id="collection_logs_months"
                            defaultValue={
                              collection ? collection.keepLogsForMonths : 6
                            }
                            ref={keepLogsForMonthsRef}
                          />
                        </div>
                      </div>
                    </div>

                    {tautulliEnabled && useRules && (
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
                              name="tautulli_watched_percent_override"
                              id="tautulli_watched_percent_override"
                              defaultValue={
                                collection
                                  ? collection.tautulliWatchedPercentOverride
                                  : ''
                              }
                              ref={tautulliWatchedPercentOverrideRef}
                            />
                          </div>
                        </div>
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
              <div className={`section ${useRules ? `` : `hidden`} md:w-3/4`}>
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
                {showCommunityModal && selectedLibrary && (
                  <CommunityRuleModal
                    currentRules={rules}
                    type={selectedLibrary.type}
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
                    selectedLibrary
                      ? selectedLibrary.type === 'movie'
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
                onClick={create}
                type="button"
              >
                {<SaveIcon className="m-auto ml-5 h-6 w-6 text-zinc-200" />}
                <p className="button-text m-auto ml-1 mr-5 text-zinc-100">
                  Save
                </p>
              </button>

              <button
                className="ml-auto flex h-10 rounded bg-amber-900 text-zinc-900 shadow-md hover:bg-amber-800"
                onClick={cancel}
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
