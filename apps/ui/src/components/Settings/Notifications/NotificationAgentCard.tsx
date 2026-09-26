import { Trans, useLingui } from '@lingui/react/macro'
import { BasicResponseDto } from '@maintainerr/contracts'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import type {
  AgentConfiguration,
  NotificationAgentSpec,
  NotificationTypeSpec,
} from '../../../api/notifications'
import { PostApiHandler } from '../../../utils/ApiHandler'
import { camelCaseToPrettyText } from '../../../utils/SettingsUtils'
import Badge from '../../Common/Badge'
import Button from '../../Common/Button'
import LazyMonacoEditor from '../../Common/LazyMonacoEditor'
import SaveButton from '../../Common/SaveButton'
import TestingButton from '../../Common/TestingButton'
import { CheckboxGroup } from '../../Forms/CheckboxGroup'
import { InputGroup } from '../../Forms/Input'
import { SelectGroup } from '../../Forms/Select'
import ServiceCard, {
  ServiceCardCancelButton,
  ServiceCardDeleteButton,
  ServiceCardFooter,
} from '../ServiceCard'
import { useSettingsFeedback } from '../useSettingsFeedback'

interface AgentFormValues {
  name: string
  enabled: boolean
  agent: string
  types: number[]
  aboutScale: number
  options: Record<string, unknown>
}

// "Media About To Be Handled" is the one type that needs a lead time.
const ABOUT_TO_BE_HANDLED = 8

const sectionHeading = 'mb-3 text-sm font-semibold text-zinc-200'

