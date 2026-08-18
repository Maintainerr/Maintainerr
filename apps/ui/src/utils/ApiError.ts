import { t } from '@lingui/core/macro'
import axios from 'axios'

type ApiValidationIssue = {
  message?: string
  path?: Array<string | number>
}

type ApiErrorResponse = {
  message?: string | string[]
  errors?: ApiValidationIssue[]
}

const formatValidationPath = (path: Array<string | number> | undefined) => {
  // A path token beside untranslated segment names ("settings.url"), so it
  // stays English like the rest of the path vocabulary.
  if (!path || path.length === 0) {
    return 'request'
  }

  return path.reduce((accumulator, segment) => {
    if (typeof segment === 'number') {
      return `${accumulator}[${segment}]`
    }

    return accumulator ? `${accumulator}.${segment}` : segment
  }, '')
}

const formatValidationMessage = (issues: ApiValidationIssue[] | undefined) => {
  if (!issues || issues.length === 0) {
    return undefined
  }

  return issues
    .slice(0, 3)
    .map((issue) => {
      const field = formatValidationPath(issue.path)
      const reason = issue.message ?? t`Invalid value`
      // Punctuation and two values, no words: nothing for a translator to do,
      // and a message they could accidentally break.
      return `${field}: ${reason}`
    })
    .join('; ')
}

const looksLikeTlsMismatch = (text: string) => {
  const lower = text.toLowerCase()

  return (
    lower.includes('eproto') ||
    lower.includes('ssl routines') ||
    lower.includes('wrong version number') ||
    lower.includes('packet length too long') ||
    lower.includes('tlsv1 alert')
  )
}

const looksLikeTimeout = (text: string) => {
  const lower = text.toLowerCase()
  return lower.includes('timeout') || lower.includes('aborted')
}

const looksLikeConnectionRefused = (text: string) => {
  const lower = text.toLowerCase()
  return lower.includes('econnrefused') || lower.includes('connection refused')
}

const looksLikeHostResolutionError = (text: string) => {
  const lower = text.toLowerCase()
  return (
    lower.includes('enotfound') ||
    lower.includes('eai_again') ||
    lower.includes('name does not resolve')
  )
}

export const normalizeConnectionErrorMessage = (
  message: string | undefined,
  fallback = t`Connection test failed. Verify URL and credentials.`,
) => {
  if (!message || message.trim().length === 0) {
    return fallback
  }

  if (
    message === 'Failure' ||
    message === 'Failed' ||
    message === 'Unknown error'
  ) {
    return fallback
  }

  if (looksLikeTlsMismatch(message)) {
    return t`SSL/TLS handshake failed. Verify the URL protocol (http vs https) and SSL configuration.`
  }

  if (looksLikeConnectionRefused(message)) {
    return t`Connection refused. Verify host, port, and that the service is running.`
  }

  if (looksLikeHostResolutionError(message)) {
    return t`Unable to resolve host. Verify hostname or IP address.`
  }

  if (looksLikeTimeout(message)) {
    return t`Connection timed out after 5 seconds. Verify URL and network reachability.`
  }

  return message
}

export const getApiErrorMessage = (
  error: unknown,
  fallback = t`Connection test failed. Verify URL and credentials.`,
) => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as ApiErrorResponse | undefined
    const validationMessage = formatValidationMessage(responseData?.errors)

    if (validationMessage) {
      return t`Validation failed: ${{ validationMessage }}`
    }

    const rawMessage = responseData?.message
    const normalizedMessage = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : rawMessage

    // Nothing keyed off error.code: axios always populates message, so such a
    // branch would be unreachable.
    //
    // Deliberately not `||`: a response that carries an empty message must
    // keep that empty string, so normalizeConnectionErrorMessage answers with
    // the caller's own scoped fallback. Falling through to axios's generic
    // "Request failed with status code 500" would replace a translated,
    // specific sentence with untranslated boilerplate.
    const bestMessage =
      normalizedMessage === undefined ? error.message : normalizedMessage

    return normalizeConnectionErrorMessage(bestMessage, fallback)
  }

  if (error instanceof Error) {
    return normalizeConnectionErrorMessage(error.message, fallback)
  }

  return fallback
}
