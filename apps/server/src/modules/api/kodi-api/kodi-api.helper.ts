import axios, { type AxiosInstance } from 'axios';
import { applyHttpRetry } from '../lib/httpRetry';

interface KodiApiOptions {
  url: string;
  username: string;
  password: string;
  timeout?: number;
}

/**
 * A JSON-RPC error returned by Kodi. Kodi answers an RPC-level failure with
 * HTTP 200 and an `{ error: { code, message } }` body, so this is distinct from
 * an AxiosError (which carries HTTP transport failures like 401/5xx/network).
 * The numeric `code` is preserved so callers can distinguish "definitely not
 * found" (-32602 Invalid params) from other failures — see
 * KodiAdapterService.itemExists.
 */
export class KodiRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'KodiRpcError';
  }
}

interface KodiRpcEnvelope<T> {
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Thin JSON-RPC client for a user-configured Kodi server. Mirrors the helper
 * pattern used by the Emby/Tautulli adapters (HTTP-client construction lives in
 * `modules/api/<server>/` rather than inside the media-server adapter).
 *
 * Kodi's only remote-control transport is JSON-RPC over HTTP POST to /jsonrpc,
 * authenticated with HTTP Basic credentials (there is no API key). Every method
 * is a POST, so axios-retry's default idempotent-only policy will not retry
 * them; that is acceptable — the adapter's read contracts degrade safely and
 * itemExists rethrows transient failures rather than treating them as "gone".
 *
 * Maintainerr is intentionally self-hosted: the URL handed in here is whatever
 * the user typed into the Kodi settings page (LAN host, ULA, public DNS).
 */
export class KodiApi {
  readonly axios: AxiosInstance;
  private rpcId = 0;

  constructor(options: KodiApiOptions) {
    let baseURL = options.url;
    while (baseURL.endsWith('/')) baseURL = baseURL.slice(0, -1);

    this.axios = axios.create({
      baseURL,
      timeout: options.timeout ?? 30000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      auth: { username: options.username, password: options.password },
    });

    applyHttpRetry(this.axios);
  }

  /**
   * Issue a single JSON-RPC call and return its `result`. Throws KodiRpcError
   * for an RPC-level error body and the underlying AxiosError for HTTP/network
   * failures.
   */
  async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const { data } = await this.axios.post<KodiRpcEnvelope<T>>('/jsonrpc', {
      jsonrpc: '2.0',
      method,
      ...(params ? { params } : {}),
      id: ++this.rpcId,
    });

    if (data.error) {
      throw new KodiRpcError(data.error.code, data.error.message);
    }
    return data.result as T;
  }
}