const NotificationAgentCard = ({
  config,
  agents,
  types,
  created,
  onSaved,
  onDelete,
  onCancel,
}: {
  // Undefined for an agent that has not been saved yet.
  config?: AgentConfiguration
  agents: NotificationAgentSpec[]
  types: NotificationTypeSpec[]
  // Set on the card that replaces a just-saved new agent.
  created?: boolean
  onSaved: () => void
  // Resolves false when the agent could not be deleted.
  onDelete: (id: number) => Promise<boolean>
  onCancel?: () => void
}) => {
  const { t } = useLingui()
  const [expanded, setExpanded] = useState(!config || !!created)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<boolean>()
  const [invalidJson, setInvalidJson] = useState(false)
  const savedMessage = t`Saved`
  const feedback = useSettingsFeedback({
    updated: savedMessage,
    updateError: t`Failed to save notification agent`,
  })
  const [showCreated, setShowCreated] = useState(!!created)
  const idPrefix = `notification-${config?.id ?? 'new'}`

  const initialValues = useMemo<AgentFormValues>(
    () => ({
      name: config?.name ?? '',
      enabled: config?.enabled ?? false,
      agent: config?.agent ?? '',
      types: config?.types ?? [],
      aboutScale: config?.aboutScale ?? 3,
      options: (config?.options as Record<string, unknown>) ?? {},
    }),
    [config],
  )
  const { register, control, handleSubmit, getValues, setValue } =
    useForm<AgentFormValues>({
      defaultValues: initialValues,
      values: initialValues,
    })
  const name = useWatch({ control, name: 'name' })
  const agentName = useWatch({ control, name: 'agent' })
  const selectedTypes = useWatch({ control, name: 'types' })
  const agent = agents.find((spec) => spec.name === agentName)
  const canSave = !!agent && name.trim() !== '' && !saving && !invalidJson

  const clearFeedback = () => {
    feedback.clear()
    setShowCreated(false)
    setTestStatus(undefined)
  }

  // Null when the form cannot be sent yet.
  const toPayload = (values: AgentFormValues): AgentConfiguration | null => {
    // The server refuses an agent missing a required field without saying why.
    if (
      !agent ||
      values.name.trim() === '' ||
      agent.options.some(
        (option) =>
          option.required && (values.options[option.field] ?? '') === '',
      )
    ) {
      feedback.showWarning(t`Not all fields contain values`)
      return null
    }
    if (invalidJson) {
      feedback.showWarning(t`The JSON payload is not valid.`)
      return null
    }
    return {
      ...values,
      id: config?.id,
      agent: agent.name,
      // Types the server no longer offers, and fields left empty, are dropped.
      types: values.types.filter((id) => types.some((type) => type.id === id)),
      options: Object.fromEntries(
        Object.entries(values.options).filter(([, value]) => value !== ''),
      ),
    }
  }

  const save = async (values: AgentFormValues) => {
    clearFeedback()
    const payload = toPayload(values)
    if (!payload) return

    setSaving(true)
    try {
      const response = await PostApiHandler<BasicResponseDto>(
        '/notifications/configuration/add',
        payload,
      )
      if (response.status === 'OK') {
        feedback.showUpdated()
        onSaved()
      } else if (response.message) {
        feedback.showError(response.message)
      } else {
        feedback.showUpdateError()
      }
    } catch {
      feedback.showUpdateError()
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    if (testing) return
    clearFeedback()
    const payload = toPayload(getValues())
    if (!payload) return

    setTesting(true)
    try {
      const response = await PostApiHandler<string>(
        '/notifications/test',
        payload,
      )
      setTestStatus(response === 'Success')
      if (response === 'Success') {
        feedback.showSuccess(t`Success!`)
      } else {
        feedback.showError(response)
      }
    } catch {
      setTestStatus(false)
      feedback.showError(t`Failed to fire the notification.`)
    } finally {
      setTesting(false)
    }
  }

  const remove = async (id: number) => {
    clearFeedback()
    setDeleting(true)
    if (!(await onDelete(id))) {
      setExpanded(true)
      feedback.showError(t`Failed to delete notification agent.`)
    }
    setDeleting(false)
  }

  const savedAgent = agents.find((spec) => spec.name === config?.agent)

  return (
    <ServiceCard
      title={
        <span className="flex min-w-0 items-center gap-3">
          <span className="truncate">{config?.name ?? t`Add Agent`}</span>
          {config && !config.enabled ? (
            <Badge badgeType="light" className="shrink-0">
              <Trans>Disabled</Trans>
            </Badge>
          ) : null}
          {savedAgent ? (
            <span className="hidden shrink-0 text-sm font-normal text-zinc-400 sm:inline">
              {savedAgent.friendlyName}
            </span>
          ) : null}
        </span>
      }
      actions={
        config?.id != null ? (
          <>
            <Button
              buttonType="ghost"
              buttonSize="sm"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <span className="font-semibold">
                {expanded ? <Trans>Close</Trans> : <Trans>Edit</Trans>}
              </span>
            </Button>
            <ServiceCardDeleteButton
              disabled={saving || deleting}
              onConfirm={() => void remove(config.id!)}
            />
          </>
        ) : (
          <ServiceCardCancelButton onClick={onCancel} />
        )
      }
    >
      {expanded ? (
        <form className="flex flex-1 flex-col" onSubmit={handleSubmit(save)}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="flex flex-col gap-3">
              <h5 className={sectionHeading}>
                <Trans>General</Trans>
              </h5>
              <InputGroup
                layout="stacked"
                id={`${idPrefix}-name`}
                label={t`Name *`}
                type="text"
                {...register('name', { onChange: clearFeedback })}
              />
              <SelectGroup
                layout="stacked"
                id={`${idPrefix}-agent`}
                label={t`Agent *`}
                {...register('agent', {
                  onChange: () => {
                    // Each agent has its own fields; another agent's values mean nothing.
                    setValue('options', {})
                    setInvalidJson(false)
                    clearFeedback()
                  },
                })}
              >
                <option value="" disabled>
                  {t`Select an option`}
                </option>
                {agents.map((spec) => (
                  <option key={spec.name} value={spec.name}>
                    {spec.friendlyName}
                  </option>
                ))}
              </SelectGroup>
              <CheckboxGroup
                id={`${idPrefix}-enabled`}
                label={t`Enabled`}
                helpText={t`Nothing is sent while this is off.`}
                {...register('enabled', { onChange: clearFeedback })}
              />
            </section>

            <section className="flex flex-col gap-3">
              {agent ? (
                <>
                  <h5 className={sectionHeading}>{agent.friendlyName}</h5>
                  {/* Fields first, then the on/off options together. */}
                  {[
                    ...agent.options.filter((o) => o.type !== 'checkbox'),
                    ...agent.options.filter((o) => o.type === 'checkbox'),
                  ].map((option) => {
                    const id = `${idPrefix}-${agent.name}-${option.field}`
                    const label =
                      (option.label ?? camelCaseToPrettyText(option.field)) +
                      (option.required ? ' *' : '')
                    const helpText = option.extraInfo || undefined

                    if (option.type === 'checkbox') {
                      return (
                        <CheckboxGroup
                          key={id}
                          id={id}
                          label={label}
                          helpText={helpText}
                          {...register(`options.${option.field}`, {
                            onChange: clearFeedback,
                          })}
                        />
                      )
                    }

                    if (option.type === 'json') {
                      return (
                        <div key={id}>
                          <span className="block text-sm font-medium text-zinc-300">
                            {label}
                          </span>
                          <Controller
                            name={`options.${option.field}`}
                            control={control}
                            render={({ field }) => (
                              <LazyMonacoEditor
                                height="200px"
                                defaultLanguage="json"
                                theme="vs-dark"
                                defaultValue={
                                  field.value
                                    ? JSON.stringify(field.value, null, 2)
                                    : '{}'
                                }
                                options={{
                                  minimap: { enabled: false },
                                  formatOnPaste: true,
                                  formatOnType: true,
                                }}
                                onChange={(value) => {
                                  clearFeedback()
                                  try {
                                    field.onChange(
                                      value ? JSON.parse(value) : {},
                                    )
                                    setInvalidJson(false)
                                  } catch {
                                    setInvalidJson(true)
                                  }
                                }}
                              />
                            )}
                          />
                          {helpText ? (
                            <p className="mt-2 text-xs text-zinc-400">
                              {helpText}
                            </p>
                          ) : null}
                        </div>
                      )
                    }

                    return (
                      <InputGroup
                        key={id}
                        layout="stacked"
                        id={id}
                        label={label}
                        type={option.type}
                        helpText={helpText}
                        {...register(`options.${option.field}`, {
                          onChange: clearFeedback,
                        })}
                      />
                    )
                  })}
                </>
              ) : null}
            </section>

            <section className="flex flex-col gap-2">
              <h5 className={sectionHeading}>
                <Trans>Types *</Trans>
              </h5>
              <Controller
                name="types"
                control={control}
                render={({ field }) => (
                  <>
                    {types.map((type) => (
                      <CheckboxGroup
                        key={type.id}
                        id={`${idPrefix}-type-${type.id}`}
                        label={type.title}
                        checked={field.value.includes(type.id)}
                        onChange={(event) => {
                          field.onChange(
                            event.target.checked
                              ? [...field.value, type.id]
                              : field.value.filter((id) => id !== type.id),
                          )
                          clearFeedback()
                        }}
                      />
                    ))}
                  </>
                )}
              />
              {selectedTypes.includes(ABOUT_TO_BE_HANDLED) ? (
                <InputGroup
                  layout="stacked"
                  id={`${idPrefix}-about-scale`}
                  label={t`Notify x days before removal`}
                  type="number"
                  {...register('aboutScale', {
                    // An emptied field saves as 0, as it always has.
                    setValueAs: (value) => (value === '' ? 0 : Number(value)),
                    onChange: clearFeedback,
                  })}
                />
              ) : null}
            </section>
          </div>

          <ServiceCardFooter
            status={
              feedback.feedback ??
              (showCreated ? { type: 'success', title: savedMessage } : null)
            }
          >
            <TestingButton
              buttonType="success"
              type="button"
              onClick={() => void test()}
              disabled={testing}
              isPending={testing}
              feedbackStatus={testStatus}
            />
            <SaveButton type="submit" disabled={!canSave} isPending={saving} />
          </ServiceCardFooter>
        </form>
      ) : null}
    </ServiceCard>
  )
}

export default NotificationAgentCard
