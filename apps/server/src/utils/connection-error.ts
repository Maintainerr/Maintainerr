import { AxiosError } from 'axios';
import type { MaintainerrLogger } from '../modules/logging/logs.service';

const normalizeMessageText = (message?: string): string | undefined => {
  if (!message) {
    return undefined;
  }

  const lower = message.toLowerCase();

  if (
    lower.includes('eproto') ||
    lower.includes('ssl routines') ||
    lower.includes('wrong version number') ||
    lower.includes('packet length too long') ||
    lower.includes('tlsv1 alert')
  ) {
    return 'SSL/TLS handshake failed. Verify the URL protocol (http vs https) and SSL configuration.';
  }

  if (lower.includes('econnrefused') || lower.includes('connection refused')) {
    return 'Connection refused. Verify host, port, and that the service is running.';
  }

  if (
    lower.includes('enotfound') ||
    lower.includes('eai_again') ||
    lower.includes('name does not resolve')
  ) {
    return 'Unable to resolve host. Verify hostname or IP address.';
  }

  if (
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('econnaborted')
  ) {
    return 'Connection timed out after 10 seconds. Verify URL and network reachability.';
  }

  return undefined;
};

export const formatConnectionFailureMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof AxiosError) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      return 'Invalid API key';
    }

    if (error.response?.status) {
      return `Connection failed: received response ${error.response.status} ${error.response.statusText}.`;
    }

    const normalizedAxiosMessage = normalizeMessageText(
      error.code === 'ECONNABORTED' ? 'timeout' : error.message,
    );
    if (normalizedAxiosMessage) {
      return normalizedAxiosMessage;
    }
  }

  const genericMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : undefined;

  const normalizedGenericMessage = normalizeMessageText(genericMessage);
  if (normalizedGenericMessage) {
    return normalizedGenericMessage;
  }

  return fallbackMessage;
};

export const logConnectionTestError = (
  logger: MaintainerrLogger,
  serviceName: string,
  error: unknown,
) => {
  if (error instanceof Error) {
    logger.error(
      `${serviceName} connection test failed: ${error.message}`,
      error.stack,
    );
    return;
  }

  logger.error(`${serviceName} connection test failed: ${String(error)}`);
};
