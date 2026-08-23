import { i18n } from '@lingui/core'
import { plural, t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { CloudDownloadIcon } from '@heroicons/react/outline'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentDuplicateIcon,
  DownloadIcon,
  QuestionMarkCircleIcon,
  UploadIcon,
} from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Application,
  DELETE_AFTER_MAX_DAYS,
  isValidMediaItemType,
  leftoverCleanupScope,
  MediaItemType,
  MediaLibrary,
  MediaServerFeature,
  overlayModeForType,
  OverlayTemplate,
  parseCollectionSortKey,
  ServarrAction,
  supportsFeature,
} from '@maintainerr/contracts'
import { isValidCron } from 'cron-validator'
import { lazy, useEffect, useState, useSyncExternalStore } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { z } from 'zod'
import { IRuleGroup } from '..'
import { useMediaServerLibraries } from '../../../../api/media-server'
import { getOverlayTemplates } from '../../../../api/overlays'
import { useServarrSettings } from '../../../../api/settings'
import {
  RuleGroupCreatePayload,
  useCreateRuleGroup,
  useRuleConstants,
  useUpdateRuleGroup,
} from '../../../../api/rules'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import { getApiErrorMessage } from '../../../../utils/ApiError'
import { PostApiHandler } from '../../../../utils/ApiHandler'
import { logClientError } from '../../../../utils/ClientLogger'
import Alert from '../../../Common/Alert'
import BrandLink from '../../../Common/BrandLink'
import Button from '../../../Common/Button'
import CommunityRuleModal from '../../../Common/CommunityRuleModal'
import LazyModalBoundary from '../../../Common/LazyModalBoundary'
import LoadingSpinner from '../../../Common/LoadingSpinner'
import Modal from '../../../Common/Modal'
import { getCollectionMediaSortConfig } from '../../../Common/MediaLibrarySortControl'
import SaveButton from '../../../Common/SaveButton'
import { Input } from '../../../Forms/Input'
import { Select } from '../../../Forms/Select'
import type { AgentConfiguration } from '../../../Settings/Notifications/CreateNotificationModal'
import RuleCreator, { IRule } from '../../Rule/RuleCreator'
import ArrAction from './ArrAction'
import CollectionPosterPicker from './CollectionPosterPicker'
import QualityProfileSelector from './QualityProfileSelector'

const YamlImporterModal = lazy(
  () => import('../../../Common/YamlImporterModal'),
)
const ConfigureNotificationModal = lazy(
  () => import('./ConfigureNotificationModal'),
)

interface AddModal {
  editData?: IRuleGroup
  isCloneMode?: boolean
  onCancel: () => void
  onSuccess: () => void
}

export const getStoredLibraryFallbackState = (
  storedLibraryId: string | undefined,
  libraries: MediaLibrary[] | undefined,
  librariesLoading: boolean,
  librariesError: boolean,
) => {
  const storedLibraryResolved = Boolean(
    storedLibraryId && libraries?.some((lib) => lib.id === storedLibraryId),
  )
  const storedLibraryMissing =
    !!storedLibraryId && !librariesLoading && !storedLibraryResolved
  const showStoredLibraryFallback =
    !!storedLibraryId && (librariesError || storedLibraryMissing)

  return {
    storedLibraryResolved,
    storedLibraryMissing,
    showStoredLibraryFallback,
  }
}

