import { PostApiHandler } from './ApiHandler'

export const logClientError = (
  message: string,
  error: unknown,
  context: string,
) => {
  const details = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  return PostApiHandler('/logs/client-error', {
    message,
    details,
    stack,
    context,
  })
}
