import { Trans, useLingui } from '@lingui/react/macro'
import {
  ARR_TAG_LABEL_HINT,
  BasicResponseDto,
  isValidArrTagLabel,
  stripTrailingSlashes,
} from '@maintainerr/contracts'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import {
  getApiErrorMessage,
  normalizeConnectionErrorMessage,
} from '../../../utils/ApiError'
import { PostApiHandler, PutApiHandler } from '../../../utils/ApiHandler'
import {
  addPortToUrl,
  getBaseUrl,
  getHostname,
  getPortFromUrl,
} from '../../../utils/SettingsUtils'
import Button from '../../Common/Button'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { CheckboxGroup } from '../../Forms/CheckboxGroup'
import { InputGroup } from '../../Forms/Input'
import ServiceCard, {
  ServiceCardCancelButton,
  ServiceCardDeleteButton,
  ServiceCardFooter,
} from '../ServiceCard'
import { useSettingsFeedback } from '../useSettingsFeedback'
import type { IServarrSetting } from '../../../api/settings'
import { releaseVersion } from '../../../utils/version'

interface ServarrFormState {
  serverName: string
  hostname: string
  port: string
  baseUrl: string
  apiKey: string
  tagExclusions: boolean
  exclusionTag: string
  untagOnUnexclude: boolean
}

interface ServarrConnectionState {
  hostname: string
  port: string
  baseUrl: string
  apiKey: string
}

type ServarrSaveResponse =
  | {
      status: 'OK'
      code: 1
      message: string
      data: IServarrSetting
    }
  | {
      status: 'NOK'
      code: 0
      message: string
      data?: never
    }

interface ServarrTestResponse {
  status: 'OK' | 'NOK'
  code: 0 | 1
  message: string
}

interface ServarrServerCardProps {
  title: string
  settingsPath: string
  testPath: string
  serviceName: string
  // Set by a service whose metadata Maintainerr caches, so the cache can be
  // dropped from the same place the connection is configured.
  metadataRefreshPath?: string
  // Radarr and Sonarr can tag the items Maintainerr excludes.
  canTagExclusions?: boolean
  // Undefined for a server that has not been saved yet.
  settings?: IServarrSetting
  // Set on the card that replaces a just-saved new server, which carries the
  // save confirmation over from the draft.
  created?: boolean
  onSaved: (setting: IServarrSetting) => void
  // Resolves false when the removal failed for a reason nobody has shown yet.
  onDelete: (id: number) => Promise<boolean>
  // Only a server that has not been saved yet can be cancelled.
  onCancel?: () => void
}

const isEmptyServarrState = (
  state: Pick<
    ServarrFormState,
    'serverName' | 'hostname' | 'port' | 'baseUrl' | 'apiKey'
  >,
) =>
  state.serverName === '' &&
  state.hostname === '' &&
  state.port === '' &&
  state.baseUrl === '' &&
  state.apiKey === ''

const resolveServarrPort = ({ hostname, port }: ServarrFormState) => {
  if (port !== '' || hostname === '') {
    return port
  }

  return hostname.includes('https://') ? '443' : '80'
}

const buildInitialState = (settings?: IServarrSetting): ServarrFormState => ({
  serverName: settings?.serverName ?? '',
  hostname: settings?.url ? (getHostname(settings.url) ?? '') : '',
  port: settings?.url ? (getPortFromUrl(settings.url) ?? '') : '',
  baseUrl: settings?.url ? (getBaseUrl(settings.url) ?? '') : '',
  apiKey: settings?.apiKey ?? '',
  tagExclusions: settings?.tagExclusions ?? false,
  exclusionTag: settings?.exclusionTag ?? 'dnd',
  untagOnUnexclude: settings?.untagOnUnexclude ?? false,
})

const areMatchingConnectionStates = (
  left: ServarrConnectionState,
  right?: ServarrConnectionState,
) => {
  if (!right) {
    return false
  }

  return (
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.baseUrl === right.baseUrl &&
    left.apiKey === right.apiKey
  )
}

