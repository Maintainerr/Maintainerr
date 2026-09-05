import { stripTrailingSlashes } from '@maintainerr/contracts';
import axios, { type AxiosInstance } from 'axios';
import { applyHttpRetry } from '../lib/httpRetry';
import { MEDIA_SERVER_REQUEST_TIMEOUT_MS } from '../lib/httpTimeouts';

interface EmbyApiOptions {
  url: string;
  apiKey?: string;
  authHeader: string;
  timeout?: number;
  extraHeaders?: Record<string, string>;
}

/**
 * Thin wrapper around `axios.create` for talking to a user-configured Emby
 * server. Mirrors the helper pattern used elsewhere in this repo (e.g.
 * `apps/server/src/modules/api/tautulli-api/helpers/tautulli-api.helper.ts`)
 * so HTTP-client construction lives in `modules/api/<server>/` rather than
 * inside the media-server adapter.
 *
 * Maintainerr is intentionally self-hosted: the URL handed in here is the
 * URL the user typed into the Emby settings page (LAN host, ULA, link-local,
 * or public DNS as the user chooses). The same data flow exists for the Plex
 * and Jellyfin adapters; theirs route through external SDKs so the analysis
 * boundary differs.
 */
export class EmbyApi {
  readonly axios: AxiosInstance;

  constructor(options: EmbyApiOptions) {
    // Rows saved before the schema stripped trailing slashes (#3422) can
    // still hold one, and Emby 404s routes reached through a double slash.
    const baseURL = stripTrailingSlashes(options.url);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Emby-Authorization': options.authHeader,
      ...options.extraHeaders,
    };
    if (options.apiKey) {
      headers['X-Emby-Token'] = options.apiKey;
      headers['X-MediaBrowser-Token'] = options.apiKey;
    }

    this.axios = axios.create({
      baseURL,
      timeout: options.timeout ?? MEDIA_SERVER_REQUEST_TIMEOUT_MS,
      headers,
    });

    // Retry transient failures with exponential backoff, like every other
    // outbound client.
    applyHttpRetry(this.axios);
  }
}
