import axios from 'axios'

const looksLikeTlsMismatch = (text: string) => {
  const lower = text.toLowerCase()

  return (
    lower.includes('eproto') ||
    lower.includes('ssl routines') ||
    lower.includes('wrong version number') ||
    lower.includes('packet length too long') ||
    lower.includes('tls')
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
  fallback = 'Connection test failed. Verify URL and credentials.',
) => {
  if (!message || message.trim().length === 0) {
    return fallback
  }

  if (message === 'Failure' || message === 'Unknown error' || message === '0') {
    return fallback
  }

  if (looksLikeTlsMismatch(message)) {
    return 'SSL/TLS handshake failed. Verify the URL protocol (http vs https) and SSL setup.'
  }

  if (looksLikeConnectionRefused(message)) {
    return 'Connection refused. Verify host, port, and that the service is running.'
  }

  if (looksLikeHostResolutionError(message)) {
    return 'Unable to resolve host. Verify the hostname or IP address.'
  }

  if (looksLikeTimeout(message)) {
    return 'Connection timed out after 10 seconds. Verify URL and network reachability.'
  }

  return message
}

export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Connection test failed. Verify URL and credentials.',
) => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as
      | { message?: string }
      | undefined

    const bestMessage =
      responseData?.message ??
      error.message ??
      (error.code ? `Request failed (${error.code})` : undefined)

    return normalizeConnectionErrorMessage(bestMessage, fallback)
  }

  if (error instanceof Error) {
    return normalizeConnectionErrorMessage(error.message, fallback)
  }

  return fallback
}
