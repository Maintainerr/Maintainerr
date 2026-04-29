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
  onNonEpipeError: (error: Error) => void = rethrowUnexpectedError,
) => {
  return (error: unknown): void => {
    if (isBrokenPipeError(error)) {
      return;
    }

    onNonEpipeError(
      error instanceof Error ? error : new Error(String(error)),
    );
  };
};

export const attachStdioErrorHandler = (
  stream: ErrorListenableStream,
  onNonEpipeError?: (error: Error) => void,
): void => {
  if (handledStreams.has(stream as object)) {
    return;
  }

  stream.on('error', createStdioErrorHandler(onNonEpipeError));
  handledStreams.add(stream as object);
};

export const attachProcessStdioErrorHandlers = (): void => {
  attachStdioErrorHandler(process.stdout);
  attachStdioErrorHandler(process.stderr);
};