// Helper function to check if an app should be filtered
const shouldFilterApp = (
  appId: number,
  radarrId: number | null | undefined,
  sonarrId: number | null | undefined,
  sportarrId: number | null | undefined,
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
  if (
    appId === Application.SPORTARR &&
    (sportarrId === undefined || sportarrId === null)
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
  sportarrId: number | null | undefined,
): IRule[] => {
  return rules.filter((rule) => {
    if (shouldFilterApp(+rule.firstVal[0], radarrId, sonarrId, sportarrId))
      return false
    if (
      rule.lastVal &&
      Array.isArray(rule.lastVal) &&
      shouldFilterApp(+rule.lastVal[0], radarrId, sonarrId, sportarrId)
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

const sortActionOptions = <T extends { name: string }>(options: T[]): T[] => {
  // Collate with the app locale: the names are translated, and the browser
  // default would order Swedish labels with English rules.
  return [...options].sort((left, right) =>
    left.name.localeCompare(right.name, i18n.locale),
  )
}

const buildRadarrActionOptions = () =>
  sortActionOptions([
    {
      id: ServarrAction.DELETE,
      name: globalT`Delete`,
    },
    {
      id: ServarrAction.UNMONITOR_DELETE_ALL,
      name: globalT`Unmonitor and delete files`,
    },
    {
      id: ServarrAction.UNMONITOR,
      name: globalT`Unmonitor and keep files`,
    },
    {
      id: ServarrAction.DO_NOTHING,
      name: globalT`Do nothing`,
    },
    {
      id: ServarrAction.CHANGE_QUALITY_PROFILE,
      name: globalT`Change quality profile and search`,
    },
  ])

const buildSonarrShowActionOptions = () =>
  sortActionOptions([
    {
      id: ServarrAction.DELETE,
      name: globalT`Delete entire show`,
    },
    {
      id: ServarrAction.UNMONITOR_DELETE_ALL,
      name: globalT`Unmonitor show + seasons, delete all episodes`,
    },
    {
      id: ServarrAction.UNMONITOR_DELETE_EXISTING,
      name: globalT`Unmonitor show, delete existing episodes`,
    },
    {
      id: ServarrAction.UNMONITOR,
      name: globalT`Unmonitor show + seasons, keep files`,
    },
    {
      id: ServarrAction.DO_NOTHING,
      name: globalT`Do nothing`,
    },
    {
      id: ServarrAction.CHANGE_QUALITY_PROFILE,
      name: globalT`Change quality profile and search`,
    },
  ])

const buildSonarrSeasonActionOptions = () =>
  sortActionOptions([
    {
      id: ServarrAction.DELETE,
      name: globalT`Unmonitor and delete season`,
    },
    {
      id: ServarrAction.DELETE_SHOW_IF_EMPTY,
      name: globalT`Unmonitor and delete season + delete show if empty`,
    },
    {
      id: ServarrAction.UNMONITOR_DELETE_EXISTING,
      name: globalT`Unmonitor and delete existing episodes`,
    },
    {
      id: ServarrAction.UNMONITOR,
      name: globalT`Unmonitor season and keep files`,
    },
    {
      id: ServarrAction.UNMONITOR_SHOW_IF_EMPTY,
      name: globalT`Unmonitor season + unmonitor show if empty`,
    },
    {
      id: ServarrAction.DO_NOTHING,
      name: globalT`Do nothing`,
    },
  ])

const buildSonarrEpisodeActionOptions = () =>
  sortActionOptions([
    {
      id: ServarrAction.DELETE,
      name: globalT`Unmonitor and delete episode`,
    },
    {
      id: ServarrAction.UNMONITOR,
      name: globalT`Unmonitor and keep file`,
    },
    {
      id: ServarrAction.DO_NOTHING,
      name: globalT`Do nothing`,
    },
  ])

const buildSportarrShowActionOptions = () =>
  sortActionOptions([
    {
      id: ServarrAction.DELETE,
      name: globalT`Delete entire league`,
    },
    {
      id: ServarrAction.UNMONITOR,
      name: globalT`Unmonitor league, keep files`,
    },
    {
      id: ServarrAction.DO_NOTHING,
      name: globalT`Do nothing`,
    },
    {
      id: ServarrAction.CHANGE_QUALITY_PROFILE,
      name: globalT`Change quality profile`,
    },
  ])

const buildSportarrSeasonActionOptions = () =>
  sortActionOptions([
    {
      id: ServarrAction.DELETE,
      name: globalT`Unmonitor season, delete event files`,
    },
    {
      id: ServarrAction.UNMONITOR,
      name: globalT`Unmonitor season, keep files`,
    },
    {
      id: ServarrAction.DO_NOTHING,
      name: globalT`Do nothing`,
    },
  ])

const buildSportarrEpisodeActionOptions = () =>
  sortActionOptions([
    {
      id: ServarrAction.DELETE,
      name: globalT`Delete event file`,
    },
    {
      id: ServarrAction.UNMONITOR,
      name: globalT`Unmonitor event, keep file`,
    },
    {
      id: ServarrAction.DO_NOTHING,
      name: globalT`Do nothing`,
    },
  ])

export const ruleGroupFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => globalT`Name is required` }),
    description: z.string().optional(),
    libraryId: z
      .string()
      .trim()
      .min(1, { error: () => globalT`Library is required` }),
    dataType: z
      .string()
      .trim()
      .min(1, { error: () => globalT`Media type is required` }),
    arrAction: z
      .preprocess(
        numberOrUndefined,
        z
          .number()
          .int({ error: () => globalT`Invalid action` })
          .optional(),
      )
      .optional(),
    deleteAfterDays: z
      .preprocess(
        numberOrUndefined,
        z
          .number()
          .int({
            error: () => globalT`Take action after days must be a whole number`,
          })
          .min(0, {
            error: () => globalT`Take action after days must be 0 or greater`,
          })
          .max(DELETE_AFTER_MAX_DAYS, {
            error: () =>
              globalT`Take action after days must be ${{ max: DELETE_AFTER_MAX_DAYS }} or less`,
          })
          .optional(),
      )
      .optional(),
    keepLogsForMonths: z.preprocess(
      numberOrUndefined,
      z
        .number()
        .int({
          error: () => globalT`Keep logs for months must be a whole number`,
        })
        .min(0, {
          error: () => globalT`Keep logs for months must be 0 or greater`,
        }),
    ),
    tautulliWatchedPercentOverride: z
      .preprocess(
        numberOrUndefined,
        z
          .number()
          .int({
            error: () =>
              globalT`Tautulli watched percent override must be a whole number`,
          })
          .min(0, { error: () => globalT`Minimum is 0` })
          .max(100, { error: () => globalT`Maximum is 100` })
          .optional(),
      )
      .optional(),
    showRecommended: z.boolean(),
    showHome: z.boolean(),
    overlayEnabled: z.boolean(),
    overlayTemplateId: z.number().int().nullable().optional(),
    listExclusions: z.boolean(),
    cleanupLeftoverFolders: z.boolean(),
    forceSeerr: z.boolean(),
    manualCollection: z.boolean(),
    manualCollectionName: z.string().optional(),
    sortTitle: z.string().optional(),
    mediaServerSort: z.string().optional(),
    active: z.boolean(),
    useRules: z.boolean(),
    radarrSettingsId: z.number().int().nullable().optional(),
    sonarrSettingsId: z.number().int().nullable().optional(),
    sportarrSettingsId: z.number().int().nullable().optional(),
    radarrQualityProfileId: z.number().int().nullable().optional(),
    sonarrQualityProfileId: z.number().int().nullable().optional(),
    sportarrQualityProfileId: z.number().int().nullable().optional(),
    tagInArr: z.boolean().optional(),
    keepInMaintainerrOnly: z.boolean().optional(),
    ruleHandlerCronSchedule: z.preprocess(
      (val) => (val === '' ? null : val),
      z
        .string()
        .refine((val) => (val != null ? isValidCron(val) : true), {
          // A function, so validation messages resolve in the active locale
          // rather than the one loaded when this module was imported.
          error: () => globalT`Invalid cron schedule`,
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
      error: () => globalT`Custom collection name is required`,
    },
  )
  .refine(
    (data) =>
      data.arrAction === undefined ||
      data.arrAction === ServarrAction.DO_NOTHING ||
      data.arrAction === ServarrAction.CHANGE_QUALITY_PROFILE ||
      data.deleteAfterDays !== undefined,
    {
      path: ['deleteAfterDays'],
      error: () => globalT`Take action after days is required for this action`,
    },
  )
  .superRefine((data, ctx) => {
    if (data.arrAction === ServarrAction.CHANGE_QUALITY_PROFILE) {
      const isMovie = data.dataType === 'movie'
      const isShow = data.dataType === 'show'

      if (isMovie && data.radarrQualityProfileId == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['radarrQualityProfileId'],
          message: globalT`Quality profile is required for this action`,
        })
      }

      // A show library is managed by exactly one of Sonarr/Sportarr; require
      // the profile of whichever manager the collection is bound to.
      if (isShow && data.sportarrSettingsId != null) {
        if (data.sportarrQualityProfileId == null) {
          ctx.addIssue({
            code: 'custom',
            path: ['sportarrQualityProfileId'],
            message: globalT`Quality profile is required for this action`,
          })
        }
      } else if (isShow && data.sonarrQualityProfileId == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['sonarrQualityProfileId'],
          message: globalT`Quality profile is required for this action`,
        })
      }
    }
  })

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
  overlayEnabled: editData?.collection?.overlayEnabled ?? false,
  overlayTemplateId: editData?.collection?.overlayTemplateId ?? null,
  listExclusions: editData?.collection?.listExclusions ?? true,
  cleanupLeftoverFolders: editData?.collection?.cleanupLeftoverFolders ?? false,
  forceSeerr: editData?.collection?.forceSeerr ?? false,
  manualCollection: editData?.collection?.manualCollection ?? false,
  manualCollectionName: editData?.collection?.manualCollectionName ?? '',
  sortTitle: editData?.collection?.sortTitle ?? '',
  mediaServerSort: editData?.collection?.mediaServerSort ?? '',
  active: editData?.isActive ?? true,
  useRules: editData?.useRules ?? true,
  radarrSettingsId: editData
    ? (editData.collection?.radarrSettingsId ?? null)
    : undefined,
  sonarrSettingsId: editData
    ? (editData.collection?.sonarrSettingsId ?? null)
    : undefined,
  sportarrSettingsId: editData
    ? (editData.collection?.sportarrSettingsId ?? null)
    : undefined,
  radarrQualityProfileId: editData
    ? (editData.collection?.radarrQualityProfileId ?? undefined)
    : undefined,
  sonarrQualityProfileId: editData
    ? (editData.collection?.sonarrQualityProfileId ?? undefined)
    : undefined,
  sportarrQualityProfileId: editData
    ? (editData.collection?.sportarrQualityProfileId ?? undefined)
    : undefined,
  tagInArr: editData?.collection?.tagInArr ?? false,
  keepInMaintainerrOnly: editData?.collection?.keepInMaintainerrOnly ?? false,
  ruleHandlerCronSchedule: editData?.ruleHandlerCronSchedule ?? null,
})

/**
 * Tell the user that some rules were dropped because a property isn't available
 * (no equivalent on the configured media server, or an unresolved identifier).
 * Shared by the community import, YAML import and YAML export paths, so the copy
 * stays neutral about direction.
 */
