import { BasicResponseDto } from '@maintainerr/contracts'
import { useEffect, useState } from 'react'
import GetApiHandler, { PostApiHandler } from '../../../../utils/ApiHandler'
import { camelCaseToPrettyText } from '../../../../utils/SettingsUtils'
import Alert from '../../../Common/Alert'
import LazyMonacoEditor from '../../../Common/LazyMonacoEditor'
import LoadingSpinner from '../../../Common/LoadingSpinner'
import Modal from '../../../Common/Modal'
import { SaveButtonContent } from '../../../Common/SaveButton'
import {
  getTestingButtonType,
  TestingButtonContent,
} from '../../../Common/TestingButton'
import ToggleItem from '../../../Common/ToggleButton'
import SettingsAlertSlot from '../../SettingsAlertSlot'

interface agentSpec {
  name: string
  friendlyName: string
  options: Array<{
    field: string
    type: string
    required: boolean
    extraInfo: string
  }>
}

interface typeSpec {
  title: string
  id: number
}

export interface AgentConfiguration {
  id?: number
  name: string
  agent: string
  enabled: boolean
  types: number[]
  aboutScale: number
  options: object
}

interface CreateNotificationModal {
  selected?: AgentConfiguration
  onSave: () => void
  onTest: () => void
  onCancel: () => void
}

interface TestStatus {
  status: boolean
  message: string
}

const stringifyValue = (value: unknown) => JSON.stringify(value ?? null)