const toConnectionState = (
  state: ServarrFormState,
): ServarrConnectionState => ({
  hostname: state.hostname,
  port: state.port,
  baseUrl: state.baseUrl,
  apiKey: state.apiKey,
})

const buildServarrPayload = (
  state: ServarrFormState,
  settings?: IServarrSetting,
  canTagExclusions?: boolean,
) => {
  const port = resolveServarrPort(state)
  const hostnameValue = state.hostname.includes('://')
    ? state.hostname
    : port === '443'
      ? `https://${state.hostname}`
      : `http://${state.hostname}`

  const url = stripTrailingSlashes(addPortToUrl(hostnameValue, Number(port)))

  return {
    payload: {
      // The base URL slot can contribute its own trailing slash (#3416), so
      // the composed URL is stripped as well - the host strip above still
      // keeps a slash-ended hostname from doubling at the join.
      url: stripTrailingSlashes(
        `${url}${state.baseUrl ? `/${state.baseUrl}` : ''}`,
      ),
      apiKey: state.apiKey,
      serverName: state.serverName,
      ...(canTagExclusions
        ? {
            tagExclusions: state.tagExclusions,
            exclusionTag: state.exclusionTag.trim() || 'dnd',
            untagOnUnexclude: state.untagOnUnexclude,
          }
        : {}),
      ...(settings?.id ? { id: settings.id } : {}),
    },
    port,
  }
}

