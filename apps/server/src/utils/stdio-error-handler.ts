type ErrorListenableStream = Pick<NodeJS.WritableStream, 'on'>;

const handledStreams = new WeakSet<object>();

const isBrokenPipeError = (
  error: unknown,
): error is NodeJS.ErrnoException & Error => {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as NodeJS.ErrnoException).code === 'EPIPE'
  );
};

const rethrowUnexpectedError = (error: Error): never => {
  throw error;
};

export const createStdioErrorHandler = (
  onUnexpectedError: (error: Error) => void = rethrowUnexpectedError,
) => {
  return (error: unknown): void => {
    if (isBrokenPipeError(error)) {
      return;
    }

    onUnexpectedError(
      error instanceof Error ? error : new Error(String(error)),
    );
  };
};

export const attachStdioErrorHandler = (
  stream: ErrorListenableStream,
  onUnexpectedError?: (error: Error) => void,
): void => {
  const streamKey = stream as object;
  if (handledStreams.has(streamKey)) {
    return;
  }

  stream.on('error', createStdioErrorHandler(onUnexpectedError));
  handledStreams.add(streamKey);
};

export const attachProcessStdioErrorHandlers = (): void => {
  attachStdioErrorHandler(process.stdout);
  attachStdioErrorHandler(process.stderr);
};