const CreateNotificationModal = (props: CreateNotificationModal) => {
  const [availableAgents, setAvailableAgents] = useState<agentSpec[]>()
  const [availableTypes, setAvailableTypes] = useState<typeSpec[]>()
  const [name, setName] = useState(props.selected?.name ?? '')
  const [aboutScale, setAboutScale] = useState(props.selected?.aboutScale ?? 3)
  const [enabled, setEnabled] = useState(props.selected?.enabled ?? false)
  const [formValues, setFormValues] = useState<any>(
    props.selected?.options ?? {},
  )

  const [targetAgent, setTargetAgent] = useState<agentSpec>()
  const [targetTypes, setTargetTypes] = useState<typeSpec[]>([])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()

  const initialAgentName = props.selected?.agent ?? '-'
  const initialName = props.selected?.name ?? ''
  const initialEnabled = props.selected?.enabled ?? false
  const initialAboutScale = props.selected?.aboutScale ?? 3
  const initialTypeIds = [...(props.selected?.types ?? [])].sort(
    (a, b) => a - b,
  )
  const initialOptions = props.selected?.options ?? {}

  const selectedAgentIndex = targetAgent
    ? (availableAgents?.findIndex((agent) => agent.name === targetAgent.name) ??
      0)
    : 0

  const hasValidTargetAgent = Boolean(targetAgent && targetAgent.name !== '-')
  const selectedTypeIds = [...targetTypes.map((type) => type.id)].sort(
    (left, right) => left - right,
  )
  const hasChanges =
    name !== initialName ||
    enabled !== initialEnabled ||
    aboutScale !== initialAboutScale ||
    (targetAgent?.name ?? '-') !== initialAgentName ||
    stringifyValue(selectedTypeIds) !== stringifyValue(initialTypeIds) ||
    stringifyValue(formValues) !== stringifyValue(initialOptions)
  const isLoading = !availableAgents || !availableTypes
  const canSave =
    !isLoading &&
    hasValidTargetAgent &&
    name.trim() !== '' &&
    hasChanges &&
    !saving

  const clearFeedback = () => {
    setError(undefined)
    setTestResult(undefined)
  }

  const handleSubmit = async () => {
    const types = targetTypes ? targetTypes.map((t) => t.id) : []

    if (hasValidTargetAgent && name.trim() !== '') {
      const payload: AgentConfiguration = {
        id: props.selected?.id,
        name,
        agent: targetAgent!.name,
        enabled,
        types: types,
        aboutScale,
        options: formValues,
      }
      clearFeedback()
      await postNotificationConfig(payload)
    } else {
      setError('Not all fields contain values')
    }
  }

  const doTest = async () => {
    if (testing) return

    if (hasValidTargetAgent && name.trim() !== '') {
      const types = targetTypes ? targetTypes.map((t) => t.id) : []
      clearFeedback()
      setTesting(true)

      await PostApiHandler<string>(`/notifications/test`, {
        id: props.selected?.id,
        name,
        agent: targetAgent!.name,
        enabled,
        types: types,
        aboutScale,
        options: formValues,
      })
        .then((resp) => {
          setTestResult({
            status: resp === 'Success',
            message:
              resp === 'Success'
                ? 'Successfully fired the notification!'
                : resp,
          })
        })
        .catch(() => {
          setTestResult({
            status: false,
            message: 'Failed to fire the notification.',
          })
        })
        .finally(() => {
          setTesting(false)
        })
    } else {
      setError('Not all fields contain values')
    }
  }

  useEffect(() => {
    GetApiHandler('/notifications/agents').then((agents) => {
      const agentsWithPlaceholder = [
        { name: '-', friendlyName: '', options: [] },
        ...agents,
      ]

      setAvailableAgents(agentsWithPlaceholder)

      // load selected agents if editing
      if (props.selected && props.selected.agent) {
        setTargetAgent(
          agentsWithPlaceholder.find(
            (agent: agentSpec) => props.selected!.agent === agent.name,
          ),
        )
      }
    })

    GetApiHandler('/notifications/types').then((types: typeSpec[]) => {
      setAvailableTypes(types)

      // load selected types if editing
      if (props.selected && props.selected.types) {
        setTargetTypes(
          types.filter((type) => props.selected!.types.includes(type.id)),
        )
      }
    })
  }, [props.selected])

  const postNotificationConfig = async (payload: AgentConfiguration) => {
    setSaving(true)

    try {
      const status = await PostApiHandler<BasicResponseDto>(
        '/notifications/configuration/add',
        payload,
      )

      if (status.status === 'OK') {
        props.onSave()
        return
      }

      setError(status.message)
    } catch {
      setError('Failed to save notification agent')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (fieldName: string, value: any) => {
    setFormValues((prevValues: any) => ({
      ...prevValues,
      [fieldName]: value,
    }))
    clearFeedback()
  }

  const modalTitle = props.selected?.id
    ? 'Edit Notification Agent'
    : 'New Notification Agent'

  return (
    <Modal
      loading={false}
      backgroundClickable={false}
      onCancel={() => props.onCancel()}
      okDisabled={!canSave}
      okContent={<SaveButtonContent isPending={saving} label="Save" />}
      okButtonType={'primary'}
      title={modalTitle}
      iconSvg={''}
      onOk={handleSubmit}
      secondaryButtonType={getTestingButtonType(
        'success',
        testResult?.status,
        testing,
      )}
      secondaryDisabled={isLoading || testing}
      secondaryContent={
        <TestingButtonContent
          isPending={testing}
          feedbackStatus={testResult?.status}
        />
      }
      onSecondary={doTest}
    >
      <div className="min-h-[16rem]">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <form className="space-y-4">
            <SettingsAlertSlot>
              {error || testResult ? (
                <div className="space-y-4">
                  {error ? (
                    <Alert
                      type={
                        error === 'Not all fields contain values'
                          ? 'warning'
                          : 'error'
                      }
                      title={error}
                    />
                  ) : null}
                  {testResult ? (
                    <Alert
                      type={testResult.status ? 'success' : 'error'}
                      title={testResult.message}
                    />
                  ) : null}
                </div>
              ) : null}
            </SettingsAlertSlot>

            {/* Config Name */}
            <div className="form-row">
              <label htmlFor="name" className="text-label">
                Name *
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={name}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      setName(event.target.value)
                      clearFeedback()
                    }}
                  ></input>
                </div>
              </div>
            </div>
            {/* Enabled */}
            <div className="form-row">
              <label htmlFor="enabled" className="text-label">
                Enabled
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    type="checkbox"
                    name="enabled"
                    id="enabled"
                    checked={enabled}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      setEnabled(event.target.checked)
                      clearFeedback()
                    }}
                  ></input>
                </div>
              </div>
            </div>
            {/* Select agent */}
            <div className="form-row">
              <label htmlFor="agent" className="text-label">
                Agent *
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <select
                    id="agent"
                    name="agent"
                    value={selectedAgentIndex}
                    onChange={(e) => {
                      setFormValues({})
                      setTargetAgent(availableAgents[Number(e.target.value)])
                      clearFeedback()
                    }}
                    className="rounded-l-only"
                  >
                    {availableAgents?.map((agent, index) => (
                      <option key={`agent-${index}`} value={index}>
                        {`${agent.friendlyName ? agent.friendlyName : ''}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              {/* Load fields */}
              {targetAgent?.options.map((option) => {
                return (
                  <div className="form-row" key={`form-row-${option.field}`}>
                    <label
                      htmlFor={`${targetAgent.name}-${option.field}`}
                      className="text-label"
                    >
                      {camelCaseToPrettyText(
                        option.field + (option.required ? ' *' : ''),
                      )}
                      {option.extraInfo ? (
                        <span className="label-tip">{option.extraInfo}</span>
                      ) : null}
                    </label>
                    <div className="form-input">
                      <div className="form-input-field">
                        {option.type === 'json' ? (
                          <LazyMonacoEditor
                            height="200px"
                            defaultLanguage="json"
                            theme="vs-dark"
                            defaultValue={
                              formValues?.[option.field]
                                ? JSON.stringify(
                                    formValues?.[option.field],
                                    null,
                                    2,
                                  )
                                : '{}'
                            }
                            options={{
                              minimap: { enabled: false },
                              formatOnPaste: true,
                              formatOnType: true,
                            }}
                            onChange={(value) =>
                              handleInputChange(
                                option.field,
                                value ? JSON.parse(value) : {},
                              )
                            }
                          />
                        ) : (
                          <input
                            name={option.field}
                            id={`${targetAgent.name}-${option.field}`}
                            type={option.type}
                            required={option.required}
                            key={`${targetAgent.name}-option-${option.field}`}
                            defaultValue={
                              formValues?.[option.field]
                                ? formValues?.[option.field]
                                : undefined
                            }
                            defaultChecked={
                              option.type == 'checkbox'
                                ? formValues?.[option.field]
                                : false
                            }
                            onChange={(e) => {
                              if (option.type == 'checkbox') {
                                handleInputChange(
                                  option.field,
                                  e.target.checked,
                                )
                              } else {
                                handleInputChange(option.field, e.target.value)
                              }
                            }}
                          ></input>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Select types */}
              <div className="form-row">
                <label className="text-label">Types *</label>
                <div className="form-input">
                  {availableTypes.map((n) => (
                    <div key={n.id}>
                      <ToggleItem
                        label={n.title}
                        toggled={targetTypes.some((type) => type.id === n.id)}
                        onStateChange={(state) => {
                          if (state) {
                            setTargetTypes((current) => {
                              if (current.some((type) => type.id === n.id)) {
                                return current
                              }

                              return [...current, n]
                            })
                          } else {
                            setTargetTypes((current) =>
                              current.filter((el) => el.id !== n.id),
                            )
                          }

                          clearFeedback()
                        }}
                      />
                      {/* Show only when 'Media About To Be Handled' is selected */}
                      {targetTypes.find((el) => el.id === 8) && n.id === 8 && (
                        <div className="form-row mb-0 ml-9 mt-0">
                          <label htmlFor="about-scale" className="text-label">
                            Notify x days before removal
                          </label>
                          <div className="form-input">
                            <div className="form-input-field">
                              <input
                                type="number"
                                name="about-scale"
                                value={aboutScale}
                                onChange={(
                                  event: React.ChangeEvent<HTMLInputElement>,
                                ) => {
                                  setAboutScale(+event.target.value)
                                  clearFeedback()
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
export default CreateNotificationModal