const ServarrServerCard = ({
  title,
  settingsPath,
  testPath,
  serviceName,
  metadataRefreshPath,
  canTagExclusions,
  settings,
  created,
  onSaved,
  onDelete,
  onCancel,
}: ServarrServerCardProps) => {
  const { t } = useLingui()
  // Named as in the exclusion-tag messages, which keep their translations.
  const name = serviceName
  const chars = ARR_TAG_LABEL_HINT
  const updatedMessage = t`Saved`
  const feedback = useSettingsFeedback({
    updated: updatedMessage,
    updateError: t`Failed to update ${{ serviceName }} settings.`,
  })
  const [showCreated, setShowCreated] = useState(!!created)
  const initialState = useMemo(() => buildInitialState(settings), [settings])
  const savedConnectionState = settings
    ? toConnectionState(initialState)
    : undefined
  const settingsKey =
    settings?.id != null
      ? `${settings.id}:${settings.url}:${settings.apiKey}`
      : '__new__'
  const idPrefix = `${serviceName.toLowerCase()}-${settings?.id ?? 'new'}`
  const [testedConnectionState, setTestedConnectionState] =
    useState<ServarrConnectionState>()
  const [testedConnectionStateKey, setTestedConnectionStateKey] =
    useState<string>()
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<boolean>()

  const {
    register,
    handleSubmit,
    control,
    getValues,
    formState: { errors },
  } = useForm<ServarrFormState>({
    defaultValues: initialState,
    // `values` keeps the form synced to the loaded setting via deep compare;
    // no effect needed and no render loop on an unstable reference.
    values: initialState,
  })

  const serverName = useWatch({ control, name: 'serverName' }) ?? ''
  const hostname = useWatch({ control, name: 'hostname' }) ?? ''
  const port = useWatch({ control, name: 'port' }) ?? ''
  const baseUrl = useWatch({ control, name: 'baseUrl' }) ?? ''
  const apiKey = useWatch({ control, name: 'apiKey' }) ?? ''
  const tagExclusions = useWatch({ control, name: 'tagExclusions' })

  const currentConnectionState = useMemo(
    () => ({ hostname, port, baseUrl, apiKey }),
    [apiKey, baseUrl, hostname, port],
  )
  const activeTestedConnectionState =
    testedConnectionStateKey === settingsKey
      ? testedConnectionState
      : savedConnectionState

  const isClearingExistingSetting =
    settings?.id != null &&
    isEmptyServarrState({ ...currentConnectionState, serverName })
  const hasCompleteRequiredFields =
    hostname !== '' && apiKey !== '' && serverName !== ''
  const canSave =
    !saving && (isClearingExistingSetting || hasCompleteRequiredFields)
  const testFeedbackStatus = areMatchingConnectionStates(
    currentConnectionState,
    activeTestedConnectionState,
  )
    ? testStatus
    : undefined

  // Nothing to refresh until the server it belongs to exists.
  const canRefresh = Boolean(metadataRefreshPath) && settings?.id != null

  const clearFeedback = () => {
    feedback.clear()
    setShowCreated(false)
    setTestStatus(undefined)
  }

  const refreshMetadata = async () => {
    // metadataRefreshPath is tested again rather than left to canRefresh: it
    // is what narrows the path for the post below.
    if (!metadataRefreshPath || !canRefresh || refreshing) return

    clearFeedback()
    setRefreshing(true)

    try {
      const response = await PostApiHandler<BasicResponseDto>(
        metadataRefreshPath,
        {},
      )

      // The server answers with the provider name upper-cased, which suits
      // TMDB and TVDB and shouts for a product name, so the known outcome
      // reads from the catalogue and anything else keeps its own reason.
      if (response?.code === 1) {
        feedback.showSuccess(t`Refreshing`)
      } else {
        feedback.showError(
          response?.message ?? t`Failed to refresh ${{ serviceName }} metadata`,
        )
      }
    } catch {
      feedback.showError(t`Failed to refresh ${{ serviceName }} metadata`)
    } finally {
      setRefreshing(false)
    }
  }

  const deleteServer = async (id: number) => {
    clearFeedback()
    setSaving(true)

    try {
      if (!(await onDelete(id))) {
        feedback.showError(t`Failed to remove ${{ serviceName }} settings.`)
      }
    } catch {
      feedback.showError(t`Failed to remove ${{ serviceName }} settings.`)
    } finally {
      setSaving(false)
    }
  }

  const saveSettings = async (values: ServarrFormState) => {
    clearFeedback()

    if (settings?.id != null && isEmptyServarrState(values)) {
      await deleteServer(settings.id)
      return
    }

    // No completeness check here on purpose: canSave already requires hostname,
    // apiKey and serverName, and resolveServarrPort only yields an empty port
    // when hostname is empty - which canSave rejects. The all-empty case is
    // taken by the removal branch above before reaching this point.
    const { payload } = buildServarrPayload(values, settings, canTagExclusions)

    const endpoint = settings?.id
      ? `${settingsPath}/${settings.id}`
      : settingsPath
    const handler = settings?.id ? PutApiHandler : PostApiHandler

    setSaving(true)

    try {
      const response = await handler<ServarrSaveResponse>(endpoint, payload)

      if (response.code === 1) {
        feedback.showUpdated()
        onSaved(response.data)
      } else {
        feedback.showUpdateError()
      }
    } catch {
      feedback.showUpdateError()
    } finally {
      setSaving(false)
    }
  }

  const performTest = async () => {
    if (testing) {
      return
    }

    clearFeedback()
    const values = getValues()
    const { payload, port } = buildServarrPayload(values, settings)
    const { id: ignoredId, ...testPayload } = payload

    setTesting(true)

    await PostApiHandler<ServarrTestResponse>(testPath, testPayload)
      .then((response: ServarrTestResponse) => {
        const message = normalizeConnectionErrorMessage(
          response.message,
          t`Failed to connect to ${{ serviceName }}. Verify URL and API key.`,
        )
        setTestStatus(response.code === 1)

        if (response.code === 1) {
          feedback.showSuccess(
            t`Success! (${{ version: releaseVersion(message) }})`,
          )
          setTestedConnectionState(toConnectionState({ ...values, port }))
          setTestedConnectionStateKey(settingsKey)
        } else {
          feedback.showError(message)
        }
      })
      .catch((error: unknown) => {
        setTestStatus(false)
        feedback.showError(
          getApiErrorMessage(
            error,
            t`Failed to connect to ${{ serviceName }}. Verify URL and API key.`,
          ),
        )
      })
      .finally(() => {
        setTesting(false)
      })
  }

  const field = (
    fieldName: 'serverName' | 'hostname' | 'port' | 'baseUrl' | 'apiKey',
    label: string,
    type: 'text' | 'number' | 'password' = 'text',
    helpText?: string,
  ) => (
    <InputGroup
      layout="stacked"
      id={`${idPrefix}-${fieldName}`}
      label={label}
      type={type}
      helpText={helpText}
      {...register(fieldName, { onChange: clearFeedback })}
    />
  )

  return (
    <ServiceCard
      title={title}
      actions={
        <>
          {canRefresh ? (
            <Button
              buttonType="ghost"
              buttonSize="sm"
              type="button"
              onClick={() => void refreshMetadata()}
              disabled={refreshing}
            >
              <span className="font-semibold">
                <Trans>Refresh metadata</Trans>
              </span>
            </Button>
          ) : null}
          {settings?.id != null ? (
            <ServiceCardDeleteButton
              disabled={saving}
              onConfirm={() => void deleteServer(settings.id)}
            />
          ) : (
            <ServiceCardCancelButton onClick={onCancel} />
          )}
        </>
      }
    >
      <form
        className="flex flex-1 flex-col gap-3"
        onSubmit={handleSubmit(saveSettings)}
      >
        {field('serverName', t`Server Name`)}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            {field('hostname', t`Hostname or IP`)}
          </div>
          {field('port', t`Port`, 'number')}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('baseUrl', t`Base URL`, 'text', t`No Leading Slash`)}
          {field('apiKey', t`API key`, 'password')}
        </div>
        {canTagExclusions ? (
          <>
            <InputGroup
              layout="stacked"
              id={`${idPrefix}-exclusionTag`}
              label={t`Tag label`}
              type="text"
              placeholder="dnd"
              disabled={!tagExclusions}
              error={errors.exclusionTag?.message}
              helpText={
                <>
                  <Trans>The {name} tag to apply, created if missing.</Trans>{' '}
                  <Trans>
                    Lowercase letters, numbers and hyphens only ({chars}).
                  </Trans>
                </>
              }
              {...register('exclusionTag', {
                onChange: clearFeedback,
                validate: (value, values) => {
                  const label = value.trim()
                  if (!values.tagExclusions || isValidArrTagLabel(label)) {
                    return true
                  }
                  return label === ''
                    ? t`A tag label is required when exclusion tagging is enabled. Lowercase letters, numbers and hyphens only (${{ chars }}).`
                    : t`"${{ label }}" is not a valid ${{ name }} tag. Lowercase letters, numbers and hyphens only (${{ chars }}), with no leading, trailing, or repeated hyphens.`
                },
              })}
            />
            <CheckboxGroup
              id={`${idPrefix}-tagExclusions`}
              label={t`Tag excluded content`}
              helpText={t`Tags the item in ${{ name }} when it is excluded.`}
              {...register('tagExclusions', { onChange: clearFeedback })}
            />
            <CheckboxGroup
              id={`${idPrefix}-untagOnUnexclude`}
              label={t`Remove tag on un-exclude`}
              helpText={t`Removes only this tag when the item is un-excluded.`}
              disabled={!tagExclusions}
              {...register('untagOnUnexclude', { onChange: clearFeedback })}
            />
          </>
        ) : null}

        <ServiceCardFooter
          status={
            feedback.feedback ??
            (showCreated ? { type: 'success', title: updatedMessage } : null)
          }
        >
          <TestingButton
            buttonType="success"
            type="button"
            onClick={() => void performTest()}
            disabled={testing || isClearingExistingSetting}
            label={t`Test Connection`}
            isPending={testing}
            feedbackStatus={testFeedbackStatus}
          />
          <SaveButton type="submit" disabled={!canSave} isPending={saving} />
        </ServiceCardFooter>
      </form>
    </ServiceCard>
  )
}

export default ServarrServerCard
