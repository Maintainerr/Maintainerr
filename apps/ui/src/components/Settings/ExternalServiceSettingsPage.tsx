import { BasicResponseDto } from '@maintainerr/contracts'
import {
  type ChangeEvent,
  type FocusEvent,
  type JSX,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import type { z } from 'zod'
import {
  getApiErrorMessage,
  normalizeConnectionErrorMessage,
} from '../../utils/ApiError'
import GetApiHandler, {
  DeleteApiHandler,
  PostApiHandler,
} from '../../utils/ApiHandler'
import Alert from '../Common/Alert'
import DocsButton from '../Common/DocsButton'
import SaveButton from '../Common/SaveButton'
import TestingButton from '../Common/TestingButton'
import { InputGroup } from '../Forms/Input'
import { SelectGroup } from '../Forms/Select'
import SettingsAlertSlot from './SettingsAlertSlot'
import { useSettingsFeedback } from './useSettingsFeedback'

export interface ExternalServiceSelectOption {
  value: string
  label: string
}

export type SettingsValues = Record<string, string>

export interface ExternalServiceFieldConfig {
  name: string
  label: string
  type?: 'text' | 'password' | 'select'
  placeholder?: string
  helpText?: JSX.Element | string
  normalize?: (value: string) => string
  required?: boolean
  options?: ExternalServiceSelectOption[]
  loadOptions?: (
    values: SettingsValues,
  ) => Promise<ExternalServiceSelectOption[]>
}

interface TestStatus {
  status: boolean
  message: string
}

interface ExternalServiceSettingsPageProps {
  scope: string
  pageTitle: string
  heading: string
  description: ReactNode
  warning?: ReactNode
  docsPage: string
  settingsPath: string
  testPath: string
  schema: z.ZodTypeAny
  fields: ExternalServiceFieldConfig[]
  testSuccessTitle: string
  testFailureMessage: string
}

const allEmpty = (
  values: SettingsValues,
  fields: ExternalServiceFieldConfig[],
) => fields.every((field) => (values[field.name] ?? '') === '')

const valuesEqual = (a: SettingsValues, b: SettingsValues): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((key) => a[key] === b[key])

const ExternalServiceSettingsPage = ({
  scope,
  pageTitle,
  heading,
  description,
  warning,
  docsPage,
  settingsPath,
  testPath,
  schema,
  fields,
  testSuccessTitle,
  testFailureMessage,
}: ExternalServiceSettingsPageProps) => {
  const [testedSettings, setTestedSettings] = useState<SettingsValues>()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()
  const [loadedOptionsByFieldName, setLoadedOptionsByFieldName] = useState<
    Record<string, ExternalServiceSelectOption[]>
  >({})
  const [loadingOptionsByFieldName, setLoadingOptionsByFieldName] = useState<
    Record<string, boolean>
  >({})
  const loadingOptionFieldNamesRef = useRef(new Set<string>())
  const selectOptionsVersionRef = useRef(0)
  const { feedback, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback(scope)

  const {
    control,
    clearErrors,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting, isLoading },
  } = useForm<SettingsValues>({
    defaultValues: async () => {
      const response =
        await GetApiHandler<Record<string, string | undefined>>(settingsPath)
      return Object.fromEntries(
        fields.map((field) => [field.name, response?.[field.name] ?? '']),
      )
    },
  })

  const currentValues = (useWatch({ control }) ?? {}) as SettingsValues
  const isGoingToRemove = allEmpty(currentValues, fields)
  const testFeedbackStatus =
    testedSettings && valuesEqual(currentValues, testedSettings)
      ? testResult?.status
      : undefined
  const canSave = !isSubmitting && !isLoading

  const clearTransientState = (clearLoadedOptions = true) => {
    clearError()
    clearErrors()
    setTestResult(undefined)
    if (clearLoadedOptions) {
      selectOptionsVersionRef.current += 1
      setLoadedOptionsByFieldName({})
    }
  }

  const loadFieldOptions = async (
    fieldConfig: ExternalServiceFieldConfig,
    values: SettingsValues,
  ) => {
    if (
      !fieldConfig.loadOptions ||
      loadedOptionsByFieldName[fieldConfig.name]
    ) {
      return
    }
    if (loadingOptionFieldNamesRef.current.has(fieldConfig.name)) {
      return
    }

    const optionsVersion = selectOptionsVersionRef.current
    loadingOptionFieldNamesRef.current.add(fieldConfig.name)
    setLoadingOptionsByFieldName((current) => ({
      ...current,
      [fieldConfig.name]: true,
    }))

    try {
      const options = await fieldConfig.loadOptions(values)
      if (optionsVersion === selectOptionsVersionRef.current) {
        setLoadedOptionsByFieldName((current) => ({
          ...current,
          [fieldConfig.name]: options,
        }))
      }
    } catch (error) {
      if (optionsVersion === selectOptionsVersionRef.current) {
        setError(fieldConfig.name, {
          type: 'manual',
          message: getApiErrorMessage(
            error,
            `Failed to load ${fieldConfig.label.toLowerCase()} options.`,
          ),
        })
      }
    } finally {
      loadingOptionFieldNamesRef.current.delete(fieldConfig.name)
      setLoadingOptionsByFieldName((current) => ({
        ...current,
        [fieldConfig.name]: false,
      }))
    }
  }

  const loadSelectOptions = (values: SettingsValues) => {
    fields.forEach((fieldConfig) => {
      if (fieldConfig.type === 'select') {
        void loadFieldOptions(fieldConfig, values)
      }
    })
  }

  const loadInitialSelectOptions = useEffectEvent(() => {
    loadSelectOptions(getValues())
  })

  useEffect(() => {
    if (!isLoading) {
      loadInitialSelectOptions()
    }
  }, [isLoading])

  const validateValues = (values: SettingsValues) => {
    if (allEmpty(values, fields)) {
      clearErrors()
      return true
    }

    const result = schema.safeParse(values)

    if (result.success) {
      clearErrors()
      return true
    }

    clearErrors()
    const fieldNames = new Set(fields.map((field) => field.name))

    result.error.issues.forEach((issue) => {
      const fieldName = String(issue.path[0])
      if (fieldNames.has(fieldName)) {
        setError(fieldName, {
          type: 'manual',
          message: issue.message,
        })
      }
    })

    return false
  }

  const onSubmit = async () => {
    const data = getValues()

    clearError()

    const removingSetting = allEmpty(data, fields)

    if (!removingSetting && !validateValues(data)) {
      return
    }

    try {
      const response = await (removingSetting
        ? DeleteApiHandler<BasicResponseDto>(settingsPath)
        : PostApiHandler<BasicResponseDto>(settingsPath, data))

      if (response.code) {
        reset(data)
        showUpdated()
      } else {
        showUpdateError()
      }
    } catch {
      showUpdateError()
    }
  }

  const performTest = async () => {
    const values = getValues()

    if (testing || !validateValues(values)) {
      return
    }

    setTesting(true)

    await PostApiHandler<BasicResponseDto>(testPath, values)
      .then((response: BasicResponseDto) => {
        setTestResult({
          status: response.code === 1,
          message: normalizeConnectionErrorMessage(
            response.message,
            testFailureMessage,
          ),
        })

        if (response.code === 1) {
          setTestedSettings(values)
        }
      })
      .catch((error: unknown) => {
        setTestResult({
          status: false,
          message: getApiErrorMessage(error, testFailureMessage),
        })
      })
      .finally(() => {
        setTesting(false)
      })
  }

  return (
    <>
      <title>{pageTitle}</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">{heading}</h3>
          <p className="description">{description}</p>
        </div>

        <SettingsAlertSlot>
          {warning || feedback || testResult ? (
            <div className="space-y-4">
              {!isLoading && isGoingToRemove && warning ? (
                <Alert type="warning" title={warning} />
              ) : null}
              {feedback ? (
                <Alert type={feedback.type} title={feedback.title} />
              ) : null}
              {testResult ? (
                <Alert
                  type={testResult.status ? 'success' : 'error'}
                  title={
                    testResult.status
                      ? `Successfully connected to ${testSuccessTitle} (${testResult.message})`
                      : testResult.message
                  }
                />
              ) : null}
            </div>
          ) : null}
        </SettingsAlertSlot>

        <div className="section">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void onSubmit()
            }}
          >
            {fields.map((fieldConfig) => (
              <Controller
                key={fieldConfig.name}
                name={fieldConfig.name}
                defaultValue=""
                control={control}
                render={({ field }) => {
                  const error = errors[fieldConfig.name]?.message as
                    string | undefined

                  if (fieldConfig.type === 'select') {
                    const options =
                      loadedOptionsByFieldName[fieldConfig.name] ??
                      fieldConfig.options ??
                      []
                    const selectedOption = options.some(
                      (option) => option.value === field.value,
                    )
                    const selectOptions =
                      field.value && !selectedOption
                        ? [
                            { value: field.value, label: field.value },
                            ...options,
                          ]
                        : options

                    return (
                      <SelectGroup
                        label={fieldConfig.label}
                        value={field.value}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                          clearTransientState(false)
                          field.onChange(event)
                        }}
                        onFocus={() => {
                          void loadFieldOptions(fieldConfig, getValues())
                        }}
                        onBlur={(event: FocusEvent<HTMLSelectElement>) => {
                          if (fieldConfig.normalize) {
                            field.onChange(
                              fieldConfig.normalize(event.target.value),
                            )
                          } else {
                            field.onBlur()
                          }
                        }}
                        ref={field.ref}
                        name={field.name}
                        error={error}
                        helpText={fieldConfig.helpText ?? undefined}
                        required={fieldConfig.required}
                        disabled={loadingOptionsByFieldName[fieldConfig.name]}
                      >
                        <option value="" disabled>
                          {loadingOptionsByFieldName[fieldConfig.name]
                            ? `Loading ${fieldConfig.label.toLowerCase()}...`
                            : `Select ${fieldConfig.label.toLowerCase()}`}
                        </option>
                        {selectOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </SelectGroup>
                    )
                  }

                  return (
                    <InputGroup
                      label={fieldConfig.label}
                      value={field.value}
                      placeholder={fieldConfig.placeholder}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        clearTransientState()
                        field.onChange(event)
                      }}
                      onBlur={(event: FocusEvent<HTMLInputElement>) => {
                        const value = fieldConfig.normalize
                          ? fieldConfig.normalize(event.target.value)
                          : event.target.value

                        if (fieldConfig.normalize) {
                          field.onChange(value)
                        } else {
                          field.onBlur()
                        }

                        loadSelectOptions({
                          ...getValues(),
                          [fieldConfig.name]: value,
                        })
                      }}
                      ref={field.ref}
                      name={field.name}
                      type={fieldConfig.type ?? 'text'}
                      error={error}
                      helpText={fieldConfig.helpText ?? undefined}
                      required={fieldConfig.required}
                    />
                  )
                }}
              />
            ))}

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap sm:flex-nowrap">
                <span className="m-auto rounded-md shadow-xs sm:mr-auto sm:ml-3">
                  <DocsButton page={docsPage} />
                </span>
                <div className="m-auto mt-3 flex xs:mt-0 sm:m-0 sm:justify-end">
                  <TestingButton
                    type="button"
                    buttonType="success"
                    onClick={performTest}
                    className="ml-3"
                    disabled={testing || isGoingToRemove}
                    isPending={testing}
                    feedbackStatus={testFeedbackStatus}
                  />
                  <span className="ml-3 inline-flex rounded-md shadow-xs">
                    <SaveButton
                      type="submit"
                      disabled={!canSave}
                      isPending={isSubmitting}
                    />
                  </span>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default ExternalServiceSettingsPage
