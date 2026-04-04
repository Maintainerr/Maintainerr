import { BasicResponseDto } from '@maintainerr/contracts'
import {
  type ChangeEvent,
  type FocusEvent,
  type JSX,
  type ReactNode,
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
import SettingsAlertSlot from './SettingsAlertSlot'
import { useSettingsFeedback } from './useSettingsFeedback'

interface UrlApiKeySettingsValues {
  url: string
  api_key: string
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
  docsPage: string
  settingsPath: string
  testPath: string
  schema: z.ZodTypeAny
  urlPlaceholder: string
  urlHelpText?: JSX.Element | string
  testSuccessTitle: string
  testFailureMessage: string
  normalizeUrl?: (url: string) => string
}

const identity = (value: string) => value

const ExternalServiceSettingsPage = ({
  scope,
  pageTitle,
  heading,
  description,
  docsPage,
  settingsPath,
  testPath,
  schema,
  urlPlaceholder,
  urlHelpText,
  testSuccessTitle,
  testFailureMessage,
  normalizeUrl = identity,
}: ExternalServiceSettingsPageProps) => {
  const [testedSettings, setTestedSettings] =
    useState<UrlApiKeySettingsValues>()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestStatus>()
  const { feedback, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback(scope)

  const {
    register,
    control,
    clearErrors,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting, isLoading, defaultValues },
  } = useForm<UrlApiKeySettingsValues>({
    defaultValues: async () => {
      const response =
        await GetApiHandler<UrlApiKeySettingsValues>(settingsPath)

      return {
        url: response.url ?? '',
        api_key: response.api_key ?? '',
      }
    },
  })

  const url = useWatch({ control, name: 'url' }) ?? ''
  const apiKey = useWatch({ control, name: 'api_key' }) ?? ''

  const isGoingToRemove = url === '' && apiKey === ''
  const hasChanges =
    url !== defaultValues?.url || apiKey !== defaultValues?.api_key
  const requiresRetest = hasChanges && !isGoingToRemove
  const testFeedbackStatus =
    url === testedSettings?.url && apiKey === testedSettings?.api_key
      ? testResult?.status
      : undefined
  const canSave =
    hasChanges &&
    !isSubmitting &&
    !isLoading &&
    (isGoingToRemove || testFeedbackStatus === true)

  const clearTransientState = () => {
    clearError()
    clearErrors()
    setTestResult(undefined)
  }

  const validateValues = (values: UrlApiKeySettingsValues) => {
    if (values.url === '' && values.api_key === '') {
      clearErrors()
      return true
    }

    const result = schema.safeParse(values)

    if (result.success) {
      clearErrors()
      return true
    }

    clearErrors()

    result.error.issues.forEach((issue) => {
      const fieldName = issue.path[0]

      if (fieldName === 'url' || fieldName === 'api_key') {
        setError(fieldName, {
          type: 'manual',
          message: issue.message,
        })
      }
    })

    return false
  }

  const registerApiKey = register('api_key', {
    onChange: () => {
      clearTransientState()
    },
  })

  const onSubmit = async () => {
    const data = getValues()

    clearError()

    const removingSetting = data.api_key === '' && data.url === ''

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

    await PostApiHandler<BasicResponseDto>(testPath, {
      api_key: values.api_key,
      url: values.url,
    } satisfies UrlApiKeySettingsValues)
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
          {feedback || testResult ? (
            <div className="space-y-4">
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
            <Controller
              name="url"
              defaultValue=""
              control={control}
              render={({ field }) => (
                <InputGroup
                  label="URL"
                  value={field.value}
                  placeholder={urlPlaceholder}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    clearTransientState()
                    field.onChange(event)
                  }}
                  onBlur={(event: FocusEvent<HTMLInputElement>) =>
                    field.onChange(normalizeUrl(event.target.value))
                  }
                  ref={field.ref}
                  name={field.name}
                  type="text"
                  error={errors.url?.message}
                  helpText={urlHelpText ?? undefined}
                  required
                />
              )}
            />

            <InputGroup
              label="API key"
              type="password"
              {...registerApiKey}
              error={errors.api_key?.message}
            />

            <div className="actions mt-5 w-full">
              <div className="flex w-full flex-wrap sm:flex-nowrap">
                <span className="m-auto rounded-md shadow-sm sm:ml-3 sm:mr-auto">
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
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <SaveButton
                      type="submit"
                      disabled={!canSave}
                      isPending={isSubmitting}
                      title={
                        requiresRetest && testFeedbackStatus !== true
                          ? 'Test the connection before saving changes.'
                          : undefined
                      }
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