// Persisted as the collection's real name on the media server, so it must not
// change with the UI locale. The field's placeholder previews this same stored
// value, which is why neither is translated.
const DEFAULT_MANUAL_COLLECTION_NAME = 'My custom collection'

const notifySkippedRules = (skipped: number) => {
  if (skipped <= 0) return
  toast.warn(
    plural(skipped, {
      one: "# rule was skipped - it uses a property that isn't available.",
      other:
        "# rules were skipped - they use properties that aren't available.",
    }),
    { autoClose: 6000 },
  )
}

const AddModal = (props: AddModal) => {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { isPlex, isJellyfin, isEmby, mediaServerType } = useMediaServerType()
  const mediaServerName = isPlex
    ? 'Plex'
    : isJellyfin
      ? 'Jellyfin'
      : isEmby
        ? 'Emby'
        : t`your media server`
  const supportsCollectionSort = supportsFeature(
    mediaServerType,
    MediaServerFeature.COLLECTION_SORT,
  )
  // Both Plex and Jellyfin call them "Collections" in their GUI (Jellyfin's
  // internal API type is "BoxSet" but the user-facing term is "Collection"), so
  // the word is written into each sentence below rather than interpolated: a
  // bare noun dropped into a sentence cannot be declined by a translator.
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
    error: createError,
    isPending: isCreatePending,
  } = useCreateRuleGroup()
  const {
    mutateAsync: updateRuleGroup,
    error: updateError,
    isPending: isUpdatePending,
  } = useUpdateRuleGroup()

  // The server names what it rejected ("Operator is required for every rule
  // after the first"); saying "something went wrong" instead left the user to
  // guess which of the form's values it meant.
  const saveError = createError ?? updateError
  const saveErrorMessage = saveError
    ? getApiErrorMessage(saveError, t`The rule group could not be saved`)
    : undefined

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
  const overlayEnabled = useWatch({ control, name: 'overlayEnabled' })
  const overlayTemplateId = useWatch({
    control,
    name: 'overlayTemplateId',
  }) as number | null | undefined
  const useRulesEnabled = useWatch({ control, name: 'useRules' })
  const arrActionValue = useWatch({ control, name: 'arrAction' }) as
    number | undefined
  const radarrSettingsId = useWatch({ control, name: 'radarrSettingsId' }) as
    number | null | undefined
  const sonarrSettingsId = useWatch({ control, name: 'sonarrSettingsId' }) as
    number | null | undefined
  const sportarrSettingsId = useWatch({
    control,
    name: 'sportarrSettingsId',
  }) as number | null | undefined
  const radarrQualityProfileId = useWatch({
    control,
    name: 'radarrQualityProfileId',
  }) as number | null | undefined
  const sonarrQualityProfileId = useWatch({
    control,
    name: 'sonarrQualityProfileId',
  }) as number | null | undefined
  const sportarrQualityProfileId = useWatch({
    control,
    name: 'sportarrQualityProfileId',
  }) as number | null | undefined
  const hasSelectedRadarrServer = radarrSettingsId != null
  const hasSelectedSonarrServer = sonarrSettingsId != null
  // Which folder the chosen action strands, or undefined when it strands none.
  // leftoverCleanupScope is shared with the server, so the checkbox is offered
  // for exactly the actions the handlers act on.
  const cleanupScope =
    arrActionValue !== undefined && isValidMediaItemType(selectedType)
      ? leftoverCleanupScope(selectedType, arrActionValue)
      : undefined
  // Which *arr owns this collection: movie libraries are Radarr's, every other
  // type (show, season, episode) is Sonarr's.
  const cleanupArrName = selectedType === 'movie' ? 'Radarr' : 'Sonarr'
  const hasSelectedSportarrServer = sportarrSettingsId != null
  // Named locals so the extracted sentences carry readable placeholders.
  const tagArrName = selectedLibraryType === 'movie' ? 'Radarr' : 'Sonarr'
  const listExclusionArrName = radarrSettingsId
    ? 'Radarr'
    : sonarrSettingsId
      ? 'Sonarr'
      : ''
  const [showCommunityModal, setShowCommunityModal] = useState(false)
  const [yamlImporterModal, setYamlImporterModal] = useState(false)
  const [configureNotificationModal, setConfigureNotificationModal] =
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
  // Which *arr manages a show-library collection. A Plex "show" library can be
  // a TV library (Sonarr) or a sports library (Sportarr), so the user picks one
  // per collection. Only surfaced when a Sportarr server exists.
  const [showLibraryManager, setShowLibraryManager] = useState<
    'Sonarr' | 'Sportarr'
  >(
    props.editData?.collection?.sportarrSettingsId != null
      ? 'Sportarr'
      : 'Sonarr',
  )
  const [overlayTemplates, setOverlayTemplates] = useState<OverlayTemplate[]>(
    [],
  )
  const [overlayTemplatesLoaded, setOverlayTemplatesLoaded] = useState(false)
  const [pendingDisableSubmit, setPendingDisableSubmit] =
    useState<RuleGroupFormOutput | null>(null)

  const overlayTemplateMode = isValidMediaItemType(selectedType)
    ? overlayModeForType(selectedType)
    : 'poster'
  const availableOverlayTemplates = overlayTemplates.filter(
    (template) => template.mode === overlayTemplateMode,
  )

  const {
    data: libraries,
    isLoading: librariesLoading,
    isError: librariesError,
  } = useMediaServerLibraries()
  const storedLibraryId = props.editData?.libraryId?.toString()
  const {
    storedLibraryResolved,
    storedLibraryMissing,
    showStoredLibraryFallback,
  } = getStoredLibraryFallbackState(
    storedLibraryId,
    libraries,
    librariesLoading,
    librariesError,
  )

  const { data: constants, isLoading: constantsLoading } = useRuleConstants()

  useEffect(() => {
    void getOverlayTemplates().then((templates) => {
      if (templates) {
        setOverlayTemplates(templates)
      }
      setOverlayTemplatesLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!overlayTemplatesLoaded || overlayTemplateId == null) {
      return
    }

    const hasMatchingTemplate = availableOverlayTemplates.some(
      (template) => template.id === overlayTemplateId,
    )

    if (!hasMatchingTemplate) {
      setValue('overlayTemplateId', null)
    }
  }, [
    overlayTemplatesLoaded,
    availableOverlayTemplates,
    overlayTemplateId,
    setValue,
  ])

  // Scroll detection without useEffect
  const atBottom = useSyncExternalStore(
    scrollStore.subscribe,
    scrollStore.getSnapshot,
    scrollStore.getServerSnapshot,
  )

  const tautulliEnabled =
    constants?.applications?.some((x) => x.id == Application.TAUTULLI) ?? false
  const seerrEnabled =
    constants?.applications?.some((x) => x.id == Application.SEERR) ?? false

  // Only surface the Sportarr manager option once a Sportarr server exists, so
  // the existing Sonarr/Radarr collection flow is unchanged for everyone else.
  const { data: sportarrSettingsList } = useServarrSettings('sportarr')
  const hasSportarrConfigured = (sportarrSettingsList?.length ?? 0) > 0

  function updateLibraryId(value: string) {
    // Selecting the unresolved stored-library fallback keeps the original
    // library type intact instead of resetting dependent state based on an
    // entry the media server could not resolve.
    if (value === storedLibraryId && !storedLibraryResolved) {
      if (props.editData?.dataType) {
        setValue('dataType', props.editData.dataType)
      }
      return
    }

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
    setValue('sportarrSettingsId', undefined)
    setValue('radarrQualityProfileId', undefined)
    setValue('sonarrQualityProfileId', undefined)
    setValue('sportarrQualityProfileId', undefined)
    setValue('tagInArr', false)
    setValue('cleanupLeftoverFolders', false)
    setShowLibraryManager('Sonarr')
    updateArrOption(ServarrAction.DELETE)

    // Clear rules that reference *arr servers since we're resetting them
    const filtered = filterRulesForArrSettings(
      rules,
      undefined,
      undefined,
      undefined,
    )
    if (filtered.length !== rules.length) {
      setRules(filtered)
      setRuleCreatorVersion((v) => v + 1)
    }
  }

  // Switch which *arr manages a show-library collection. Clears the other
  // manager's selection so only one is ever set, and resets the action.
  const handleShowManagerChange = (manager: 'Sonarr' | 'Sportarr') => {
    setShowLibraryManager(manager)
    setValue('sonarrSettingsId', undefined)
    setValue('sportarrSettingsId', undefined)
    setValue('sonarrQualityProfileId', undefined)
    setValue('sportarrQualityProfileId', undefined)
    setValue('tagInArr', false)
    setValue('cleanupLeftoverFolders', false)
    updateArrOption(ServarrAction.DELETE)

    const filtered = filterRulesForArrSettings(
      rules,
      radarrSettingsId,
      undefined,
      undefined,
    )
    if (filtered.length !== rules.length) {
      setRules(filtered)
      setRuleCreatorVersion((v) => v + 1)
    }
  }

  function updateArrOption(value: number | undefined) {
    setValue('arrAction', value)

    if (
      value === undefined ||
      value === ServarrAction.DO_NOTHING ||
      value === ServarrAction.CHANGE_QUALITY_PROFILE
    ) {
      setValue('deleteAfterDays', undefined)
    } else if (getValues('deleteAfterDays') === undefined) {
      setValue('deleteAfterDays', 30)
    }

    // Clear quality profile IDs when switching away from quality profile change
    if (value !== ServarrAction.CHANGE_QUALITY_PROFILE) {
      setValue('radarrQualityProfileId', undefined)
      setValue('sonarrQualityProfileId', undefined)
      setValue('sportarrQualityProfileId', undefined)
    }

    // Drop the leftover-folder cleanup opt-in when the new action strands no
    // folder; the checkbox hides with it, so don't leave a destructive option
    // enabled out of sight. The server clamps the same way on save.
    const dataType = getValues('dataType')
    if (
      value === undefined ||
      !isValidMediaItemType(dataType) ||
      leftoverCleanupScope(dataType, value) === undefined
    ) {
      setValue('cleanupLeftoverFolders', false)
    }
  }

  const handleUpdateArrAction = (
    type: 'Radarr' | 'Sonarr' | 'Sportarr',
    arrAction: number,
    settingId?: number | null,
  ) => {
    updateArrOption(arrAction)

    if (type === 'Radarr' && settingId !== radarrSettingsId) {
      setValue('radarrQualityProfileId', undefined)
    }

    if (type === 'Sonarr' && settingId !== sonarrSettingsId) {
      setValue('sonarrQualityProfileId', undefined)
    }

    if (type === 'Sportarr' && settingId !== sportarrSettingsId) {
      setValue('sportarrQualityProfileId', undefined)
    }

    // Drop the membership-tag and leftover-cleanup opt-ins if the matching *arr
    // server is deselected; both checkboxes hide with the server, so don't
    // leave a stale enabled flag.
    if (settingId == null) {
      setValue('tagInArr', false)
      setValue('cleanupLeftoverFolders', false)
    }

    // A collection is managed by exactly one *arr, so selecting a server for one
    // clears the other two.
    const newRadarrId = type === 'Radarr' ? settingId : undefined
    const newSonarrId = type === 'Sonarr' ? settingId : undefined
    const newSportarrId = type === 'Sportarr' ? settingId : undefined

    setValue('radarrSettingsId', newRadarrId)
    setValue('sonarrSettingsId', newSonarrId)
    setValue('sportarrSettingsId', newSportarrId)

    // Filter out rules that reference the deselected *arr server
    const filtered = filterRulesForArrSettings(
      rules,
      newRadarrId,
      newSonarrId,
      newSportarrId,
    )
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
      alert(t`Please select a library first.`)
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
      notifySkippedRules(response.skipped ?? 0)

      if (!yamlImporterModal) {
        setYamlImporterModal(true)
      } else {
        setYamlImporterModal(false)
      }
    }
  }

  const toggleYamlImporter = () => {
    if (selectedLibraryType == null) {
      alert(t`Please select a library first.`)
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
      toast.success(t`Successfully imported rules from Yaml.`, {
        autoClose: 5000,
      })
      notifySkippedRules(response.skipped ?? 0)
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
      notifySkippedRules(rules.length - migratedRules.length)
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

    // Disabling an active rule group freezes its tracked items rather than
    // clearing them - confirm so users don't expect the linked collection to
    // drain on its own.
    const isDisablingActiveGroup =
      props.editData &&
      !props.isCloneMode &&
      props.editData.isActive &&
      !data.active

    if (isDisablingActiveGroup) {
      setPendingDisableSubmit(data)
      return
    }

    await performSubmit(data)
  }

  const performSubmit = async (data: RuleGroupFormOutput) => {
    const creationObj: RuleGroupCreatePayload = {
      name: data.name,
      description: data.description ?? '',
      libraryId: data.libraryId,
      arrAction: data.arrAction ?? ServarrAction.DELETE,
      dataType: data.dataType as MediaItemType,
      isActive: data.active,
      useRules: data.useRules,
      listExclusions: data.listExclusions,
      cleanupLeftoverFolders: data.cleanupLeftoverFolders,
      forceSeerr: data.forceSeerr,
      tautulliWatchedPercentOverride: data.tautulliWatchedPercentOverride,
      radarrSettingsId: data.radarrSettingsId ?? undefined,
      sonarrSettingsId: data.sonarrSettingsId ?? undefined,
      sportarrSettingsId: data.sportarrSettingsId ?? undefined,
      radarrQualityProfileId: data.radarrQualityProfileId ?? undefined,
      sonarrQualityProfileId: data.sonarrQualityProfileId ?? undefined,
      sportarrQualityProfileId: data.sportarrQualityProfileId ?? undefined,
      tagInArr: data.tagInArr ?? false,
      keepInMaintainerrOnly: data.manualCollection
        ? false
        : (data.keepInMaintainerrOnly ?? false),
      collection: {
        visibleOnRecommended: data.showRecommended,
        visibleOnHome: data.showHome,
        overlayEnabled: data.overlayEnabled,
        overlayTemplateId: data.overlayTemplateId ?? null,
        deleteAfterDays:
          data.arrAction === undefined ||
          data.arrAction === ServarrAction.DO_NOTHING ||
          data.arrAction === ServarrAction.CHANGE_QUALITY_PROFILE
            ? undefined
            : data.deleteAfterDays,
        manualCollection: data.manualCollection,
        manualCollectionName:
          data.manualCollectionName ?? DEFAULT_MANUAL_COLLECTION_NAME,
        keepLogsForMonths: data.keepLogsForMonths,
        sortTitle: data.sortTitle?.trim() ? data.sortTitle : undefined,
        mediaServerSort: parseCollectionSortKey(data.mediaServerSort ?? '')
          ?.key,
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
      toast.error(
        getApiErrorMessage(mutationError, t`The rule group could not be saved`),
      )
    }
  }

  const handleClone = () => {
    if (props.editData && !props.isCloneMode) {
      navigate(`/rules/clone/${props.editData.id}`)
    }
  }

  // Only hard-block on rule constants: the form can't render its applications,
  // rule operators, or field options without them. Libraries are allowed to
  // stream in later - when editing, the stored library is surfaced via
  // `storedLibraryMissing` so the form remains usable even if the media
  // server is offline. For brand-new rule groups we still wait for libraries
  // because there's no fallback selection to preserve.
  if (constantsLoading || (librariesLoading && !props.editData)) {
    return <LoadingSpinner />
  }

  const clonedRuleGroupName = props.editData?.name

  return (
    <>
      <div className="h-full w-full">
        <div className="mb-5 flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <div className="ml-0">
            <h3 className="heading">
              <Trans>Rule Group Settings</Trans>
            </h3>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {props.editData && !props.isCloneMode && (
              <Button buttonType="primary" type="button" onClick={handleClone}>
                <DocumentDuplicateIcon />
                <span>
                  <Trans>Clone</Trans>
                </span>
              </Button>
            )}
            <Button
              buttonType="default"
              type="button"
              as="a"
              target="_blank"
              rel="noopener noreferrer"
              href="https://docs.maintainerr.info/rules"
            >
              <QuestionMarkCircleIcon />
              <span>
                <Trans>Help</Trans>
              </span>
            </Button>
          </div>
        </div>

        {props.editData && props.isCloneMode && (
          <Alert type="info">
            <Trans>
              {/* Doubled apostrophes are the ICU escape for a literal one;
                  a single quote would swallow the placeholder. */}
              You are cloning the rule group &apos;&apos;{clonedRuleGroupName}
              &apos;&apos;.
            </Trans>
          </Alert>
        )}

        {saveErrorMessage && <Alert>{saveErrorMessage}</Alert>}

        {formIncomplete && (
          <Alert>
            <Trans>
              Not all required (*) fields contain values and at least 1 valid
              rule is required
            </Trans>
          </Alert>
        )}
        <form className="flex flex-col" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {/* Start Left side of top section */}
            <div className="flex flex-col items-center">
              <h2 className="mb-2 flex justify-center font-semibold text-zinc-100">
                <Trans>General</Trans>
              </h2>
              <div className="flex w-full flex-col rounded-lg bg-zinc-800 px-3 py-1">
                <div className="md:p-4">
                  <div className="form-row items-center">
                    <label htmlFor="name" className="text-label">
                      <Trans>Name *</Trans>
                      <p className="text-xs font-normal">
                        <Trans>
                          Will also be the name of the collection in{' '}
                          {mediaServerName}.
                        </Trans>
                      </p>
                    </label>
                    <div className="form-input">
                      <div className="form-input-field">
                        <Input id="name" type="text" {...register('name')} />
                      </div>
                      {errors.name && (
                        <p className="mt-1 text-xs text-error-400">
                          {errors.name.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="form-row items-center">
                    <label htmlFor="description" className="text-label">
                      <Trans>Description</Trans>
                    </label>
                    <div className="form-input">
                      <div className="form-input-field">
                        <textarea
                          id="description"
                          className="field-sizing-content min-h-30"
                          rows={5}
                          {...register('description')}
                        ></textarea>
                      </div>
                    </div>
                  </div>

                  <div className="form-row items-center">
                    <label htmlFor="library" className="text-label">
                      <Trans>Library *</Trans>
                    </label>
                    <div className="form-input">
                      <div className="form-input-field">
                        <Select
                          id="library"
                          {...register('libraryId', {
                            onChange: (event) =>
                              updateLibraryId(event.target.value),
                          })}
                        >
                          {selectedLibraryId === '' && (
                            <option value="" disabled></option>
                          )}
                          {showStoredLibraryFallback && storedLibraryId && (
                            <option value={storedLibraryId}>
                              {t`Stored library (unavailable)`}
                            </option>
                          )}
                          {libraries?.map((data: MediaLibrary) => {
                            return (
                              <option key={data.id} value={data.id}>
                                {data.title}
                              </option>
                            )
                          })}
                        </Select>
                      </div>
                      {(librariesError || storedLibraryMissing) && (
                        <p className="mt-1 text-xs text-warning-500">
                          {librariesError
                            ? t`Could not load libraries from ${{ mediaServerName }}. The saved library selection is preserved - cancel editing to avoid losing rules.`
                            : t`The saved library could not be found in the current library list. Re-select it once your media server is reachable.`}
                        </p>
                      )}
                      {errors.libraryId && (
                        <p className="mt-1 text-xs text-error-400">
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
                      onUpdate={(
                        arrAction: number,
                        settingId?: number | null,
                      ) => {
                        handleUpdateArrAction('Radarr', arrAction, settingId)
                      }}
                      options={buildRadarrActionOptions()}
                    />
                  )}

                  {selectedLibraryType &&
                    selectedLibraryType === 'movie' &&
                    hasSelectedRadarrServer &&
                    arrActionValue === ServarrAction.CHANGE_QUALITY_PROFILE && (
                      <QualityProfileSelector
                        type="Radarr"
                        settingId={radarrSettingsId}
                        qualityProfileId={radarrQualityProfileId}
                        onUpdate={(qualityProfileId) => {
                          setValue('radarrQualityProfileId', qualityProfileId)
                        }}
                        error={errors.radarrQualityProfileId?.message}
                      />
                    )}

                  {selectedLibraryType && selectedLibraryType !== 'movie' && (
                    <>
                      <div className="form-row items-center">
                        <label htmlFor="type" className="text-label">
                          <Trans>Media type*</Trans>
                          <p className="text-xs font-normal">
                            <Trans>
                              The type of TV media rules should apply to
                            </Trans>
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <Select
                              id="type"
                              {...register('dataType', {
                                onChange: () =>
                                  updateArrOption(ServarrAction.DELETE),
                              })}
                            >
                              {/* Show TV-related types: show, season, episode */}
                              <option value="show">{t`Shows`}</option>
                              <option value="season">{t`Seasons`}</option>
                              <option value="episode">{t`Episodes`}</option>
                            </Select>
                          </div>
                          {errors.dataType && (
                            <p className="mt-1 text-xs text-error-400">
                              {errors.dataType.message}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* A "show" library can be TV (Sonarr) or sports
                          (Sportarr); let the user pick which manages this
                          collection. Only shown when Sportarr is configured,
                          so the Sonarr-only flow is unchanged otherwise. */}
                      {hasSportarrConfigured && (
                        <div className="form-row items-center">
                          <label
                            htmlFor="show-library-manager"
                            className="text-label"
                          >
                            <Trans>Managed by</Trans>
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <Select
                                name="show-library-manager"
                                id="show-library-manager"
                                value={showLibraryManager}
                                onChange={(e) =>
                                  handleShowManagerChange(
                                    e.target.value as 'Sonarr' | 'Sportarr',
                                  )
                                }
                              >
                                <option value="Sonarr">Sonarr</option>
                                <option value="Sportarr">Sportarr</option>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}

                      {(!hasSportarrConfigured ||
                        showLibraryManager === 'Sonarr') && (
                        <>
                          <ArrAction
                            type="Sonarr"
                            mediaServerName={mediaServerName}
                            arrAction={arrActionValue}
                            settingId={sonarrSettingsId}
                            onUpdate={(
                              e: number,
                              settingId?: number | null,
                            ) => {
                              handleUpdateArrAction('Sonarr', e, settingId)
                            }}
                            options={
                              selectedType === 'show'
                                ? buildSonarrShowActionOptions()
                                : selectedType === 'season'
                                  ? buildSonarrSeasonActionOptions()
                                  : // episodes
                                    buildSonarrEpisodeActionOptions()
                            }
                          />
                          {errors.sonarrSettingsId && (
                            <p className="mt-1 text-xs text-error-400">
                              {errors.sonarrSettingsId.message}
                            </p>
                          )}

                          {hasSelectedSonarrServer &&
                            arrActionValue ===
                              ServarrAction.CHANGE_QUALITY_PROFILE && (
                              <QualityProfileSelector
                                type="Sonarr"
                                settingId={sonarrSettingsId}
                                qualityProfileId={sonarrQualityProfileId}
                                onUpdate={(qualityProfileId) => {
                                  setValue(
                                    'sonarrQualityProfileId',
                                    qualityProfileId,
                                  )
                                }}
                                error={errors.sonarrQualityProfileId?.message}
                              />
                            )}
                        </>
                      )}

                      {hasSportarrConfigured &&
                        showLibraryManager === 'Sportarr' && (
                          <>
                            <ArrAction
                              type="Sportarr"
                              mediaServerName={mediaServerName}
                              arrAction={arrActionValue}
                              settingId={sportarrSettingsId}
                              onUpdate={(
                                e: number,
                                settingId?: number | null,
                              ) => {
                                handleUpdateArrAction('Sportarr', e, settingId)
                              }}
                              options={
                                selectedType === 'show'
                                  ? buildSportarrShowActionOptions()
                                  : selectedType === 'season'
                                    ? buildSportarrSeasonActionOptions()
                                    : // episodes
                                      buildSportarrEpisodeActionOptions()
                              }
                            />
                            {errors.sportarrSettingsId && (
                              <p className="mt-1 text-xs text-error-400">
                                {errors.sportarrSettingsId.message}
                              </p>
                            )}

                            {hasSelectedSportarrServer &&
                              arrActionValue ===
                                ServarrAction.CHANGE_QUALITY_PROFILE && (
                                <QualityProfileSelector
                                  type="Sportarr"
                                  settingId={sportarrSettingsId}
                                  qualityProfileId={sportarrQualityProfileId}
                                  onUpdate={(qualityProfileId) => {
                                    setValue(
                                      'sportarrQualityProfileId',
                                      qualityProfileId,
                                    )
                                  }}
                                  error={
                                    errors.sportarrQualityProfileId?.message
                                  }
                                />
                              )}
                          </>
                        )}
                    </>
                  )}

                  {arrActionValue !== undefined &&
                    arrActionValue !== ServarrAction.DO_NOTHING &&
                    arrActionValue !== ServarrAction.CHANGE_QUALITY_PROFILE && (
                      <div className="form-row items-center">
                        <label
                          htmlFor="collection_deleteDays"
                          className="text-label"
                        >
                          <Trans>Take action after days*</Trans>
                          <p className="text-xs font-normal">
                            <Trans>
                              Duration of days media remains in the collection
                              before deletion/unmonitor
                            </Trans>
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <Input
                              type="number"
                              id="collection_deleteDays"
                              min={0}
                              max={DELETE_AFTER_MAX_DAYS}
                              {...register('deleteAfterDays')}
                            />
                          </div>
                          {errors.deleteAfterDays && (
                            <p className="mt-1 text-xs text-error-400">
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
                <Trans>Options</Trans>
              </h2>
              <div className="flex w-full flex-col rounded-lg bg-zinc-800 px-3 py-1">
                <div className="grid grid-cols-1 md:grid-cols-2 md:gap-3">
                  {/* Checkbox Options */}
                  <div className="flex flex-col p-2 md:my-2 md:border-r-2 md:border-dashed md:border-zinc-700 md:p-4">
                    <div className="flex flex-row items-center justify-between py-4">
                      <label htmlFor="is_active" className="text-label">
                        <Trans>Active</Trans>
                        <p className="text-xs font-normal">
                          <Trans>Will this rule be included in rule runs</Trans>
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="checkbox"
                            id="is_active"
                            className="checkbox"
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
                            <Trans>
                              Show on {mediaServerName} library recommended
                            </Trans>
                            <p className="text-xs font-normal">
                              <Trans>
                                Show the collection on the {mediaServerName}{' '}
                                library recommended screen
                              </Trans>
                            </p>
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <input
                                type="checkbox"
                                id="collection_visible_library"
                                className="checkbox"
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
                            <Trans>Show on {mediaServerName} home</Trans>
                            <p className="text-xs font-normal">
                              <Trans>
                                Show the collection on the {mediaServerName}{' '}
                                home screen
                              </Trans>
                            </p>
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <input
                                type="checkbox"
                                id="collection_visible"
                                className="checkbox"
                                {...register('showHome')}
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex flex-row items-center justify-between py-4">
                      <label htmlFor="overlay_enabled" className="text-label">
                        <Trans>Enable overlays</Trans>
                        <p className="text-xs font-normal">
                          <Trans>
                            Apply date overlays to posters in this collection
                          </Trans>
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="checkbox"
                            id="overlay_enabled"
                            className="checkbox"
                            {...register('overlayEnabled')}
                          />
                        </div>
                      </div>
                    </div>

                    {overlayEnabled && (
                      <div className="form-row items-center">
                        <label
                          htmlFor="overlay_template_id"
                          className="text-label"
                        >
                          <Trans>Overlay template</Trans>
                          <p className="text-xs font-normal">
                            {overlayTemplateMode === 'titlecard' ? (
                              <Trans>
                                Leave unset to use the default title card
                                template
                              </Trans>
                            ) : (
                              <Trans>
                                Leave unset to use the default poster template
                              </Trans>
                            )}
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <Controller
                              name="overlayTemplateId"
                              control={control}
                              render={({ field }) => (
                                <Select
                                  id="overlay_template_id"
                                  value={field.value ?? ''}
                                  onChange={(event) => {
                                    const value = event.target.value
                                    field.onChange(
                                      value === '' ? null : Number(value),
                                    )
                                  }}
                                >
                                  <option value="">
                                    {overlayTemplateMode === 'titlecard'
                                      ? t`Default title card template`
                                      : t`Default poster template`}
                                  </option>
                                  {availableOverlayTemplates.map((template) => (
                                    <option
                                      key={template.id}
                                      value={template.id}
                                    >
                                      {template.isDefault
                                        ? t`${{ templateName: template.name }} (default)`
                                        : template.name}
                                    </option>
                                  ))}
                                </Select>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {(radarrSettingsId != null ||
                      (sonarrSettingsId != null &&
                        ((arrActionValue === ServarrAction.DELETE &&
                          selectedType === 'show') ||
                          (arrActionValue ===
                            ServarrAction.DELETE_SHOW_IF_EMPTY &&
                            selectedType === 'season')))) && (
                      <div className="flex flex-row items-center justify-between py-4">
                        <label htmlFor="list_exclusions" className="text-label">
                          <Trans>Add import list exclusions</Trans>
                          <p className="text-xs font-normal">
                            {selectedLibraryType === 'show' ? (
                              <Trans>
                                Prevents {listExclusionArrName} import lists
                                re-adding removed show
                              </Trans>
                            ) : (
                              <Trans>
                                Prevents {listExclusionArrName} import lists
                                re-adding removed movie
                              </Trans>
                            )}
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <input
                              type="checkbox"
                              id="list_exclusions"
                              className="checkbox"
                              {...register('listExclusions')}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Only the actions that delete an item's files one at a
                        time strand a folder; leftoverCleanupScope is the one
                        definition of which those are, shared with the server. */}
                    {cleanupScope !== undefined &&
                      ((selectedType === 'movie' && hasSelectedRadarrServer) ||
                        (selectedType !== 'movie' &&
                          hasSelectedSonarrServer)) && (
                        <div className="flex flex-row items-center justify-between py-4">
                          <label
                            htmlFor="cleanup_leftover_folders"
                            className="text-label"
                          >
                            <Trans>Clean up leftover folders</Trans>
                            <span className="ml-1.5 rounded-full bg-maintainerr-600 px-3 text-sm font-medium text-white">
                              BETA
                            </span>
                            <p className="text-xs font-normal">
                              <Trans>
                                Delete the folder {cleanupArrName} leaves behind
                                and its sidecars (subtitles, .nfo, artwork).
                                Requires the library mounted at the same path{' '}
                                {cleanupArrName} uses
                              </Trans>
                            </p>
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <input
                                type="checkbox"
                                id="cleanup_leftover_folders"
                                className="checkbox"
                                {...register('cleanupLeftoverFolders')}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Strict 'show' (not selectedLibraryType) on purpose:
                        Sonarr tags are series-level, so season/episode
                        collections - which map to 'show' - are excluded. */}
                    {((selectedLibraryType === 'movie' &&
                      hasSelectedRadarrServer) ||
                      (selectedType === 'show' && hasSelectedSonarrServer)) && (
                      <div className="flex flex-row items-center justify-between py-4">
                        <label htmlFor="tag_in_arr" className="text-label">
                          <Trans>Tag this content in {tagArrName}</Trans>
                          <p className="text-xs font-normal">
                            {selectedLibraryType === 'movie' ? (
                              <Trans>
                                Tag matching movies in {tagArrName} with a tag
                                based on this rule group&apos;s name while
                                they&apos;re in the collection, removed when
                                they leave
                              </Trans>
                            ) : (
                              <Trans>
                                Tag matching shows in {tagArrName} with a tag
                                based on this rule group&apos;s name while
                                they&apos;re in the collection, removed when
                                they leave
                              </Trans>
                            )}
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <input
                              type="checkbox"
                              id="tag_in_arr"
                              className="checkbox"
                              {...register('tagInArr')}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {seerrEnabled && selectedType !== 'episode' && (
                      <div className="flex flex-row items-center justify-between py-4">
                        <label htmlFor="force_seerr" className="text-label">
                          <Trans>Force delete Seerr request</Trans>
                          <p className="text-xs font-normal">
                            <Trans>
                              Removes the related Seerr request immediately.
                              Otherwise, Maintainerr waits for Seerr
                              availability sync.
                            </Trans>
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <input
                              type="checkbox"
                              id="force_seerr"
                              className="checkbox"
                              {...register('forceSeerr')}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-row items-center justify-between py-4">
                      <label htmlFor="use_rules" className="text-label">
                        <Trans>Use rules</Trans>
                        <p className="text-xs font-normal">
                          <Trans>Toggle the rule system</Trans>
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="checkbox"
                            id="use_rules"
                            className="checkbox"
                            {...register('useRules')}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-row items-center justify-between py-4">
                      <label htmlFor="manual_collection" className="text-label">
                        <Trans>Custom collection</Trans>
                        <p className="text-xs font-normal">
                          <Trans>Toggle internal collection system</Trans>
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field">
                          <input
                            type="checkbox"
                            id="manual_collection"
                            className="checkbox"
                            {...register('manualCollection')}
                          />
                        </div>
                      </div>
                    </div>
                    {!manualCollectionEnabled && (
                      <div className="flex flex-row items-center justify-between py-4">
                        <label
                          htmlFor="keep_in_maintainerr_only"
                          className="text-label"
                        >
                          <Trans>Keep in Maintainerr only</Trans>
                          <p className="text-xs font-normal">
                            <Trans>
                              Don&apos;t create this collection in{' '}
                              {mediaServerName}. Rules, actions, overlays and
                              tags keep working.
                            </Trans>
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field">
                            <input
                              type="checkbox"
                              id="keep_in_maintainerr_only"
                              className="checkbox"
                              {...register('keepInMaintainerrOnly')}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      className={`flex flex-col ${manualCollectionEnabled ? `` : `hidden`} `}
                    >
                      <label
                        htmlFor="manual_collection_name"
                        className="text-label"
                      >
                        <Trans>Custom collection name</Trans>
                        <p className="text-xs font-normal">
                          <Trans>
                            Collection must exist in {mediaServerName}
                          </Trans>
                        </p>
                      </label>

                      <div className="py-2">
                        <div className="form-input-field">
                          <Input
                            type="text"
                            id="manual_collection_name"
                            placeholder={DEFAULT_MANUAL_COLLECTION_NAME}
                            {...register('manualCollectionName')}
                          />
                        </div>
                        {errors.manualCollectionName && (
                          <p className="mt-1 text-xs text-error-400">
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
                        <Trans>Notifications</Trans>
                      </label>
                      <div className="flex justify-end px-2 py-2">
                        <div className="form-input-field w-32">
                          <Button
                            buttonType="default"
                            type="button"
                            name="notifications"
                            className="w-full bg-maintainerr-600! hover:bg-maintainerr!"
                            onClick={() => {
                              setConfigureNotificationModal(
                                !configureNotificationModal,
                              )
                            }}
                          >
                            <Trans>Configure</Trans>
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row items-center justify-between py-2 md:py-4">
                      <label
                        htmlFor="collection_logs_months"
                        className="text-label text-left"
                      >
                        <Trans>Keep logs for months*</Trans>
                        <p className="text-xs font-normal">
                          <Trans>
                            Duration for which collection logs should be
                            retained, measured in months (0 = forever)
                          </Trans>
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field flex w-32 flex-col">
                          <Input
                            type="number"
                            id="collection_logs_months"
                            min={0}
                            {...register('keepLogsForMonths')}
                          />
                          {errors.keepLogsForMonths && (
                            <p className="mt-1 text-xs text-error-400">
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
                        <Trans>Sort title</Trans>
                        <p className="text-xs font-normal">
                          <Trans>
                            Custom sort title for the collection in{' '}
                            {mediaServerName}
                          </Trans>
                        </p>
                      </label>
                      <div className="flex justify-end px-2 py-2">
                        <div className="form-input-field w-full">
                          <Input
                            type="text"
                            id="sort_title"
                            placeholder={t`e.g., ${{ sortPrefixExample: '001' }} My Collection`}
                            {...register('sortTitle')}
                          />
                        </div>
                      </div>
                    </div>

                    {supportsCollectionSort && (
                      <div className="flex flex-row items-center justify-between py-2 md:py-4">
                        <label
                          htmlFor="media_server_sort"
                          className="text-label text-left"
                        >
                          <Trans>Collection items sort</Trans>
                          <p className="text-xs font-normal">
                            <Trans>
                              Automatically sort items inside the collection on{' '}
                              {mediaServerName}. Disabling later does not
                              restore the default order - change it in{' '}
                              {mediaServerName} if needed.
                            </Trans>
                          </p>
                        </label>
                        <div className="flex justify-end px-2 py-2">
                          <div className="form-input-field w-full">
                            <Select
                              id="media_server_sort"
                              {...register('mediaServerSort')}
                            >
                              <option value="">{t`Default (no custom sort)`}</option>
                              {getCollectionMediaSortConfig(
                                selectedLibraryType,
                                true,
                              ).options.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    {isPlex && tautulliEnabled && useRulesEnabled && (
                      <div className="flex flex-row items-center justify-between py-2 md:py-4">
                        <label
                          htmlFor="tautulli_watched_percent_override"
                          className="text-label text-left"
                        >
                          <Trans>Tautulli watched percent override</Trans>
                          <p className="text-xs font-normal">
                            <Trans>
                              Overrides the configured Watched Percent in
                              Tautulli, which is used to determine when media is
                              counted as watched
                            </Trans>
                          </p>
                        </label>
                        <div className="form-input">
                          <div className="form-input-field flex w-32 flex-col">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              id="tautulli_watched_percent_override"
                              {...register('tautulliWatchedPercentOverride')}
                            />
                            {errors.tautulliWatchedPercentOverride && (
                              <p className="mt-1 text-xs text-error-400">
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
                        <Trans>Rule handler schedule override</Trans>
                        <p className="text-xs font-normal">
                          <Trans>
                            Supports all standard{' '}
                            <BrandLink external href="https://crontab.guru/">
                              cron
                            </BrandLink>{' '}
                            patterns
                          </Trans>
                        </p>
                      </label>
                      <div className="form-input">
                        <div className="form-input-field flex w-32 flex-col">
                          <Input
                            type="text"
                            id="rule_handler_cron_schedule"
                            {...register('ruleHandlerCronSchedule')}
                          />
                          {errors.ruleHandlerCronSchedule && (
                            <p className="mt-1 text-xs text-error-400">
                              {errors.ruleHandlerCronSchedule.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col py-2 md:py-4">
                      <label className="text-label text-left">
                        <Trans>Custom collection poster</Trans>
                        <p className="text-xs font-normal">
                          <Trans>
                            Upload your own cover art for the collection on{' '}
                            {mediaServerName}
                          </Trans>
                        </p>
                      </label>
                      <div className="py-2">
                        {props.editData?.collection?.id ? (
                          <CollectionPosterPicker
                            collectionId={props.editData.collection.id}
                            mediaServerName={mediaServerName}
                          />
                        ) : (
                          <p className="text-xs text-zinc-400">
                            <Trans>Save first to enable poster upload.</Trans>
                          </p>
                        )}
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
                      <h3 className="heading">
                        <Trans>Rules</Trans>
                      </h3>
                      <p className="description">
                        <Trans>
                          Specify the rules this group needs to enforce
                        </Trans>
                      </p>
                    </div>
                    <div className="ml-auto">
                      <Button
                        buttonType="success"
                        className="ml-3"
                        onClick={toggleCommunityRuleModal}
                        type="button"
                      >
                        <CloudDownloadIcon className="mr-2 h-5 w-5" />
                        <Trans>Community</Trans>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-center sm:justify-end">
                    <Button
                      buttonType="success"
                      className="ml-3"
                      onClick={toggleYamlImporter}
                      type="button"
                    >
                      <DownloadIcon className="mr-2 h-5 w-5" />
                      <Trans>Import</Trans>
                    </Button>

                    <Button
                      buttonType="success"
                      className="ml-3"
                      onClick={toggleYamlExporter}
                      type="button"
                    >
                      <UploadIcon className="mr-2 h-5 w-5" />
                      <Trans>Export</Trans>
                    </Button>
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
                  <LazyModalBoundary
                    title={yaml ? t`Export Rules YAML` : t`Import Rules YAML`}
                    onCancel={() => {
                      setYamlImporterModal(false)
                    }}
                    size="5xl"
                  >
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
                  </LazyModalBoundary>
                )}

                {configureNotificationModal && (
                  <LazyModalBoundary
                    title={t`Configure Notifications`}
                    onCancel={() => {
                      setConfigureNotificationModal(false)
                    }}
                  >
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
                  </LazyModalBoundary>
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
                  sportarrSettingsId={sportarrSettingsId}
                  onCancel={cancel}
                  onUpdate={updateRules}
                />
              </div>
            </div>
          </div>
          <div className="mt-5 hidden h-full w-full md:flex">
            <div className="m-auto flex xl:m-0">
              <SaveButton
                label={t`Save`}
                pendingLabel={t`Save`}
                className="mr-3 ml-auto"
                isPending={isCreatePending || isUpdatePending}
                disabled={isCreatePending || isUpdatePending}
                type="submit"
              />
              <Button
                buttonType="default"
                className="ml-auto"
                onClick={cancel}
                type="button"
                disabled={isCreatePending || isUpdatePending}
              >
                <Trans>Cancel</Trans>
              </Button>
            </div>
          </div>
          <div className="fixed right-0 bottom-0 left-0 z-40 bg-zinc-800 px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.4)] md:hidden">
            <div className="flex justify-center gap-3">
              <SaveButton
                label={t`Save`}
                pendingLabel={t`Save`}
                contentSize="compact"
                className="w-full max-w-40"
                isPending={isCreatePending || isUpdatePending}
                disabled={isCreatePending || isUpdatePending}
                type="submit"
              />

              <Button
                buttonType="default"
                className="w-full max-w-40 justify-center"
                type="button"
                onClick={cancel}
                disabled={isCreatePending || isUpdatePending}
              >
                <Trans>Cancel</Trans>
              </Button>
            </div>
          </div>

          <div className="fixed right-6 bottom-6 z-40 hidden md:block">
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
              className="flex h-9 w-9 items-center justify-center rounded-full bg-maintainerr-600 shadow-lg transition-colors hover:bg-maintainerr focus:outline-hidden"
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
      {pendingDisableSubmit && (
        <Modal
          title={t`Disabling this rule group`}
          size="md"
          backgroundClickable={false}
          onCancel={() => setPendingDisableSubmit(null)}
          cancelText={t`Cancel`}
          footerActions={
            <Button
              buttonType="primary"
              className="ml-3"
              onClick={() => {
                const data = pendingDisableSubmit
                setPendingDisableSubmit(null)
                void performSubmit(data)
              }}
            >
              <Trans>Got it</Trans>
            </Button>
          }
        >
          <p>
            <Trans>
              Disabling won&apos;t remove items already tracked by this rule
              group. The linked collection will keep them until this rule group
              is re-enabled or deleted.
            </Trans>
          </p>
          <p className="mt-2">
            <Trans>
              To clear them first, edit the rule&apos;s criteria so it matches
              nothing, run the rule, and then disable it.
            </Trans>
          </p>
        </Modal>
      )}
    </>
  )
}

export default AddModal
