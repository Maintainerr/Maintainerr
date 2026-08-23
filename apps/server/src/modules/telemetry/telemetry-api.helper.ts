import { TelemetryPing } from '@maintainerr/contracts';
import { ExternalApiService } from '../api/external-api/external-api.service';
import { MaintainerrLogger } from '../logging/logs.service';

const DEFAULT_TELEMETRY_URL = 'https://telemetry.maintainerr.info';
const REQUEST_TIMEOUT_MS = 5000;

export class TelemetryApi extends ExternalApiService {
  constructor(protected readonly logger: MaintainerrLogger) {
    super(process.env.TELEMETRY_URL || DEFAULT_TELEMETRY_URL, {}, logger);
  }

  /**
   * ExternalApiService installs axios-retry globally; disabling it per request
   * is what keeps delivery at-most-once. A retry after a lost response would
   * count the same server twice and the census has no identifier to
   * de-duplicate on.
   */
  public sendPing(ping: TelemetryPing) {
    return this.post('/v1/ingest', ping, {
      timeout: REQUEST_TIMEOUT_MS,
      'axios-retry': { retries: 0 },
    });
  }
}
