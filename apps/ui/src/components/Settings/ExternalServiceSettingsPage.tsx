import { useLingui } from '@lingui/react/macro'
import { BasicResponseDto } from '@maintainerr/contracts'
import {
  type ChangeEvent,
  type FocusEvent,
  type JSX,
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
import SaveButton from '../Common/SaveButton'
import TestingButton from '../Common/TestingButton'
import { InputGroup } from '../Forms/Input'
import { SelectGroup } from '../Forms/Select'
import ServiceCard, { ServiceCardFooter } from './ServiceCard'
import {
  type SettingsFeedback,
  useSettingsFeedback,
} from './useSettingsFeedback'
import { releaseVersion } from '../../utils/version'

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
  // A function receives the current form values, so a field can point at the
  // service the user is configuring rather than at generic documentation.
  helpText?:
    JSX.Element | string | ((values: SettingsValues) => JSX.Element | string)
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
  // Whole sentences rather than a scope noun: see useSettingsFeedback.
  updateErrorMessage: string
  pageTitle: string
  serviceName: string
  settingsPath: string
  testPath: string
  schema: z.ZodTypeAny
  fields: ExternalServiceFieldConfig[]
  testFailureMessage: string
}

// Selects are resolved for the user and can be hidden, so one holding a value
// must not stop a cleared form from counting as a removal.
const allEmpty = (
  values: SettingsValues,
  fields: ExternalServiceFieldConfig[],
) =>
  fields
    .filter((field) => field.type !== 'select')
    .every((field) => (values[field.name] ?? '') === '')

// An unchosen select is '' in the form but "not provided" to the API, and a
// schema that accepts an optional id still rejects an empty string. The field
// is hidden whenever the backend can resolve the value itself, so this is the
// normal path rather than an edge case.
const withoutEmptySelects = (
  values: SettingsValues,
  fields: ExternalServiceFieldConfig[],
): SettingsValues => {
  const emptySelects = new Set(
    fields
      .filter((field) => field.type === 'select')
      .map((field) => field.name),
  )
  return Object.fromEntries(
    Object.entries(values).filter(
      ([name, value]) => !(emptySelects.has(name) && value === ''),
    ),
  )
}

const valuesEqual = (a: SettingsValues, b: SettingsValues): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((key) => a[key] === b[key])

const ExternalServiceSettingsPage = ({
  updateErrorMessage,
  pageTitle,
  serviceName,
  settingsPath,
  testPath,
  schema,
  fields,
  testFailureMessage,
}: ExternalServiceSettingsPageProps) => {
  const { t } = useLingui()
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
  const { feedback, showUpdated, showUpdateError, showError, clear } =
    useSettingsFeedback({
      updated: t`Saved`,
      updateError: updateErrorMessage,
    })

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
    clear()
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
    // State, not just the ref: a field left mounted by a load error repaints
    // its placeholder while the retry runs, and only state triggers that.
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
          message: getApiErrorMessage(error, t`Failed to load options.`),
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

    const result = schema.safeParse(withoutEmptySelects(values, fields))

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
    const data = withoutEmptySelects(getValues(), fields)

    clear()

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
        return
      }

      // Most services answer a bare "Failed", which says less than the scoped
      // message; only a specific one is worth showing instead.
      const reason = normalizeConnectionErrorMessage(response.message, '')
      if (reason) {
        showError(reason)
      } else {
        showUpdateError()
      }
    } catch {
      showUpdateError()
    }
  }

  const performTest = async () => {
    const values = withoutEmptySelects(getValues(), fields)

    if (testing || !validateValues(values)) {
      return
    }

    clear()
    setTestResult(undefined)
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

  const status: SettingsFeedback =
    feedback ??
    (testResult
      ? {
          type: testResult.status ? 'success' : 'error',
          title: testResult.status
            ? t`Success! (${{ version: releaseVersion(testResult.message) }})`
            : testResult.message,
        }
      : null)

  return (
    <>
      <title>{pageTitle}</title>
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
        <ServiceCard title={serviceName}>
          <form
            className="flex flex-1 flex-col gap-3"
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

                    // One candidate is not a choice: the backend resolves that
                    // case itself, so the field would only ask the user to
                    // confirm something that cannot vary. It stays hidden while
                    // the options load as well, since appearing and then
                    // vanishing reads as a glitch. An error is the exception,
                    // because it would otherwise have nowhere to appear.
                    const optionsLoaded =
                      loadedOptionsByFieldName[fieldConfig.name] !== undefined
                    if (
                      !error &&
                      (!optionsLoaded || selectOptions.length < 2)
                    ) {
                      return <></>
                    }

                    return (
                      <SelectGroup
                        layout="stacked"
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
                        helpText={
                          typeof fieldConfig.helpText === 'function'
                            ? fieldConfig.helpText(currentValues)
                            : (fieldConfig.helpText ?? undefined)
                        }
                        required={fieldConfig.required}
                        disabled={loadingOptionsByFieldName[fieldConfig.name]}
                      >
                        {/* A load error keeps this field mounted (see the
                            guard above) without ever filling
                            loadedOptionsByFieldName, so focusing it starts a
                            real retry on a visible select - that is when this
                            loading placeholder is on screen. */}
                        <option value="" disabled>
                          {loadingOptionsByFieldName[fieldConfig.name]
                            ? t`Loading...`
                            : t`Select an option`}
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
                      layout="stacked"
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
                      helpText={
                        typeof fieldConfig.helpText === 'function'
                          ? fieldConfig.helpText(currentValues)
                          : (fieldConfig.helpText ?? undefined)
                      }
                      required={fieldConfig.required}
                    />
                  )
                }}
              />
            ))}

            <ServiceCardFooter status={status}>
              <TestingButton
                type="button"
                buttonType="success"
                onClick={performTest}
                disabled={testing || isGoingToRemove}
                isPending={testing}
                feedbackStatus={testFeedbackStatus}
              />
              <SaveButton
                type="submit"
                disabled={!canSave}
                isPending={isSubmitting}
              />
            </ServiceCardFooter>
          </form>
        </ServiceCard>
      </div>
    </>
  )
}

export default ExternalServiceSettingsPage
